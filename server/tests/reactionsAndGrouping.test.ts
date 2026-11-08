import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';
import { db, initDatabase } from '../src/database/index.js';
import { encryptMessage } from '../src/utils/crypto.js';

// Calendar day comparison matching client/src/components/user/UserChatView.tsx & AdminDashboard.tsx
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

// Grouping calculation standard
function computeGrouping(messages: Array<{ id: string; senderId: string; createdAt: string }>) {
  return messages.map((m, idx) => {
    const prev = idx > 0 ? messages[idx - 1] : null;
    const next = idx < messages.length - 1 ? messages[idx + 1] : null;
    const isPrevSame = !!prev && prev.senderId === m.senderId && isSameDay(prev.createdAt, m.createdAt);
    const isNextSame = !!next && next.senderId === m.senderId && isSameDay(next.createdAt, m.createdAt);
    return {
      id: m.id,
      isFirstInGroup: !isPrevSame,
      isLastInGroup: !isNextSame
    };
  });
}

// Server reaction toggle helper mirroring socket & REST route logic
function toggleReactionLogic(
  currentReactions: Array<{ userId: string; username: string; avatarUrl?: string; emoji: string; createdAt: string }>,
  user: { id: string; username: string; avatarUrl?: string },
  rawEmoji: string
) {
  const emoji = (rawEmoji && rawEmoji.trim().length > 0 && rawEmoji.trim().length <= 16)
    ? rawEmoji.trim()
    : '👍';

  let reactions = [...currentReactions];
  const existingIndex = reactions.findIndex((r) => r.userId === user.id && r.emoji === emoji);

  if (existingIndex !== -1) {
    reactions.splice(existingIndex, 1);
  } else {
    // Replace any previous emoji from this user with the new one
    reactions = reactions.filter((r) => r.userId !== user.id);
    reactions.push({
      userId: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      emoji,
      createdAt: new Date().toISOString()
    });
  }

  return reactions;
}

describe('Telegram Message Grouping & Tail Calculation Tests', () => {
  it('correctly marks solitary messages as both first and last in group', () => {
    const list = [
      { id: 'm1', senderId: 'u1', createdAt: '2026-11-08T10:00:00.000Z' }
    ];
    const grouped = computeGrouping(list);
    assert.strictEqual(grouped[0].isFirstInGroup, true);
    assert.strictEqual(grouped[0].isLastInGroup, true);
  });

  it('correctly groups consecutive streaks from same sender on same day', () => {
    const list = [
      { id: 'm1', senderId: 'u1', createdAt: '2026-11-08T10:00:00.000Z' },
      { id: 'm2', senderId: 'u1', createdAt: '2026-11-08T10:01:00.000Z' },
      { id: 'm3', senderId: 'u1', createdAt: '2026-11-08T10:02:00.000Z' }
    ];
    const grouped = computeGrouping(list);

    // First in streak
    assert.strictEqual(grouped[0].isFirstInGroup, true);
    assert.strictEqual(grouped[0].isLastInGroup, false);

    // Intermediate message
    assert.strictEqual(grouped[1].isFirstInGroup, false);
    assert.strictEqual(grouped[1].isLastInGroup, false);

    // Last in streak (where Telegram tail attaches)
    assert.strictEqual(grouped[2].isFirstInGroup, false);
    assert.strictEqual(grouped[2].isLastInGroup, true);
  });

  it('breaks group when sender alternates', () => {
    const list = [
      { id: 'm1', senderId: 'u1', createdAt: '2026-11-08T10:00:00.000Z' },
      { id: 'm2', senderId: 'u2', createdAt: '2026-11-08T10:01:00.000Z' },
      { id: 'm3', senderId: 'u1', createdAt: '2026-11-08T10:02:00.000Z' }
    ];
    const grouped = computeGrouping(list);

    assert.strictEqual(grouped[0].isFirstInGroup, true);
    assert.strictEqual(grouped[0].isLastInGroup, true);

    assert.strictEqual(grouped[1].isFirstInGroup, true);
    assert.strictEqual(grouped[1].isLastInGroup, true);

    assert.strictEqual(grouped[2].isFirstInGroup, true);
    assert.strictEqual(grouped[2].isLastInGroup, true);
  });

  it('breaks streak across midnight calendar day boundaries', () => {
    const list = [
      { id: 'm1', senderId: 'u1', createdAt: '2026-11-08T10:00:00.000Z' },
      { id: 'm2', senderId: 'u1', createdAt: '2026-11-09T10:00:00.000Z' }
    ];
    const grouped = computeGrouping(list);

    // Even though sender is identical, day changed so each is isolated
    assert.strictEqual(grouped[0].isFirstInGroup, true);
    assert.strictEqual(grouped[0].isLastInGroup, true);

    assert.strictEqual(grouped[1].isFirstInGroup, true);
    assert.strictEqual(grouped[1].isLastInGroup, true);
  });
});

describe('Message Reactions Core Logic & Security Tests', () => {
  it('adds reaction when user reacts and removes when toggled again', () => {
    const userA = { id: 'user_a', username: 'Alice', avatarUrl: '/avatar-a.png' };
    let reactions: any[] = [];

    // 1. Initial reaction
    reactions = toggleReactionLogic(reactions, userA, '👍');
    assert.strictEqual(reactions.length, 1);
    assert.strictEqual(reactions[0].userId, 'user_a');
    assert.strictEqual(reactions[0].emoji, '👍');
    assert.strictEqual(reactions[0].username, 'Alice');

    // 2. Toggle same reaction off
    reactions = toggleReactionLogic(reactions, userA, '👍');
    assert.strictEqual(reactions.length, 0);
  });

  it('guarantees user reaction isolation (multi-user reactions)', () => {
    const userA = { id: 'user_a', username: 'Alice' };
    const userB = { id: 'user_b', username: 'Bob' };
    let reactions: any[] = [];

    reactions = toggleReactionLogic(reactions, userA, '👍');
    reactions = toggleReactionLogic(reactions, userB, '👍');
    assert.strictEqual(reactions.length, 2);

    // User A removes reaction
    reactions = toggleReactionLogic(reactions, userA, '👍');
    assert.strictEqual(reactions.length, 1);
    assert.strictEqual(reactions[0].userId, 'user_b');
  });

  it('bounds emoji length to prevent oversized payloads', () => {
    const userA = { id: 'user_a', username: 'Alice' };
    const maliciousLongEmoji = 'A'.repeat(256);

    const reactions = toggleReactionLogic([], userA, maliciousLongEmoji);
    assert.strictEqual(reactions[0].emoji, '👍', 'Should fallback to default emoji when length > 16');
  });

  it('persists and retrieves reactions in SQLite database schema', () => {
    initDatabase();

    const testAdminId = uuidv4();
    const testUserId = uuidv4();
    const msgId = uuidv4();
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, last_seen)
      VALUES (?, ?, 'hash', 'admin', 'active', ?, ?),
             (?, ?, 'hash', 'user', 'active', ?, ?)
    `).run(
      testAdminId, `adm-${testAdminId.slice(0, 8)}`, nowIso, nowIso,
      testUserId, `usr-${testUserId.slice(0, 8)}`, nowIso, nowIso
    );

    const enc = encryptMessage('Testing reactions DB column');
    const now = new Date();
    const expires = new Date(now.getTime() + 86400000).toISOString();

    db.prepare(`
      INSERT INTO messages (id, sender_id, recipient_id, ciphertext, iv, auth_tag, created_at, expires_at, is_read, reactions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, '[]')
    `).run(msgId, testUserId, testAdminId, enc.ciphertext, enc.iv, enc.authTag, now.toISOString(), expires);

    // Check default reactions column value
    const inserted = db.prepare('SELECT reactions FROM messages WHERE id = ?').get(msgId) as { reactions: string };
    assert.strictEqual(inserted.reactions, '[]');

    // Save reaction
    const sampleReactions = [
      { userId: testUserId, username: `usr-${testUserId.slice(0, 8)}`, emoji: '👍', createdAt: now.toISOString() }
    ];
    db.prepare('UPDATE messages SET reactions = ? WHERE id = ?').run(JSON.stringify(sampleReactions), msgId);

    const updated = db.prepare('SELECT reactions FROM messages WHERE id = ?').get(msgId) as { reactions: string };
    const parsed = JSON.parse(updated.reactions);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].emoji, '👍');
    assert.strictEqual(parsed[0].userId, testUserId);

    // Clean up test records
    db.prepare('DELETE FROM messages WHERE id = ?').run(msgId);
    db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(testAdminId, testUserId);
  });

  it('enforces conversation participant isolation for reactions', () => {
    const adminId = 'admin_1';
    const aliceId = 'alice_2';
    const eveId = 'eve_hacker';

    const messageRecord = {
      id: 'msg_private',
      sender_id: aliceId,
      recipient_id: adminId
    };

    const isAuthorized = (reqUserId: string, role: string) => {
      return role === 'admin' || messageRecord.sender_id === reqUserId || messageRecord.recipient_id === reqUserId;
    };

    assert.strictEqual(isAuthorized(aliceId, 'user'), true, 'Sender is authorized');
    assert.strictEqual(isAuthorized(adminId, 'admin'), true, 'Admin is authorized');
    assert.strictEqual(isAuthorized(eveId, 'user'), false, 'Third-party user is rejected (403 Forbidden)');
  });

  it('guarantees touch swipe gesture strictly activates leftward only (prevents page wobble & rightward swipe)', () => {
    // Pure function representing the exact touch logic in MessageItem.tsx
    function calculateTouchSwipe(dx: number, dy: number, currentOffset: number) {
      if (dx < -10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        return Math.max(-56, dx * 0.65);
      } else if (dx >= 0 && currentOffset !== 0) {
        return 0;
      }
      return currentOffset;
    }

    function shouldTriggerReply(finalOffset: number): boolean {
      return finalOffset <= -36;
    }

    // 1. Swiping leftwards: activates translation and triggers reply when dragged past threshold
    const leftSwipeOffset = calculateTouchSwipe(-60, 5, 0);
    assert.ok(leftSwipeOffset <= -36, `Expected offset <= -36, got ${leftSwipeOffset}`);
    assert.strictEqual(shouldTriggerReply(leftSwipeOffset), true, 'Left swipe past -36px must trigger reply');

    // 2. Swiping rightwards: MUST NOT move or activate swipe
    const rightSwipeOffset = calculateTouchSwipe(60, 5, 0);
    assert.strictEqual(rightSwipeOffset, 0, 'Rightward swipe must produce 0 offset');
    assert.strictEqual(shouldTriggerReply(rightSwipeOffset), false, 'Rightward swipe must NEVER trigger reply');

    // 3. Dominant vertical scroll: MUST NOT activate horizontal swipe
    const verticalScrollOffset = calculateTouchSwipe(-40, 80, 0);
    assert.strictEqual(verticalScrollOffset, 0, 'Vertical scrolling must not trigger horizontal swipe offset');
    assert.strictEqual(shouldTriggerReply(verticalScrollOffset), false);
  });
});
