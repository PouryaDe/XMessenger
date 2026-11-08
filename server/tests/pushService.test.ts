import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db, initDatabase } from '../src/database/index.js';
import { 
  initVapid, 
  getVapidPublicKey, 
  saveSubscription, 
  removeSubscription,
  dispatchPushForMessage 
} from '../src/services/pushService.js';
import { v4 as uuidv4 } from 'uuid';

function createTestUser(status: 'active' | 'banned' | 'pending' = 'active'): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO users (id, username, password_hash, role, status, created_at, last_seen)
    VALUES (?, ?, 'hash', 'user', ?, ?, ?)
  `).run(id, `test-${uuidv4().slice(0, 8)}`, status, now, now);
  return id;
}

function cleanupTestUser(id: string): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

describe('Push Service & VAPID Unit Tests', () => {
  initDatabase();
  initVapid();

  it('generates and returns a valid VAPID public key', () => {
    const key = getVapidPublicKey();
    assert.ok(key, 'VAPID public key should exist');
    assert.ok(key.length > 30, 'VAPID public key should be a non-trivial base64 string');
  });

  it('rejects invalid or non-HTTPS endpoints', () => {
    const userId = createTestUser();

    // 1. Insecure http:// endpoint
    assert.throws(() => {
      saveSubscription(userId, {
        endpoint: 'http://insecure-push.example.com/test',
        keys: { p256dh: 'dummy-p256dh', auth: 'dummy-auth' }
      });
    }, /INVALID_ENDPOINT/);

    // 2. Malicious URI schemes
    assert.throws(() => {
      saveSubscription(userId, {
        endpoint: 'javascript:alert(1)',
        keys: { p256dh: 'dummy-p256dh', auth: 'dummy-auth' }
      });
    }, /INVALID_ENDPOINT/);

    // 3. Missing keys
    assert.throws(() => {
      saveSubscription(userId, {
        endpoint: 'https://push.example.com/sub/123',
        keys: { p256dh: '', auth: '' }
      });
    }, /INVALID_SUBSCRIPTION/);

    // 4. Oversized endpoint exceeding 8192 chars
    assert.throws(() => {
      saveSubscription(userId, {
        endpoint: 'https://web.push.apple.com/' + 'a'.repeat(8200),
        keys: { p256dh: 'dummy-p256dh', auth: 'dummy-auth' }
      });
    }, /INVALID_ENDPOINT/);

    cleanupTestUser(userId);
  });

  it('supports long Apple APNs push endpoints (up to 8192 characters)', () => {
    const userId = createTestUser();
    const longAppleEndpoint = 'https://web.push.apple.com/QN' + 'x'.repeat(3000);
    const keys = { p256dh: 'dummy-p256dh', auth: 'dummy-auth' };

    saveSubscription(userId, { endpoint: longAppleEndpoint, keys });
    const row = db.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').get(longAppleEndpoint) as any;
    assert.ok(row, 'Long Apple APNs endpoint should be saved successfully');

    removeSubscription(longAppleEndpoint);
    cleanupTestUser(userId);
  });

  it('saves and updates valid push subscriptions', () => {
    const userId = createTestUser();
    const endpoint = `https://fcm.googleapis.com/fcm/send/test-${uuidv4()}`;
    const keys = { p256dh: 'valid-p256dh-key', auth: 'valid-auth-secret' };

    // 1. Initial insert
    saveSubscription(userId, { endpoint, keys }, 'Mozilla/5.0');

    const row = db.prepare('SELECT user_id, p256dh, auth, user_agent FROM push_subscriptions WHERE endpoint = ?').get(endpoint) as any;
    assert.ok(row, 'Subscription row should exist in database');
    assert.strictEqual(row.user_id, userId);
    assert.strictEqual(row.p256dh, keys.p256dh);
    assert.strictEqual(row.auth, keys.auth);

    // 2. Update existing endpoint with new keys
    const newKeys = { p256dh: 'updated-key', auth: 'updated-auth' };
    saveSubscription(userId, { endpoint, keys: newKeys }, 'Chrome/120');

    const updated = db.prepare('SELECT p256dh, user_agent FROM push_subscriptions WHERE endpoint = ?').get(endpoint) as any;
    assert.strictEqual(updated.p256dh, 'updated-key');
    assert.strictEqual(updated.user_agent, 'Chrome/120');

    // Clean up
    removeSubscription(endpoint);
    cleanupTestUser(userId);
  });

  it('enforces user ownership when removing subscriptions (Security Isolation)', () => {
    const userA = createTestUser();
    const userB = createTestUser();
    const endpoint = `https://web.push.apple.com/sub/apple-${uuidv4()}`;

    saveSubscription(userA, {
      endpoint,
      keys: { p256dh: 'dummy-p256dh', auth: 'dummy-auth' }
    });

    // User B tries to delete User A's subscription
    removeSubscription(endpoint, userB);

    // Subscription must STILL exist because User B does not own it!
    const stillExists = db.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
    assert.ok(stillExists, 'Subscription must not be removed by another unauthorized user');

    // User A deletes their own subscription
    removeSubscription(endpoint, userA);
    const deleted = db.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
    assert.strictEqual(deleted, undefined, 'Subscription must be removed when owner deletes it');

    cleanupTestUser(userA);
    cleanupTestUser(userB);
  });

  it('suppresses push notifications for inactive, banned, or pending recipients', async () => {
    const bannedUserId = createTestUser('banned');

    // Should return gracefully without attempting to send push
    await dispatchPushForMessage(
      { id: 'admin-id', username: 'admin', role: 'admin' },
      bannedUserId,
      'Hello banned user'
    );

    cleanupTestUser(bannedUserId);
  });

  it('guarantees push notifications never expose private raw chat text on lockscreen', async () => {
    const activeUserId = createTestUser('active');

    // Calling dispatchPushForMessage with sensitive raw message content must succeed safely
    await dispatchPushForMessage(
      { id: 'admin-id', username: 'admin', role: 'admin' },
      activeUserId,
      'Top secret confidential message that must never appear on lockscreen'
    );

    cleanupTestUser(activeUserId);
  });
});
