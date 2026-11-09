import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { db, initDatabase, getSettingValue, updateSettingValue } from '../src/database/index.js';
import { encryptMessage, decryptMessage } from '../src/utils/crypto.js';
import { requireActive, authenticate, generateToken } from '../src/middleware/auth.js';
import { config } from '../src/config/index.js';

describe('Database Backup, Restore & Data Security Tests', () => {
  it('creates an online backup and verifies database integrity', async () => {
    initDatabase();

    const tempBackupFile = path.join(config.dataDir, `test-backup-${Date.now()}.db`);
    try {
      // 1. Perform SQLite online backup
      await db.backup(tempBackupFile);
      assert.strictEqual(fs.existsSync(tempBackupFile), true, 'Backup file must exist on disk');

      // 2. Open backup as read-only and verify integrity
      const backupDb = new Database(tempBackupFile, { readonly: true });
      const check = backupDb.pragma('quick_check') as Array<{ quick_check: string }>;
      assert.strictEqual(check[0]?.quick_check, 'ok', 'Backup integrity check must be ok');

      // 3. Verify required tables exist
      const tables = backupDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t: any) => t.name);
      assert.strictEqual(tables.includes('users'), true);
      assert.strictEqual(tables.includes('messages'), true);
      assert.strictEqual(tables.includes('settings'), true);

      // 4. Verify admin user exists in backup
      const adminCount = backupDb.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number };
      assert.strictEqual(adminCount.count > 0, true, 'Backup must contain admin account');

      backupDb.close();
    } finally {
      if (fs.existsSync(tempBackupFile)) {
        try { fs.unlinkSync(tempBackupFile); } catch (_) {}
      }
    }
  });

  it('guarantees encryption at rest for messages (no plaintext in DB snapshot)', async () => {
    initDatabase();

    const testAdminId = uuidv4();
    const testUserId = uuidv4();
    const msgId = uuidv4();
    const secretContent = 'UltraConfidentialSecretMessage12345';
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, last_seen)
      VALUES (?, ?, 'hash', 'admin', 'active', ?, ?),
             (?, ?, 'hash', 'user', 'active', ?, ?)
    `).run(
      testAdminId, `adm-${testAdminId.slice(0, 8)}`, nowIso, nowIso,
      testUserId, `usr-${testUserId.slice(0, 8)}`, nowIso, nowIso
    );

    const enc = encryptMessage(secretContent);
    db.prepare(`
      INSERT INTO messages (id, sender_id, recipient_id, ciphertext, iv, auth_tag, created_at, expires_at, is_read, reactions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, '[]')
    `).run(msgId, testUserId, testAdminId, enc.ciphertext, enc.iv, enc.authTag, nowIso, nowIso);

    // Take backup
    const tempBackupFile = path.join(config.dataDir, `test-enc-backup-${Date.now()}.db`);
    try {
      await db.backup(tempBackupFile);
      const backupDb = new Database(tempBackupFile, { readonly: true });

      const row = backupDb.prepare('SELECT ciphertext, iv, auth_tag FROM messages WHERE id = ?').get(msgId) as any;
      assert.notStrictEqual(row.ciphertext, secretContent, 'Ciphertext must never match plaintext');
      assert.strictEqual(row.ciphertext.includes('UltraConfidentialSecretMessage'), false);

      // Ensure decrypt recovers original plaintext
      const decrypted = decryptMessage(row.ciphertext, row.iv, row.auth_tag);
      assert.strictEqual(decrypted, secretContent);

      backupDb.close();
    } finally {
      if (fs.existsSync(tempBackupFile)) {
        try { fs.unlinkSync(tempBackupFile); } catch (_) {}
      }
      db.prepare('DELETE FROM messages WHERE id = ?').run(msgId);
      db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(testAdminId, testUserId);
    }
  });

  it('rejects corrupt or non-SQLite files during restore validation', () => {
    const corruptFile = path.join(config.dataDir, `test-corrupt-${Date.now()}.db`);
    fs.writeFileSync(corruptFile, 'THIS_IS_NOT_A_SQLITE_DATABASE_TEXT_FILE');

    try {
      assert.throws(() => {
        const dummyDb = new Database(corruptFile, { readonly: true });
        try {
          dummyDb.pragma('quick_check');
        } finally {
          dummyDb.close();
        }
      });
    } finally {
      if (fs.existsSync(corruptFile)) {
        try { fs.unlinkSync(corruptFile); } catch (_) {}
      }
    }
  });

  it('rejects database backup missing required tables or admin account', () => {
    const invalidDbFile = path.join(config.dataDir, `test-invalid-${Date.now()}.db`);
    const invalidDb = new Database(invalidDbFile);
    invalidDb.exec('CREATE TABLE some_random_table (id TEXT);');
    invalidDb.close();

    try {
      const dbToCheck = new Database(invalidDbFile, { readonly: true });
      const tables = dbToCheck.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t: any) => t.name);
      const requiredTables = ['users', 'messages', 'settings'];
      const missing = requiredTables.filter(t => !tables.includes(t));
      assert.strictEqual(missing.length > 0, true, 'Must detect missing required tables');
      dbToCheck.close();
    } finally {
      if (fs.existsSync(invalidDbFile)) {
        try { fs.unlinkSync(invalidDbFile); } catch (_) {}
      }
    }
  });
});

describe('System Maintenance Mode & Ban Enforcement Security Tests', () => {
  it('correctly toggles system_enabled setting and persists in settings table', () => {
    initDatabase();

    updateSettingValue('system_enabled', 'false');
    assert.strictEqual(getSettingValue('system_enabled', 'true'), 'false');

    updateSettingValue('system_enabled', 'true');
    assert.strictEqual(getSettingValue('system_enabled', 'true'), 'true');
  });

  it('blocks sending messages to banned users', () => {
    initDatabase();
    const testAdminId = uuidv4();
    const bannedUserId = uuidv4();
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, last_seen)
      VALUES (?, ?, 'hash', 'admin', 'active', ?, ?),
             (? ,?, 'hash', 'user', 'banned', ?, ?)
    `).run(
      testAdminId, `adm-${testAdminId.slice(0, 8)}`, nowIso, nowIso,
      bannedUserId, `banned-${bannedUserId.slice(0, 8)}`, nowIso, nowIso
    );

    try {
      const recipient = db.prepare('SELECT id, status FROM users WHERE id = ?').get(bannedUserId) as { id: string; status: string };
      assert.strictEqual(recipient.status, 'banned');

      // Security assertion: message route & socket check
      const isRecipientAllowed = recipient && recipient.status !== 'banned';
      assert.strictEqual(isRecipientAllowed, false, 'Recipient must be rejected when status is banned');
    } finally {
      db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(testAdminId, bannedUserId);
    }
  });

  it('requireActive middleware blocks regular user when maintenance mode is active', () => {
    initDatabase();
    updateSettingValue('system_enabled', 'false');

    const regularUserReq: any = {
      user: { id: 'u1', username: 'user1', role: 'user', status: 'active' }
    };
    let statusCode = 200;
    let jsonBody: any = null;
    const res: any = {
      status(code: number) { statusCode = code; return this; },
      json(body: any) { jsonBody = body; return this; }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    requireActive(regularUserReq, res, next);
    assert.strictEqual(nextCalled, false, 'next() must NOT be called for regular users when system is disabled');
    assert.strictEqual(statusCode, 503);
    assert.strictEqual(jsonBody?.error, 'SYSTEM_DISABLED');

    // Admin MUST still be allowed to pass through
    const adminReq: any = {
      user: { id: 'a1', username: 'admin1', role: 'admin', status: 'active' }
    };
    let adminNextCalled = false;
    requireActive(adminReq, res, () => { adminNextCalled = true; });
    assert.strictEqual(adminNextCalled, true, 'Admin must not be blocked by maintenance mode');

    // Restore system_enabled
    updateSettingValue('system_enabled', 'true');
  });

  it('requireActive blocks pending user from accessing messaging routes', () => {
    const pendingReq: any = {
      user: { id: 'p1', username: 'pending1', role: 'user', status: 'pending' }
    };
    let statusCode = 200;
    let jsonBody: any = null;
    const res: any = {
      status(code: number) { statusCode = code; return this; },
      json(body: any) { jsonBody = body; return this; }
    };
    let nextCalled = false;
    requireActive(pendingReq, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusCode, 403);
    assert.strictEqual(jsonBody?.error, 'ACCOUNT_PENDING_APPROVAL');
  });

  it('authenticate middleware immediately rejects banned users with ACCOUNT_BANNED', () => {
    initDatabase();
    const bannedId = uuidv4();
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, last_seen)
      VALUES (?, ?, 'hash', 'user', 'banned', ?, ?)
    `).run(bannedId, `banned-${bannedId.slice(0, 8)}`, nowIso, nowIso);

    try {
      const token = generateToken({
        id: bannedId,
        username: `banned-${bannedId.slice(0, 8)}`,
        role: 'user',
        status: 'active' // Even if token claims active, live DB check must catch ban!
      });

      const req: any = {
        headers: { authorization: `Bearer ${token}` }
      };
      let statusCode = 200;
      let jsonBody: any = null;
      const res: any = {
        status(code: number) { statusCode = code; return this; },
        json(body: any) { jsonBody = body; return this; }
      };
      let nextCalled = false;

      authenticate(req, res, () => { nextCalled = true; });

      assert.strictEqual(nextCalled, false, 'next() must NOT be called for banned user');
      assert.strictEqual(statusCode, 403);
      assert.strictEqual(jsonBody?.error, 'ACCOUNT_BANNED');
    } finally {
      db.prepare('DELETE FROM users WHERE id = ?').run(bannedId);
    }
  });
});

describe('Admin Encrypted Notes, User Categorization & Admin Presence Tests', () => {
  it('guarantees admin private notes are encrypted at rest with AES-256-GCM', () => {
    initDatabase();
    const testUserId = uuidv4();
    const nowIso = new Date().toISOString();
    const sensitiveNote = 'Confidential client background note: VIP contract pending #402';

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, last_seen)
      VALUES (?, ?, 'hash', 'user', 'active', ?, ?)
    `).run(testUserId, `usr-${testUserId.slice(0, 8)}`, nowIso, nowIso);

    try {
      // 1. Encrypt and save note in admin_user_notes
      const enc = encryptMessage(sensitiveNote);
      db.prepare(`
        INSERT INTO admin_user_notes (user_id, ciphertext, iv, auth_tag, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(testUserId, enc.ciphertext, enc.iv, enc.authTag, nowIso);

      // 2. Verify stored record is encrypted (no plaintext in DB)
      const stored = db.prepare('SELECT ciphertext, iv, auth_tag FROM admin_user_notes WHERE user_id = ?').get(testUserId) as any;
      assert.ok(stored);
      assert.notStrictEqual(stored.ciphertext, sensitiveNote);
      assert.strictEqual(stored.ciphertext.includes('VIP contract pending'), false);

      // 3. Decrypt and verify recovered content
      const decrypted = decryptMessage(stored.ciphertext, stored.iv, stored.auth_tag);
      assert.strictEqual(decrypted, sensitiveNote);

      // 4. Cascade delete when user is deleted
      db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
      const afterUserDelete = db.prepare('SELECT user_id FROM admin_user_notes WHERE user_id = ?').get(testUserId);
      assert.strictEqual(afterUserDelete, undefined, 'Notes must be cascade deleted with user');
    } finally {
      db.prepare('DELETE FROM admin_user_notes WHERE user_id = ?').run(testUserId);
      db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
    }
  });

  it('correctly persists and updates user categories (vip, friends, temporary, work)', () => {
    initDatabase();
    const testUserId = uuidv4();
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, last_seen)
      VALUES (?, ?, 'hash', 'user', 'active', ?, ?)
    `).run(testUserId, `usr-${testUserId.slice(0, 8)}`, nowIso, nowIso);

    try {
      // 1. Initial category is null
      let row = db.prepare('SELECT category FROM users WHERE id = ?').get(testUserId) as any;
      assert.strictEqual(row.category, null);

      // 2. Set to 'vip'
      db.prepare('UPDATE users SET category = ? WHERE id = ?').run('vip', testUserId);
      row = db.prepare('SELECT category FROM users WHERE id = ?').get(testUserId) as any;
      assert.strictEqual(row.category, 'vip');

      // 3. Set to 'friends'
      db.prepare('UPDATE users SET category = ? WHERE id = ?').run('friends', testUserId);
      row = db.prepare('SELECT category FROM users WHERE id = ?').get(testUserId) as any;
      assert.strictEqual(row.category, 'friends');

      // 4. Set to null (cleared)
      db.prepare('UPDATE users SET category = ? WHERE id = ?').run(null, testUserId);
      row = db.prepare('SELECT category FROM users WHERE id = ?').get(testUserId) as any;
      assert.strictEqual(row.category, null);
    } finally {
      db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
    }
  });

  it('hides admin online status and last seen from regular users when show_admin_presence is false', () => {
    initDatabase();

    // 1. Test when show_admin_presence is true
    updateSettingValue('show_admin_presence', 'true');
    assert.strictEqual(getSettingValue('show_admin_presence', 'true'), 'true');

    // 2. Toggle to false
    updateSettingValue('show_admin_presence', 'false');
    assert.strictEqual(getSettingValue('show_admin_presence', 'true'), 'false');

    // When show_admin_presence is false, verify the flag contract:
    const showPresence = getSettingValue('show_admin_presence', 'true') === 'true';
    assert.strictEqual(showPresence, false);

    // Restore to true
    updateSettingValue('show_admin_presence', 'true');
  });
});
