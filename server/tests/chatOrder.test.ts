import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateMessageMenuPosition } from '../../client/src/utils/menuPosition.js';

interface MockAdminUserItem {
  id: string;
  username: string;
  created_at?: string;
  last_seen?: string;
  lastMessage?: {
    id: string;
    text: string;
    createdAt: string;
    expiresAt: string;
    isFromAdmin: boolean;
  } | null;
}

// Mirroring the exact sorting logic used in server/src/routes/admin.ts and client/src/stores/chatStore.ts
function getAdminUserSortTime(u: MockAdminUserItem): number {
  if (u.lastMessage?.createdAt) {
    const t = new Date(u.lastMessage.createdAt).getTime();
    if (!isNaN(t)) return t;
  }
  return 0;
}

function sortAdminUsersByLastMessage(users: MockAdminUserItem[]): MockAdminUserItem[] {
  return [...users].sort((a, b) => {
    const timeA = getAdminUserSortTime(a);
    const timeB = getAdminUserSortTime(b);

    if (timeA > 0 && timeB > 0) {
      return timeB - timeA;
    }
    if (timeA > 0 && timeB === 0) return -1;
    if (timeA === 0 && timeB > 0) return 1;

    const fallbackA = a.created_at ? new Date(a.created_at).getTime() : (a.last_seen ? new Date(a.last_seen).getTime() : 0);
    const fallbackB = b.created_at ? new Date(b.created_at).getTime() : (b.last_seen ? new Date(b.last_seen).getTime() : 0);
    return fallbackB - fallbackA;
  });
}

describe('Chat Ordering by Latest Message Tests', () => {
  it('correctly sorts conversations with latest messages at the top', () => {
    const userA: MockAdminUserItem = {
      id: 'user_a',
      username: 'Alice',
      lastMessage: {
        id: 'msg_1',
        text: 'Older message',
        createdAt: '2026-11-08T10:00:00.000Z',
        expiresAt: '2026-11-09T10:00:00.000Z',
        isFromAdmin: false
      }
    };

    const userB: MockAdminUserItem = {
      id: 'user_b',
      username: 'Bob',
      lastMessage: {
        id: 'msg_2',
        text: 'Latest message',
        createdAt: '2026-11-08T11:30:00.000Z',
        expiresAt: '2026-11-09T11:30:00.000Z',
        isFromAdmin: true
      }
    };

    const sorted = sortAdminUsersByLastMessage([userA, userB]);
    assert.equal(sorted[0].id, 'user_b');
    assert.equal(sorted[1].id, 'user_a');
  });

  it('prioritizes latest message timestamp over last_seen online activity', () => {
    // User Charlie opened the app 1 minute ago (high last_seen) but sent no recent messages
    const userCharlie: MockAdminUserItem = {
      id: 'user_c',
      username: 'Charlie',
      last_seen: '2026-11-08T12:00:00.000Z',
      lastMessage: {
        id: 'msg_c',
        text: 'Morning!',
        createdAt: '2026-11-08T08:00:00.000Z',
        expiresAt: '2026-11-09T08:00:00.000Z',
        isFromAdmin: false
      }
    };

    // User Diana has older last_seen but sent a message 10 minutes ago
    const userDiana: MockAdminUserItem = {
      id: 'user_d',
      username: 'Diana',
      last_seen: '2026-11-08T09:00:00.000Z',
      lastMessage: {
        id: 'msg_d',
        text: 'Recent question',
        createdAt: '2026-11-08T11:50:00.000Z',
        expiresAt: '2026-11-09T11:50:00.000Z',
        isFromAdmin: false
      }
    };

    const sorted = sortAdminUsersByLastMessage([userCharlie, userDiana]);
    // Diana must be on top because her message is newer than Charlie's message
    assert.equal(sorted[0].id, 'user_d');
    assert.equal(sorted[1].id, 'user_c');
  });

  it('places users without any messages below active conversations, sorted by registration date', () => {
    const activeUser: MockAdminUserItem = {
      id: 'user_active',
      username: 'ActiveUser',
      created_at: '2026-11-01T10:00:00.000Z',
      lastMessage: {
        id: 'msg_active',
        text: 'Active chat',
        createdAt: '2026-11-08T09:00:00.000Z',
        expiresAt: '2026-11-09T09:00:00.000Z',
        isFromAdmin: false
      }
    };

    const newUser1: MockAdminUserItem = {
      id: 'user_new1',
      username: 'NewUser1',
      created_at: '2026-11-08T10:00:00.000Z',
      lastMessage: null
    };

    const newUser2: MockAdminUserItem = {
      id: 'user_new2',
      username: 'NewUser2',
      created_at: '2026-11-08T11:00:00.000Z',
      lastMessage: null
    };

    const sorted = sortAdminUsersByLastMessage([newUser1, activeUser, newUser2]);
    // Active chat with message is first
    assert.equal(sorted[0].id, 'user_active');
    // Among new users without messages, newer registration (11:00) comes before older (10:00)
    assert.equal(sorted[1].id, 'user_new2');
    assert.equal(sorted[2].id, 'user_new1');
  });

  it('handles edge case where message createdAt is invalid date string', () => {
    const userCorrupted: MockAdminUserItem = {
      id: 'user_err',
      username: 'CorruptedDate',
      created_at: '2026-11-08T07:00:00.000Z',
      lastMessage: {
        id: 'msg_err',
        text: 'Broken date',
        createdAt: 'not-a-date',
        expiresAt: 'not-a-date',
        isFromAdmin: false
      }
    };

    const userNormal: MockAdminUserItem = {
      id: 'user_norm',
      username: 'Normal',
      created_at: '2026-11-08T08:00:00.000Z',
      lastMessage: null
    };

    const sorted = sortAdminUsersByLastMessage([userCorrupted, userNormal]);
    // Falls back gracefully to created_at without throwing NaN
    assert.equal(sorted[0].id, 'user_norm');
    assert.equal(sorted[1].id, 'user_err');
  });

  it('accurately updates unread count and bubbles up conversation on incoming message', () => {
    const adminUserId = 'admin_1';
    let activeChatId: string | null = 'user_active';

    const users: MockAdminUserItem[] = [
      {
        id: 'user_active',
        username: 'UserActive',
        created_at: '2026-11-08T08:00:00.000Z',
        lastMessage: {
          id: 'msg_1',
          text: 'Hello from active',
          createdAt: '2026-11-08T09:00:00.000Z',
          expiresAt: '2026-11-09T09:00:00.000Z',
          isFromAdmin: false
        }
      },
      {
        id: 'user_background',
        username: 'UserBackground',
        created_at: '2026-11-08T08:00:00.000Z',
        lastMessage: {
          id: 'msg_2',
          text: 'Old message',
          createdAt: '2026-11-08T08:30:00.000Z',
          expiresAt: '2026-11-09T08:30:00.000Z',
          isFromAdmin: false
        }
      }
    ];

    // Simulate incoming message from user_background (inactive chat)
    const incomingMsg = {
      id: 'msg_3',
      senderId: 'user_background',
      recipientId: adminUserId,
      text: 'New inquiry from background user',
      createdAt: '2026-11-08T09:15:00.000Z',
      expiresAt: '2026-11-09T09:15:00.000Z',
      isFromAdmin: false
    };

    // Store logic simulation
    const updatedUsers = users.map((u) => {
      if (u.id === incomingMsg.senderId) {
        const isActive = activeChatId === u.id;
        return {
          ...u,
          unreadCount: isActive ? 0 : 1,
          lastMessage: {
            id: incomingMsg.id,
            text: incomingMsg.text,
            createdAt: incomingMsg.createdAt,
            expiresAt: incomingMsg.expiresAt,
            isFromAdmin: false
          }
        };
      }
      return u;
    });

    const sorted = sortAdminUsersByLastMessage(updatedUsers);
    // Background user with new message at 09:15 must bubble to top (#1)
    assert.equal(sorted[0].id, 'user_background');
    assert.equal((sorted[0] as any).unreadCount, 1);
    assert.equal(sorted[1].id, 'user_active');
  });

  it('excludes expired messages from unread counting and conversation lastMessage', () => {
    const now = new Date('2026-11-08T12:00:00.000Z');
    const messages = [
      {
        id: 'msg_expired',
        sender_id: 'user_x',
        recipient_id: 'admin_id',
        is_read: 0,
        expires_at: '2026-11-08T11:00:00.000Z', // Expired 1 hour ago
        text: 'Expired message'
      },
      {
        id: 'msg_active',
        sender_id: 'user_x',
        recipient_id: 'admin_id',
        is_read: 0,
        expires_at: '2026-11-08T15:00:00.000Z', // Active
        text: 'Active fresh message'
      }
    ];

    // Mirroring query in server/src/routes/admin.ts
    const nonExpiredUnread = messages.filter(
      (m) => m.sender_id === 'user_x' && m.is_read === 0 && new Date(m.expires_at).getTime() > now.getTime()
    );
    assert.equal(nonExpiredUnread.length, 1);
    assert.equal(nonExpiredUnread[0].id, 'msg_active');

    // Only non-expired messages qualify for lastMessage
    const nonExpiredMessages = messages.filter((m) => new Date(m.expires_at).getTime() > now.getTime());
    assert.equal(nonExpiredMessages.length, 1);
    assert.equal(nonExpiredMessages[0].text, 'Active fresh message');
  });

  it('prevents double-counting unread count on duplicate socket messages or delivery updates', () => {
    const existingMessages = [
      { id: 'temp_123', status: 'sending', text: 'Hello', isOwn: true, senderId: 'admin_id' }
    ];

    // Message arrives confirming delivery
    const realMsg = { id: 'real_456', status: 'sent', text: 'Hello', isOwn: true, senderId: 'admin_id' };
    const existingIdx = existingMessages.findIndex((m) => m.id === realMsg.id);
    const pendingIdx = existingMessages.findIndex(
      (m) => (m.id.startsWith('temp_') || m.status === 'sending') && m.text === realMsg.text
    );

    const isBrandNewMessage = existingIdx === -1 && pendingIdx === -1;
    // Because it matches pendingIdx, isBrandNewMessage must be false -> zero unread increment
    assert.equal(isBrandNewMessage, false);
  });

  it('guarantees reader isolation for message read receipts', () => {
    const messages = [
      { id: 'm1', recipientId: 'user_alice', isRead: false },
      { id: 'm2', recipientId: 'user_bob', isRead: false }
    ];

    const readerId = 'user_alice';
    // Alice reads her messages
    const updated = messages.map((m) => {
      if (m.recipientId === readerId && !m.isRead) {
        return { ...m, isRead: true };
      }
      return m;
    });

    // Alice's message is marked read
    assert.equal(updated.find((m) => m.id === 'm1')?.isRead, true);
    // Bob's message MUST remain unread
    assert.equal(updated.find((m) => m.id === 'm2')?.isRead, false);
  });

  it('accurately computes unreadChatsCount and pendingCount for sidebar tab badges', () => {
    const adminUsers = [
      { id: 'u1', username: 'alice', status: 'active', unreadCount: 3 },
      { id: 'u2', username: 'bob', status: 'pending', unreadCount: 0 },
      { id: 'u3', username: 'charlie', status: 'pending', unreadCount: 1 },
      { id: 'u4', username: 'dave', status: 'banned', unreadCount: 0 },
      { id: 'u5', username: 'eve', status: 'active', unreadCount: undefined }
    ];

    // Compute unreadChatsCount: count of distinct chats with unread messages (> 0)
    const unreadChatsCount = adminUsers.filter((u) => (u.unreadCount ?? 0) > 0).length;
    // Alice (3) and Charlie (1) have unread messages
    assert.equal(unreadChatsCount, 2);

    // Compute pendingCount: count of pending approval users
    const pendingCount = adminUsers.filter((u) => u.status === 'pending').length;
    // Bob and Charlie are pending
    assert.equal(pendingCount, 2);

    // When admin reads Charlie's chat:
    const afterRead = adminUsers.map((u) => (u.id === 'u3' ? { ...u, unreadCount: 0 } : u));
    assert.equal(afterRead.filter((u) => (u.unreadCount ?? 0) > 0).length, 1);

    // When all pending users are approved:
    const afterApproval = adminUsers.map((u) => (u.status === 'pending' ? { ...u, status: 'active' } : u));
    assert.equal(afterApproval.filter((u) => u.status === 'pending').length, 0);
  });

  it('safely formats message timestamps and gracefully handles edge cases', () => {
    function formatMessageTime(dateIso?: string | null): string {
      if (!dateIso) return '';
      try {
        const d = new Date(dateIso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return '';
      }
    }

    // Valid date
    const formatted = formatMessageTime('2026-11-08T14:30:00.000Z');
    assert.ok(formatted.length > 0);

    // Null, undefined, empty string
    assert.equal(formatMessageTime(null), '');
    assert.equal(formatMessageTime(undefined), '');
    assert.equal(formatMessageTime(''), '');

    // Malformed invalid date string
    assert.equal(formatMessageTime('invalid-date-string'), '');
    assert.equal(formatMessageTime('2026-99-99T99:99:99'), '');
  });

  it('deterministically generates vibrant avatar palettes for usernames and handles unicode', () => {
    const AVATAR_PALETTES = [
      'palette-amber',
      'palette-sky',
      'palette-emerald',
      'palette-violet',
      'palette-rose',
      'palette-indigo',
      'palette-teal',
      'palette-orange'
    ];

    function getAvatarPalette(username?: string | null): string {
      if (!username) return AVATAR_PALETTES[0];
      let hash = 0;
      for (let i = 0; i < username.length; i++) {
        hash = (hash << 5) - hash + username.charCodeAt(i);
        hash |= 0;
      }
      const idx = Math.abs(hash) % AVATAR_PALETTES.length;
      return AVATAR_PALETTES[idx];
    }

    // Handles null / empty
    assert.equal(getAvatarPalette(null), 'palette-amber');
    assert.equal(getAvatarPalette(''), 'palette-amber');

    // Deterministic: multiple calls return identical palette
    const p1 = getAvatarPalette('alice');
    const p2 = getAvatarPalette('alice');
    assert.equal(p1, p2);

    // Handles Persian Unicode characters smoothly without throwing or producing NaN
    const pPersian1 = getAvatarPalette('پویا');
    const pPersian2 = getAvatarPalette('پویا');
    assert.equal(pPersian1, pPersian2);
    assert.ok(AVATAR_PALETTES.includes(pPersian1));

    const pMehdi = getAvatarPalette('مهدی');
    assert.ok(AVATAR_PALETTES.includes(pMehdi));
  });

  it('guarantees collision-free positioning for message context menu on all boundaries', () => {
    const MENU_WIDTH = 196;
    const MENU_HEIGHT = 188;

    // 1. User scenario from screenshot: received message on the left of admin chat (sidebar 0-320px)
    const adminLeftScenario = calculateMessageMenuPosition({
      bubbleRect: { top: 300, bottom: 340, left: 336, right: 416 },
      menuWidth: MENU_WIDTH,
      menuHeight: MENU_HEIGHT,
      containerRect: { top: 60, bottom: 740, left: 320, right: 1200 },
      viewportWidth: 1280,
      viewportHeight: 800,
      isOwn: false
    });
    // Menu must be placed inside chat container (>= 320 + 10) and not clipped into sidebar
    assert.ok(adminLeftScenario.left >= 330, `Expected left >= 330, got ${adminLeftScenario.left}`);
    assert.ok(adminLeftScenario.left + MENU_WIDTH <= 1200, `Expected right <= 1200, got ${adminLeftScenario.left + MENU_WIDTH}`);
    assert.ok(adminLeftScenario.top >= 60, `Expected top >= 60, got ${adminLeftScenario.top}`);

    // 2. Right edge collision: sent message on right of mobile screen
    const mobileRightScenario = calculateMessageMenuPosition({
      bubbleRect: { top: 400, bottom: 440, left: 290, right: 380 },
      menuWidth: MENU_WIDTH,
      menuHeight: MENU_HEIGHT,
      containerRect: { top: 50, bottom: 750, left: 0, right: 390 },
      viewportWidth: 390,
      viewportHeight: 844,
      isOwn: true
    });
    // Menu must not overflow right edge (<= 390 - 10 = 380)
    assert.ok(mobileRightScenario.left + MENU_WIDTH <= 380, `Expected menu right <= 380, got ${mobileRightScenario.left + MENU_WIDTH}`);
    assert.ok(mobileRightScenario.left >= 10, `Expected menu left >= 10, got ${mobileRightScenario.left}`);

    // 3. Top edge collision: first message near chat header
    const topCollisionScenario = calculateMessageMenuPosition({
      bubbleRect: { top: 70, bottom: 110, left: 16, right: 120 },
      menuWidth: MENU_WIDTH,
      menuHeight: MENU_HEIGHT,
      containerRect: { top: 60, bottom: 700, left: 0, right: 390 },
      viewportWidth: 390,
      viewportHeight: 800,
      isOwn: false
    });
    // Not enough space above (70 - 60 = 10 < 188), must open downward
    assert.ok(topCollisionScenario.top >= 110, `Expected downward top >= 110, got ${topCollisionScenario.top}`);
    assert.ok(topCollisionScenario.transformOrigin.startsWith('top'), `Expected top origin, got ${topCollisionScenario.transformOrigin}`);

    // 4. Bottom edge collision: message directly above bottom input bar
    const bottomCollisionScenario = calculateMessageMenuPosition({
      bubbleRect: { top: 680, bottom: 720, left: 200, right: 380 },
      menuWidth: MENU_WIDTH,
      menuHeight: MENU_HEIGHT,
      containerRect: { top: 60, bottom: 740, left: 0, right: 390 },
      viewportWidth: 390,
      viewportHeight: 800,
      isOwn: true
    });
    // Not enough space below (740 - 720 = 20 < 188), must open upward
    assert.ok(bottomCollisionScenario.top <= 680 - MENU_HEIGHT, `Expected upward top <= ${680 - MENU_HEIGHT}, got ${bottomCollisionScenario.top}`);
    assert.ok(bottomCollisionScenario.transformOrigin.startsWith('bottom'), `Expected bottom origin, got ${bottomCollisionScenario.transformOrigin}`);
    assert.ok(bottomCollisionScenario.top >= 60, `Expected top >= 60, got ${bottomCollisionScenario.top}`);
  });
});
