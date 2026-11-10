import * as webpush from 'web-push';
import { v4 as uuidv4 } from 'uuid';
import { db, getSettingValue, updateSettingValue } from '../database/index.js';

let vapidConfigured = false;

export function initVapid(): void {
  if (vapidConfigured) return;

  let publicKey = process.env.VAPID_PUBLIC_KEY || getSettingValue('vapid_public_key', '');
  let privateKey = process.env.VAPID_PRIVATE_KEY || getSettingValue('vapid_private_key', '');
  let subject = process.env.VAPID_SUBJECT || getSettingValue('vapid_subject', '') || 'mailto:support@xmessenger.app';

  // Apple APNs strictly rejects .local or localhost contact domains with BadJwtToken
  if (subject.includes('.local') || subject.includes('localhost') || !subject.startsWith('mailto:')) {
    subject = 'mailto:support@xmessenger.app';
    updateSettingValue('vapid_subject', subject);
  }

  if (!publicKey || !privateKey) {
    console.log('[Push] Generating new VAPID keys for Web Push...');
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    updateSettingValue('vapid_public_key', publicKey);
    updateSettingValue('vapid_private_key', privateKey);
    updateSettingValue('vapid_subject', subject);
    console.log('[Push] VAPID keys generated and persisted successfully.');
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
    console.log('[Push] Web Push initialized with VAPID subject:', subject);
  } catch (err) {
    console.error('[Push] Failed to configure VAPID details:', err);
  }
}

export function getVapidPublicKey(): string {
  initVapid();
  return process.env.VAPID_PUBLIC_KEY || getSettingValue('vapid_public_key', '');
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export function saveSubscription(userId: string, subscription: PushSubscriptionInput, userAgent?: string): void {
  const { endpoint, keys } = subscription;
  if (!endpoint || typeof endpoint !== 'string' || !keys || !keys.p256dh || !keys.auth) {
    throw new Error('INVALID_SUBSCRIPTION');
  }

  // Strict URL validation: must be an HTTPS push endpoint
  if (!endpoint.startsWith('https://') || endpoint.length > 8192) {
    throw new Error('INVALID_ENDPOINT');
  }

  const existing = db.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').get(endpoint) as { id: string } | undefined;
  const now = new Date().toISOString();

  if (existing) {
    db.prepare(`
      UPDATE push_subscriptions
      SET user_id = ?, p256dh = ?, auth = ?, user_agent = ?, created_at = ?
      WHERE endpoint = ?
    `).run(userId, keys.p256dh, keys.auth, userAgent || '', now, endpoint);
  } else {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, endpoint, keys.p256dh, keys.auth, userAgent || '', now);
  }
}

export function removeSubscription(endpoint: string, userId?: string): void {
  if (!endpoint) return;
  if (userId) {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, userId);
  } else {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  }
}

export async function sendPushToUser(
  userId: string,
  payload: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    data?: any;
    silentIfFocused?: boolean;
    tag?: string;
  }
): Promise<void> {
  initVapid();

  const subscriptions = db.prepare(`
    SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?
  `).all(userId) as Array<{ endpoint: string; p256dh: string; auth: string }>;

  if (!subscriptions || subscriptions.length === 0) {
    return;
  }

  const stringified = JSON.stringify(payload);

  // High urgency is mandatory for Apple APNs (iOS 16.4+) to wake device & deliver immediately
  const pushOptions: webpush.RequestOptions = {
    TTL: 86400,
    urgency: 'high',
    topic: 'messages'
  };

  for (const sub of subscriptions) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth
      }
    };

    try {
      await webpush.sendNotification(pushSubscription, stringified, pushOptions);
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Subscription is no longer valid or unsubscribed by browser
        removeSubscription(sub.endpoint);
      } else {
        console.warn(`[Push] Failed to send push to ${sub.endpoint.substring(0, 30)}...:`, err.message);
      }
    }
  }
}

export async function dispatchPushForMessage(
  sender: { id: string; username: string; role: string },
  recipientId: string,
  rawText: string
): Promise<void> {
  try {
    // Check recipient exists and is active (Hub-and-Spoke security isolation)
    const recipient = db.prepare('SELECT id, status FROM users WHERE id = ?').get(recipientId) as { id: string; status: string } | undefined;
    if (!recipient || recipient.status !== 'active') {
      return;
    }

    const appName = getSettingValue('app_name', 'XMessenger');
    const pwaIconUrl = getSettingValue('pwa_icon_url', '');

    const senderTitle = sender.role === 'admin' 
      ? appName 
      : sender.username;

    // Privacy-preserving notification body: never leak private chat content onto device lockscreens
    const notificationBody = 'شما یک پیام جدید دارید';

    await sendPushToUser(recipientId, {
      title: senderTitle,
      body: notificationBody,
      icon: pwaIconUrl || '/icon-192.png',
      badge: '/icon-192.png',
      tag: `msg-${sender.id}`,
      data: {
        url: '/',
        senderId: sender.id,
        type: 'chat'
      }
    });
  } catch (err) {
    console.warn('[Push] Error dispatching push notification for message:', err);
  }
}

export async function dispatchPushForChannelPost(postId: string): Promise<void> {
  try {
    const channelTitle = getSettingValue('channel_title', 'کانال اطلاع‌رسانی');
    const pwaIconUrl = getSettingValue('pwa_icon_url', '');

    // Select all active users (excluding admins who sent the post)
    const activeUsers = db.prepare("SELECT id FROM users WHERE status = 'active' AND role != 'admin'").all() as Array<{ id: string }>;
    if (!activeUsers || activeUsers.length === 0) {
      return;
    }

    const notificationBody = 'پست جدیدی در کانال اطلاع‌رسانی منتشر شد';

    for (const u of activeUsers) {
      sendPushToUser(u.id, {
        title: channelTitle,
        body: notificationBody,
        icon: pwaIconUrl || '/icon-192.png',
        badge: '/icon-192.png',
        tag: `channel-post-${postId}`,
        data: {
          url: '/?tab=channel',
          channelPostId: postId,
          type: 'channel'
        }
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('[Push] Error dispatching push notification for channel post:', err);
  }
}
