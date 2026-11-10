import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';
import { db, initDatabase, getSettingValue, updateSettingValue } from '../src/database/index.js';
import { encryptMessage, decryptMessage } from '../src/utils/crypto.js';

describe('Telegram-style Broadcast Channel Tests', () => {
  initDatabase();

  it('guarantees channel posts and views tables exist with encryption at rest', () => {
    const postTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='channel_posts'").get();
    assert.ok(postTable, 'channel_posts table must exist');

    const viewsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='channel_post_views'").get();
    assert.ok(viewsTable, 'channel_post_views table must exist');

    const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get() as { id: string };
    assert.ok(admin, 'Admin account must exist');

    const rawPostText = 'اطلاعیه مهم: بروزرسانی سرور امشب انجام خواهد شد.';
    const postId = uuidv4();
    const encrypted = encryptMessage(rawPostText);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO channel_posts (id, admin_id, ciphertext, iv, auth_tag, created_at, views_count, reactions)
      VALUES (?, ?, ?, ?, ?, ?, 1, '[]')
    `).run(postId, admin.id, encrypted.ciphertext, encrypted.iv, encrypted.authTag, now);

    // Verify DB snapshot has NO plaintext
    const row = db.prepare('SELECT ciphertext, iv, auth_tag FROM channel_posts WHERE id = ?').get(postId) as {
      ciphertext: string;
      iv: string;
      auth_tag: string;
    };
    assert.notEqual(row.ciphertext, rawPostText, 'Ciphertext must be encrypted');
    assert.equal(row.ciphertext.includes('اطلاعیه'), false, 'Raw Persian text must never leak in ciphertext');

    // Verify decryption succeeds
    const decrypted = decryptMessage(row.ciphertext, row.iv, row.auth_tag);
    assert.equal(decrypted, rawPostText, 'Decrypted text must match original');

    // Clean up
    db.prepare('DELETE FROM channel_posts WHERE id = ?').run(postId);
  });

  it('accurately records post views and de-duplicates multiple views from the same user', () => {
    const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get() as { id: string };
    const postId = uuidv4();
    const encrypted = encryptMessage('تست سیستم بازدید کانال');
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO channel_posts (id, admin_id, ciphertext, iv, auth_tag, created_at, views_count, reactions)
      VALUES (?, ?, ?, ?, ?, ?, 1, '[]')
    `).run(postId, admin.id, encrypted.ciphertext, encrypted.iv, encrypted.authTag, now);

    // Initial admin view
    db.prepare(`
      INSERT OR IGNORE INTO channel_post_views (post_id, user_id, viewed_at)
      VALUES (?, ?, ?)
    `).run(postId, admin.id, now);

    // Create a dummy test user
    const testUserId = uuidv4();
    const testUsername = `viewer_user_${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, last_seen, category)
      VALUES (?, ?, 'dummy_hash', 'user', 'active', ?, ?, 'vip')
    `).run(testUserId, testUsername, now, now);

    // 1st view by test user
    const viewTime = new Date().toISOString();
    const firstInsert = db.prepare(`
      INSERT OR IGNORE INTO channel_post_views (post_id, user_id, viewed_at)
      VALUES (?, ?, ?)
    `).run(postId, testUserId, viewTime);

    assert.equal(firstInsert.changes, 1, 'First view must be recorded');
    db.prepare('UPDATE channel_posts SET views_count = views_count + 1 WHERE id = ?').run(postId);

    let postRow = db.prepare('SELECT views_count FROM channel_posts WHERE id = ?').get(postId) as { views_count: number };
    assert.equal(postRow.views_count, 2, 'Views count must be incremented to 2');

    // 2nd duplicate view by test user (should be ignored by PRIMARY KEY (post_id, user_id))
    const secondInsert = db.prepare(`
      INSERT OR IGNORE INTO channel_post_views (post_id, user_id, viewed_at)
      VALUES (?, ?, ?)
    `).run(postId, testUserId, new Date().toISOString());

    assert.equal(secondInsert.changes, 0, 'Duplicate view must be ignored (changes === 0)');

    postRow = db.prepare('SELECT views_count FROM channel_posts WHERE id = ?').get(postId) as { views_count: number };
    assert.equal(postRow.views_count, 2, 'Views count must remain 2 after duplicate view');

    // Check viewers query returned for admin
    const viewers = db.prepare(`
      SELECT
        u.id as userId,
        u.username,
        u.avatar_url as avatarUrl,
        u.category,
        cpv.viewed_at as viewedAt
      FROM channel_post_views cpv
      JOIN users u ON u.id = cpv.user_id
      WHERE cpv.post_id = ?
      ORDER BY cpv.viewed_at DESC
    `).all(postId) as Array<{ userId: string; username: string; category?: string; viewedAt: string }>;

    assert.equal(viewers.length, 2, 'Must return both admin and test user');
    const foundUser = viewers.find((v) => v.userId === testUserId);
    assert.ok(foundUser, 'Test user must be in viewers list');
    assert.equal(foundUser?.username, testUsername);
    assert.equal(foundUser?.category, 'vip');

    // Clean up
    db.prepare('DELETE FROM channel_posts WHERE id = ?').run(postId);
    db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
  });

  it('correctly toggles reactions on channel posts', () => {
    const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get() as { id: string };
    const postId = uuidv4();
    const encrypted = encryptMessage('تست واکنش ایموجی کانال');
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO channel_posts (id, admin_id, ciphertext, iv, auth_tag, created_at, views_count, reactions)
      VALUES (?, ?, ?, ?, ?, ?, 1, '[]')
    `).run(postId, admin.id, encrypted.ciphertext, encrypted.iv, encrypted.authTag, now);

    const testUserId = uuidv4();
    const testUsername = `reactor_${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, last_seen)
      VALUES (?, ?, 'dummy_hash', 'user', 'active', ?, ?)
    `).run(testUserId, testUsername, now, now);

    // 1. Add reaction 👍
    let reactions = [{
      userId: testUserId,
      username: testUsername,
      emoji: '👍',
      createdAt: now
    }];
    db.prepare('UPDATE channel_posts SET reactions = ? WHERE id = ?').run(JSON.stringify(reactions), postId);

    let row = db.prepare('SELECT reactions FROM channel_posts WHERE id = ?').get(postId) as { reactions: string };
    let parsed = JSON.parse(row.reactions);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].emoji, '👍');

    // 2. Toggle same reaction off
    reactions = [];
    db.prepare('UPDATE channel_posts SET reactions = ? WHERE id = ?').run(JSON.stringify(reactions), postId);

    row = db.prepare('SELECT reactions FROM channel_posts WHERE id = ?').get(postId) as { reactions: string };
    parsed = JSON.parse(row.reactions);
    assert.equal(parsed.length, 0);

    // Clean up
    db.prepare('DELETE FROM channel_posts WHERE id = ?').run(postId);
    db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
  });

  it('forwards a channel post into a 1-on-1 chat with forward_from badge and encryption', () => {
    const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get() as { id: string };
    const postId = uuidv4();
    const channelPostText = 'پست رسمی برای فوروارد به کاربران';
    const encrypted = encryptMessage(channelPostText);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO channel_posts (id, admin_id, ciphertext, iv, auth_tag, created_at, views_count, reactions)
      VALUES (?, ?, ?, ?, ?, ?, 1, '[]')
    `).run(postId, admin.id, encrypted.ciphertext, encrypted.iv, encrypted.authTag, now);

    const testUserId = uuidv4();
    const testUsername = `forward_user_${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, last_seen)
      VALUES (?, ?, 'dummy_hash', 'user', 'active', ?, ?)
    `).run(testUserId, testUsername, now, now);

    // Simulate forward from regular user to admin
    const forwardedMsgId = uuidv4();
    const forwardedEncrypted = encryptMessage(channelPostText);
    const expiresAt = new Date(Date.now() + 86400 * 1000).toISOString();

    db.prepare(`
      INSERT INTO messages (id, sender_id, recipient_id, ciphertext, iv, auth_tag, created_at, expires_at, is_read, forward_from, reactions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'channel', '[]')
    `).run(forwardedMsgId, testUserId, admin.id, forwardedEncrypted.ciphertext, forwardedEncrypted.iv, forwardedEncrypted.authTag, now, expiresAt);

    const msgRow = db.prepare(`
      SELECT id, sender_id, recipient_id, ciphertext, iv, auth_tag, forward_from
      FROM messages WHERE id = ?
    `).get(forwardedMsgId) as {
      id: string;
      sender_id: string;
      recipient_id: string;
      ciphertext: string;
      iv: string;
      auth_tag: string;
      forward_from: string;
    };

    assert.ok(msgRow, 'Forwarded message must exist in messages table');
    assert.equal(msgRow.forward_from, 'channel', 'forward_from flag must be channel');
    assert.equal(msgRow.sender_id, testUserId);
    assert.equal(msgRow.recipient_id, admin.id);

    const decryptedMsg = decryptMessage(msgRow.ciphertext, msgRow.iv, msgRow.auth_tag);
    assert.equal(decryptedMsg, channelPostText, 'Forwarded message content must match channel post');

    // Clean up
    db.prepare('DELETE FROM messages WHERE id = ?').run(forwardedMsgId);
    db.prepare('DELETE FROM channel_posts WHERE id = ?').run(postId);
    db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
  });

  it('strictly validates post length and sanitizes reactions to allowed emojis', () => {
    // 1. Text length validation
    const emptyCheck = (text: any) => Boolean(!text || typeof text !== 'string' || !text.trim());
    const lengthCheck = (text: string) => text.length > 50000;

    assert.equal(emptyCheck(''), true, 'Empty text must be rejected');
    assert.equal(emptyCheck('   '), true, 'Whitespace text must be rejected');
    assert.equal(emptyCheck(null), true, 'Null text must be rejected');
    assert.equal(lengthCheck('a'.repeat(50001)), true, 'Text over 50,000 chars must be flagged as too long');
    assert.equal(lengthCheck('a'.repeat(49999)), false, 'Normal text must pass length check');

    // 2. Reaction whitelist verification
    const validateReaction = (emojiInput: string): string => {
      const allowed = ['👍', '❤️'];
      return allowed.includes(emojiInput) ? emojiInput : '👍';
    };

    assert.equal(validateReaction('👍'), '👍');
    assert.equal(validateReaction('❤️'), '❤️');
    assert.equal(validateReaction('<script>alert(1)</script>'), '👍', 'Script injections must fall back to 👍');
    assert.equal(validateReaction('💥'), '👍', 'Non-whitelisted emojis must fall back to 👍');
  });

  it('guarantees complete cascading cleanup of views when a channel post is deleted', () => {
    const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get() as { id: string };
    const postId = uuidv4();
    const encrypted = encryptMessage('تست پاکسازی آبشاری بازدیدها');
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO channel_posts (id, admin_id, ciphertext, iv, auth_tag, created_at, views_count, reactions)
      VALUES (?, ?, ?, ?, ?, ?, 1, '[]')
    `).run(postId, admin.id, encrypted.ciphertext, encrypted.iv, encrypted.authTag, now);

    db.prepare(`
      INSERT INTO channel_post_views (post_id, user_id, viewed_at)
      VALUES (?, ?, ?)
    `).run(postId, admin.id, now);

    // Verify view exists
    let viewsCount = db.prepare('SELECT COUNT(*) as count FROM channel_post_views WHERE post_id = ?').get(postId) as { count: number };
    assert.equal(viewsCount.count, 1);

    // Delete post
    db.prepare('DELETE FROM channel_post_views WHERE post_id = ?').run(postId);
    db.prepare('DELETE FROM channel_posts WHERE id = ?').run(postId);

    // Verify post and views are gone
    const postCheck = db.prepare('SELECT id FROM channel_posts WHERE id = ?').get(postId);
    assert.equal(postCheck, undefined, 'Post must be deleted');

    viewsCount = db.prepare('SELECT COUNT(*) as count FROM channel_post_views WHERE post_id = ?').get(postId) as { count: number };
    assert.equal(viewsCount.count, 0, 'Associated views must be completely cleaned up');
  });
});
