"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.initVapid = initVapid;
exports.getVapidPublicKey = getVapidPublicKey;
exports.saveSubscription = saveSubscription;
exports.removeSubscription = removeSubscription;
exports.sendPushToUser = sendPushToUser;
exports.dispatchPushForMessage = dispatchPushForMessage;
const webpush = __importStar(require("web-push"));
const uuid_1 = require("uuid");
const index_js_1 = require("../database/index.js");
let vapidConfigured = false;
function initVapid() {
    if (vapidConfigured)
        return;
    let publicKey = process.env.VAPID_PUBLIC_KEY || (0, index_js_1.getSettingValue)('vapid_public_key', '');
    let privateKey = process.env.VAPID_PRIVATE_KEY || (0, index_js_1.getSettingValue)('vapid_private_key', '');
    let subject = process.env.VAPID_SUBJECT || (0, index_js_1.getSettingValue)('vapid_subject', '') || 'mailto:support@xmessenger.app';
    // Apple APNs strictly rejects .local or localhost contact domains with BadJwtToken
    if (subject.includes('.local') || subject.includes('localhost') || !subject.startsWith('mailto:')) {
        subject = 'mailto:support@xmessenger.app';
        (0, index_js_1.updateSettingValue)('vapid_subject', subject);
    }
    if (!publicKey || !privateKey) {
        console.log('[Push] Generating new VAPID keys for Web Push...');
        const keys = webpush.generateVAPIDKeys();
        publicKey = keys.publicKey;
        privateKey = keys.privateKey;
        (0, index_js_1.updateSettingValue)('vapid_public_key', publicKey);
        (0, index_js_1.updateSettingValue)('vapid_private_key', privateKey);
        (0, index_js_1.updateSettingValue)('vapid_subject', subject);
        console.log('[Push] VAPID keys generated and persisted successfully.');
    }
    try {
        webpush.setVapidDetails(subject, publicKey, privateKey);
        vapidConfigured = true;
        console.log('[Push] Web Push initialized with VAPID subject:', subject);
    }
    catch (err) {
        console.error('[Push] Failed to configure VAPID details:', err);
    }
}
function getVapidPublicKey() {
    initVapid();
    return process.env.VAPID_PUBLIC_KEY || (0, index_js_1.getSettingValue)('vapid_public_key', '');
}
function saveSubscription(userId, subscription, userAgent) {
    const { endpoint, keys } = subscription;
    if (!endpoint || typeof endpoint !== 'string' || !keys || !keys.p256dh || !keys.auth) {
        throw new Error('INVALID_SUBSCRIPTION');
    }
    // Strict URL validation: must be an HTTPS push endpoint
    if (!endpoint.startsWith('https://') || endpoint.length > 8192) {
        throw new Error('INVALID_ENDPOINT');
    }
    const existing = index_js_1.db.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
    const now = new Date().toISOString();
    if (existing) {
        index_js_1.db.prepare(`
      UPDATE push_subscriptions
      SET user_id = ?, p256dh = ?, auth = ?, user_agent = ?, created_at = ?
      WHERE endpoint = ?
    `).run(userId, keys.p256dh, keys.auth, userAgent || '', now, endpoint);
    }
    else {
        const id = (0, uuid_1.v4)();
        index_js_1.db.prepare(`
      INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, endpoint, keys.p256dh, keys.auth, userAgent || '', now);
    }
}
function removeSubscription(endpoint, userId) {
    if (!endpoint)
        return;
    if (userId) {
        index_js_1.db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, userId);
    }
    else {
        index_js_1.db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
    }
}
async function sendPushToUser(userId, payload) {
    initVapid();
    const subscriptions = index_js_1.db.prepare(`
    SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?
  `).all(userId);
    if (!subscriptions || subscriptions.length === 0) {
        return;
    }
    const stringified = JSON.stringify(payload);
    // High urgency is mandatory for Apple APNs (iOS 16.4+) to wake device & deliver immediately
    const pushOptions = {
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
        }
        catch (err) {
            if (err.statusCode === 410 || err.statusCode === 404) {
                // Subscription is no longer valid or unsubscribed by browser
                removeSubscription(sub.endpoint);
            }
            else {
                console.warn(`[Push] Failed to send push to ${sub.endpoint.substring(0, 30)}...:`, err.message);
            }
        }
    }
}
async function dispatchPushForMessage(sender, recipientId, rawText) {
    try {
        // Check recipient exists and is active (Hub-and-Spoke security isolation)
        const recipient = index_js_1.db.prepare('SELECT id, status FROM users WHERE id = ?').get(recipientId);
        if (!recipient || recipient.status !== 'active') {
            return;
        }
        const appName = (0, index_js_1.getSettingValue)('app_name', 'XMessenger');
        const pwaIconUrl = (0, index_js_1.getSettingValue)('pwa_icon_url', '');
        const senderTitle = sender.role === 'admin'
            ? appName
            : sender.username;
        let preview = rawText.trim();
        if (preview.startsWith('[image:')) {
            const match = preview.match(/^\[image:(.+?)\](?:\n([\s\S]*))?$/);
            const caption = match && match[2] ? match[2].trim() : '';
            preview = caption ? `📷 ${caption}` : '📷 تصویر جدید';
        }
        if (preview.length > 100) {
            preview = preview.substring(0, 97) + '...';
        }
        await sendPushToUser(recipientId, {
            title: senderTitle,
            body: preview,
            icon: pwaIconUrl || '/icon-192.png',
            badge: '/icon-192.png',
            tag: `msg-${sender.id}`,
            data: {
                url: '/',
                senderId: sender.id
            }
        });
    }
    catch (err) {
        console.warn('[Push] Error dispatching push notification for message:', err);
    }
}
