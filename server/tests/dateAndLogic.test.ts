import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';
import { db, initDatabase } from '../src/database/index.js';
import { encryptMessage, decryptMessage } from '../src/utils/crypto.js';

// Unit logic for isSameDay
function isSameDay(d1: Date | string, d2: Date | string): boolean {
  try {
    const date1 = typeof d1 === 'string' ? new Date(d1) : d1;
    const date2 = typeof d2 === 'string' ? new Date(d2) : d2;
    if (isNaN(date1.getTime()) || isNaN(date2.getTime())) return false;
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  } catch {
    return false;
  }
}

// Unit logic for chatStore haveMessagesChanged
function haveMessagesChanged(prev: any[], next: any[]): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    const p = prev[i];
    const n = next[i];
    if (
      !p || !n ||
      p.id !== n.id ||
      p.text !== n.text ||
      p.isRead !== n.isRead ||
      p.expiresAt !== n.expiresAt
    ) {
      return true;
    }
  }
  return false;
}

describe('Date Separator & Chat Scroll Diffing Tests', () => {
  it('correctly identifies identical calendar days', () => {
    const time1 = '2026-11-04T08:30:00.000Z';
    const time2 = '2026-11-04T18:45:00.000Z';
    assert.strictEqual(isSameDay(time1, time2), true);
  });

  it('correctly distinguishes different calendar days', () => {
    const time1 = '2026-11-04T12:00:00.000Z';
    const time2 = '2026-11-05T12:00:00.000Z';
    assert.strictEqual(isSameDay(time1, time2), false);
  });

  it('handles invalid or malformed dates gracefully without throwing', () => {
    assert.strictEqual(isSameDay('invalid-date', '2026-11-04T12:00:00Z'), false);
    assert.strictEqual(isSameDay('', ''), false);
    assert.strictEqual(isSameDay(new Date('invalid'), new Date()), false);
  });

  it('detects no change for identical message lists (prevents periodic scroll bounce)', () => {
    const listA = [
      { id: '1', text: 'Hello', isRead: true, expiresAt: '2026-11-08T12:00:00Z' },
      { id: '2', text: 'World', isRead: false, expiresAt: '2026-11-08T12:05:00Z' }
    ];
    const listB = [
      { id: '1', text: 'Hello', isRead: true, expiresAt: '2026-11-08T12:00:00Z' },
      { id: '2', text: 'World', isRead: false, expiresAt: '2026-11-08T12:05:00Z' }
    ];

    assert.strictEqual(haveMessagesChanged(listA, listB), false);
  });

  it('detects changes when a new message arrives, is read, or deleted', () => {
    const base = [
      { id: '1', text: 'Hello', isRead: false, expiresAt: '2026-11-08T12:00:00Z' }
    ];

    // Read status changed
    const markedRead = [
      { id: '1', text: 'Hello', isRead: true, expiresAt: '2026-11-08T12:00:00Z' }
    ];
    assert.strictEqual(haveMessagesChanged(base, markedRead), true);

    // New message added
    const withNewMsg = [
      { id: '1', text: 'Hello', isRead: false, expiresAt: '2026-11-08T12:00:00Z' },
      { id: '2', text: 'New', isRead: false, expiresAt: '2026-11-08T12:10:00Z' }
    ];
    assert.strictEqual(haveMessagesChanged(base, withNewMsg), true);

    // Message deleted (empty)
    assert.strictEqual(haveMessagesChanged(base, []), true);
  });

  it('persists and retrieves reply_to_id on encrypted messages and handles parent deletion', () => {
    initDatabase();
    const userId = uuidv4();
    const adminId = uuidv4();
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 3600_000).toISOString();

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, last_seen)
      VALUES (?, ?, 'hash', 'user', 'active', ?, ?)
    `).run(userId, `reply-u-${userId.slice(0, 8)}`, now, now);

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, last_seen)
      VALUES (?, ?, 'hash', 'user', 'active', ?, ?)
    `).run(adminId, `reply-a-${adminId.slice(0, 8)}`, now, now);

    const parentMsgId = uuidv4();
    const replyMsgId = uuidv4();
    const enc1 = encryptMessage('Original parent message');
    const enc2 = encryptMessage('Reply child message');

    // Insert parent message (no reply_to_id)
    db.prepare(`
      INSERT INTO messages (id, sender_id, recipient_id, ciphertext, iv, auth_tag, created_at, expires_at, is_read, reply_to_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(parentMsgId, userId, adminId, enc1.ciphertext, enc1.iv, enc1.authTag, now, expires, null);

    // Insert reply message referencing parentMsgId
    db.prepare(`
      INSERT INTO messages (id, sender_id, recipient_id, ciphertext, iv, auth_tag, created_at, expires_at, is_read, reply_to_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(replyMsgId, adminId, userId, enc2.ciphertext, enc2.iv, enc2.authTag, now, expires, parentMsgId);

    const fetchedReply = db.prepare('SELECT id, reply_to_id, ciphertext, iv, auth_tag FROM messages WHERE id = ?').get(replyMsgId) as any;
    assert.ok(fetchedReply);
    assert.strictEqual(fetchedReply.reply_to_id, parentMsgId);
    assert.strictEqual(decryptMessage(fetchedReply.ciphertext, fetchedReply.iv, fetchedReply.auth_tag), 'Reply child message');

    // Delete parent message and ensure reply message still retains reply_to_id (for "Deleted message" UI state)
    db.prepare('DELETE FROM messages WHERE id = ?').run(parentMsgId);
    const afterParentDeleted = db.prepare('SELECT id, reply_to_id FROM messages WHERE id = ?').get(replyMsgId) as any;
    assert.ok(afterParentDeleted);
    assert.strictEqual(afterParentDeleted.reply_to_id, parentMsgId);

    // Cleanup
    db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(userId, adminId);
  });
});
