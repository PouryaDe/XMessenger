import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';
import { 
  db, 
  initDatabase, 
  getSettingValue, 
  updateSettingValue, 
  clearSettingsCache 
} from '../src/database/index.js';
import { encryptMessage } from '../src/utils/crypto.js';

describe('Performance, In-Memory Caching & Query Optimization Tests', () => {
  initDatabase();

  it('verifies in-memory settings cache updates, hits, and cache clear lifecycle', () => {
    const testKey = `test_setting_${Date.now()}`;
    const initialVal = 'initial_performance_value';
    const updatedVal = 'updated_performance_value';

    // 1. Initial set & cache populate
    updateSettingValue(testKey, initialVal);
    assert.strictEqual(getSettingValue(testKey, 'default'), initialVal);

    // 2. Modify database directly to verify cache hit shields disk reads
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('direct_db_bypass', testKey);
    // Cached value should still be returned (0ms memory read)
    assert.strictEqual(getSettingValue(testKey, 'default'), initialVal);

    // 3. Clear cache explicitly (e.g. on database restore)
    clearSettingsCache();
    // Now it must fetch fresh value from SQLite
    assert.strictEqual(getSettingValue(testKey, 'default'), 'direct_db_bypass');

    // 4. Update via updateSettingValue synchronizes both cache and DB
    updateSettingValue(testKey, updatedVal);
    assert.strictEqual(getSettingValue(testKey, 'default'), updatedVal);

    const dbRow = db.prepare('SELECT value FROM settings WHERE key = ?').get(testKey) as { value: string };
    assert.strictEqual(dbRow.value, updatedVal);

    // 5. Non-existent key returns provided default
    assert.strictEqual(getSettingValue('completely_missing_key_xyz', 'fallback_default'), 'fallback_default');

    // Cleanup
    db.prepare('DELETE FROM settings WHERE key = ?').run(testKey);
    clearSettingsCache();
  });

  it('guarantees composite indexes exist for conversation queries and unread lookups', () => {
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((r: any) => r.name);

    assert.strictEqual(indexes.includes('idx_messages_conv_created'), true, 'idx_messages_conv_created must exist');
    assert.strictEqual(indexes.includes('idx_messages_unread_lookup'), true, 'idx_messages_unread_lookup must exist');
    assert.strictEqual(indexes.includes('idx_users_role_last_seen'), true, 'idx_users_role_last_seen must exist');
  });

  it('accurately aggregates unread counts across multiple senders in 1 single grouped query (resolves N+1)', () => {
    const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get() as { id: string };
    assert.ok(admin, 'Admin must exist in test database');

    const user1Id = uuidv4();
    const user2Id = uuidv4();
    const now = new Date();
    const futureExpiry = new Date(now.getTime() + 86400000).toISOString();
    const pastExpiry = new Date(now.getTime() - 10000).toISOString();
    const nowIso = now.toISOString();

    // Create 2 test users
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, last_seen)
      VALUES (?, ?, 'hash', 'user', 'active', ?, ?), (?, ?, 'hash', 'user', 'active', ?, ?)
    `).run(
      user1Id, `perf_user1_${Date.now()}`, nowIso, nowIso,
      user2Id, `perf_user2_${Date.now()}`, nowIso, nowIso
    );

    const { ciphertext, iv, authTag } = encryptMessage('Hello Admin');

    // Insert 3 unread messages from User 1
    for (let i = 0; i < 3; i++) {
      db.prepare(`
        INSERT INTO messages (id, sender_id, recipient_id, ciphertext, iv, auth_tag, created_at, expires_at, is_read)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(uuidv4(), user1Id, admin.id, ciphertext, iv, authTag, nowIso, futureExpiry);
    }

    // Insert 1 already-read message from User 1 (should NOT be counted)
    db.prepare(`
      INSERT INTO messages (id, sender_id, recipient_id, ciphertext, iv, auth_tag, created_at, expires_at, is_read)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(uuidv4(), user1Id, admin.id, ciphertext, iv, authTag, nowIso, futureExpiry);

    // Insert 1 expired message from User 1 (should NOT be counted)
    db.prepare(`
      INSERT INTO messages (id, sender_id, recipient_id, ciphertext, iv, auth_tag, created_at, expires_at, is_read)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(uuidv4(), user1Id, admin.id, ciphertext, iv, authTag, nowIso, pastExpiry);

    // Insert 2 unread messages from User 2
    for (let i = 0; i < 2; i++) {
      db.prepare(`
        INSERT INTO messages (id, sender_id, recipient_id, ciphertext, iv, auth_tag, created_at, expires_at, is_read)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(uuidv4(), user2Id, admin.id, ciphertext, iv, authTag, nowIso, futureExpiry);
    }

    // Execute optimized 1-query aggregation
    const unreadRows = db.prepare(`
      SELECT sender_id, COUNT(*) as count
      FROM messages
      WHERE recipient_id = ? AND is_read = 0 AND expires_at > ?
      GROUP BY sender_id
    `).all(admin.id, nowIso) as Array<{ sender_id: string; count: number }>;

    const unreadMap = new Map<string, number>();
    for (const row of unreadRows) {
      unreadMap.set(row.sender_id, row.count);
    }

    assert.strictEqual(unreadMap.get(user1Id), 3, 'User 1 should have exactly 3 unread messages (excluding read and expired)');
    assert.strictEqual(unreadMap.get(user2Id), 2, 'User 2 should have exactly 2 unread messages');
    assert.strictEqual(unreadMap.get('non_existent_user'), undefined);

    // Cleanup
    db.prepare('DELETE FROM messages WHERE sender_id IN (?, ?)').run(user1Id, user2Id);
    db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(user1Id, user2Id);
  });

  it('verifies SQLite query planner uses composite index for fast conversation seeks', () => {
    const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get() as { id: string };
    const dummyUserId = uuidv4();
    const nowIso = new Date().toISOString();

    const plan = db.prepare(`
      EXPLAIN QUERY PLAN
      SELECT id, sender_id, recipient_id, created_at
      FROM messages
      WHERE ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))
        AND expires_at > ?
      ORDER BY created_at DESC
      LIMIT 1
    `).all(dummyUserId, admin.id, admin.id, dummyUserId, nowIso) as Array<{ detail: string }>;

    const detailText = plan.map((p) => p.detail).join(' ');
    // SQLite query plan should mention INDEX (e.g. USING INDEX idx_messages_conv_created or participants)
    assert.strictEqual(/USING INDEX/i.test(detailText), true, 'Query plan must utilize indexed scans rather than full table scans');
  });
});
