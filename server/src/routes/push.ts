import { Router } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { 
  getVapidPublicKey, 
  saveSubscription, 
  removeSubscription, 
  sendPushToUser 
} from '../services/pushService.js';
import { db, getSettingValue } from '../database/index.js';

export const pushRouter = Router();

// Public endpoint to fetch VAPID public key
pushRouter.get('/vapid-public-key', (_req, res) => {
  try {
    const publicKey = getVapidPublicKey();
    res.json({ publicKey });
  } catch (err: any) {
    console.error('Error getting VAPID public key:', err);
    res.status(500).json({ error: 'VAPID_ERROR', message: 'Failed to retrieve VAPID key' });
  }
});

// Authenticated push endpoints
pushRouter.use(authenticate);

// Get current user push subscription status
pushRouter.get('/status', (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const row = db.prepare('SELECT COUNT(*) as count FROM push_subscriptions WHERE user_id = ?').get(userId) as { count: number };
    res.json({
      subscribed: row.count > 0,
      activeDevices: row.count
    });
  } catch (err: any) {
    res.status(500).json({ error: 'DB_ERROR', message: err.message });
  }
});

// Save or update subscription
pushRouter.post('/subscribe', (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'INVALID_SUBSCRIPTION', message: 'Valid push subscription object required' });
    }

    const userAgent = req.headers['user-agent'] || '';
    saveSubscription(userId, subscription, userAgent);

    res.json({ success: true, message: 'Push subscription saved' });
  } catch (err: any) {
    console.error('Error saving push subscription:', err);
    res.status(500).json({ error: 'SAVE_FAILED', message: err.message });
  }
});

// Unsubscribe
pushRouter.post('/unsubscribe', (req: AuthenticatedRequest, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      removeSubscription(endpoint);
    }
    res.json({ success: true, message: 'Unsubscribed successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'UNSUBSCRIBE_FAILED', message: err.message });
  }
});

// Send a test push notification to user's registered devices
pushRouter.post('/test', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const appName = getSettingValue('app_name', 'XMessenger');
    const pwaIconUrl = getSettingValue('pwa_icon_url', '');

    await sendPushToUser(userId, {
      title: `${appName} Test`,
      body: 'نوتیفیکیشن با موفقیت روی دستگاه شما فعال شد! 🎉',
      icon: pwaIconUrl || '/icon-192.png',
      badge: '/icon-192.png',
      silentIfFocused: false, // Show test notification regardless
      data: { url: '/' }
    });

    res.json({ success: true, message: 'Test notification sent' });
  } catch (err: any) {
    console.error('Error sending test push:', err);
    res.status(500).json({ error: 'PUSH_FAILED', message: err.message });
  }
});
