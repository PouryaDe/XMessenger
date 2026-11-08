"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushRouter = void 0;
const express_1 = require("express");
const auth_js_1 = require("../middleware/auth.js");
const pushService_js_1 = require("../services/pushService.js");
const index_js_1 = require("../database/index.js");
exports.pushRouter = (0, express_1.Router)();
// Public endpoint to fetch VAPID public key
exports.pushRouter.get('/vapid-public-key', (_req, res) => {
    try {
        const publicKey = (0, pushService_js_1.getVapidPublicKey)();
        res.json({ publicKey });
    }
    catch (err) {
        console.error('Error getting VAPID public key:', err);
        res.status(500).json({ error: 'VAPID_ERROR', message: 'Failed to retrieve VAPID key' });
    }
});
// Authenticated push endpoints
exports.pushRouter.use(auth_js_1.authenticate);
// Get current user push subscription status
exports.pushRouter.get('/status', (req, res) => {
    try {
        const userId = req.user.id;
        const row = index_js_1.db.prepare('SELECT COUNT(*) as count FROM push_subscriptions WHERE user_id = ?').get(userId);
        res.json({
            subscribed: row.count > 0,
            activeDevices: row.count
        });
    }
    catch (err) {
        res.status(500).json({ error: 'DB_ERROR', message: err.message });
    }
});
// Save or update subscription
exports.pushRouter.post('/subscribe', (req, res) => {
    try {
        const userId = req.user.id;
        const { subscription } = req.body;
        if (!subscription || !subscription.endpoint || !subscription.keys) {
            return res.status(400).json({ error: 'INVALID_SUBSCRIPTION', message: 'Valid push subscription object required' });
        }
        const userAgent = req.headers['user-agent'] || '';
        (0, pushService_js_1.saveSubscription)(userId, subscription, userAgent);
        res.json({ success: true, message: 'Push subscription saved' });
    }
    catch (err) {
        console.error('Error saving push subscription:', err);
        res.status(500).json({ error: 'SAVE_FAILED', message: err.message });
    }
});
// Unsubscribe
exports.pushRouter.post('/unsubscribe', (req, res) => {
    try {
        const { endpoint } = req.body;
        if (endpoint) {
            (0, pushService_js_1.removeSubscription)(endpoint);
        }
        res.json({ success: true, message: 'Unsubscribed successfully' });
    }
    catch (err) {
        res.status(500).json({ error: 'UNSUBSCRIBE_FAILED', message: err.message });
    }
});
// Send a test push notification to user's registered devices
exports.pushRouter.post('/test', async (req, res) => {
    try {
        const userId = req.user.id;
        const appName = (0, index_js_1.getSettingValue)('app_name', 'XMessenger');
        const pwaIconUrl = (0, index_js_1.getSettingValue)('pwa_icon_url', '');
        await (0, pushService_js_1.sendPushToUser)(userId, {
            title: `${appName} Test`,
            body: 'نوتیفیکیشن با موفقیت روی دستگاه شما فعال شد! 🎉',
            icon: pwaIconUrl || '/icon-192.png',
            badge: '/icon-192.png',
            silentIfFocused: false, // Show test notification regardless
            data: { url: '/' }
        });
        res.json({ success: true, message: 'Test notification sent' });
    }
    catch (err) {
        console.error('Error sending test push:', err);
        res.status(500).json({ error: 'PUSH_FAILED', message: err.message });
    }
});
