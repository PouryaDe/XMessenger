import { api } from './api.js';

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isIosDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

// On iOS, Web Push is ONLY supported when added to Home Screen as a standalone PWA (iOS 16.4+)
export function isIosRequiringPwa(): boolean {
  return isIosDevice() && !isStandalonePwa();
}

export function getPushPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch (err) {
    console.warn('[Push] Error getting current subscription:', err);
    return null;
  }
}

export async function subscribeToPush(): Promise<{ success: boolean; error?: string }> {
  if (!isPushSupported()) {
    if (isIosRequiringPwa()) {
      return { success: false, error: 'IOS_PWA_REQUIRED' };
    }
    return { success: false, error: 'PUSH_UNSUPPORTED' };
  }

  try {
    // 1. Request user permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'PERMISSION_DENIED' };
    }

    // 2. Fetch VAPID public key from backend
    const { publicKey } = await api.getVapidPublicKey();
    if (!publicKey) {
      return { success: false, error: 'VAPID_KEY_MISSING' };
    }

    // 3. Subscribe with PushManager
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    // If an existing subscription with different key exists, unsubscribe first
    if (subscription) {
      try {
        await subscription.unsubscribe();
      } catch (_) {}
    }

    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    // 4. Save subscription to backend SQLite database
    await api.savePushSubscription(subscription.toJSON());

    return { success: true };
  } catch (err: any) {
    console.error('[Push] Subscription failed:', err);
    return { success: false, error: err.message || 'SUBSCRIPTION_FAILED' };
  }
}

export async function unsubscribeFromPush(): Promise<{ success: boolean; error?: string }> {
  if (!isPushSupported()) return { success: true };

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await api.removePushSubscription(endpoint);
    }

    return { success: true };
  } catch (err: any) {
    console.error('[Push] Unsubscribe failed:', err);
    return { success: false, error: err.message };
  }
}

export async function sendTestNotification(): Promise<boolean> {
  try {
    await api.sendTestPush();
    return true;
  } catch (err) {
    console.error('[Push] Test push failed:', err);
    return false;
  }
}
