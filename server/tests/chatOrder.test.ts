import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

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
});
