import { create } from 'zustand';
import { Message, MessageReaction, AdminUserItem, api } from '../services/api.js';
import { getSocket } from '../services/socket.js';
import { useAuthStore } from './authStore.js';

interface ChatState {
  messages: Message[];
  messagesByConversation: Record<string, Message[]>; // Fast in-memory cache per conversation for 0ms chat switching
  activeUserId: string | null; // Selected user for Admin
  adminUsers: AdminUserItem[];
  isAdminOnline: boolean;
  adminLastSeen: string | null;
  onlineUsers: Record<string, boolean>;
  lastSeenUsers: Record<string, string>;
  typingUsers: Record<string, boolean>;
  isLoadingMessages: boolean;

  // Actions
  setActiveUserId: (id: string | null) => void;
  setAdminUsers: (users: AdminUserItem[]) => void;
  addAdminUser: (user: AdminUserItem) => void;
  updateAdminUserStatus: (userId: string, status: 'active' | 'pending' | 'banned') => void;
  removeAdminUser: (userId: string) => void;
  loadMessages: (targetUserId?: string) => Promise<void>;
  syncMessages: () => Promise<void>;
  markConversationAsRead: (partnerId: string) => void;
  markMessagesReadByRecipient: (readerId: string) => void;
  syncReadUser: (userId: string) => void;
  sendMessage: (text: string, targetUserId?: string, ttlSeconds?: number, replyToId?: string | null) => Promise<void>;
  replaceMessage: (tempId: string, realMsg: Message) => void;
  updateMessageStatus: (messageId: string, status: 'sending' | 'sent' | 'failed') => void;
  deleteMessage: (messageId: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji?: string) => Promise<void>;
  updateMessageReactions: (messageId: string, reactions: MessageReaction[]) => void;
  addMessage: (msg: Message) => void;
  removeMessage: (messageId: string) => void;
  clearMessages: () => void;
  setOnlineStatus: (userId: string, isOnline: boolean, lastSeen?: string) => void;
  setAdminOnline: (isOnline: boolean) => void;
  setAdminLastSeen: (lastSeen: string) => void;
  setTyping: (userId: string, isTyping: boolean) => void;
  sendTyping: (isTyping: boolean, targetUserId?: string) => void;
}

// Read cached messages from session for 0ms instant hydration on refresh / PWA reloads
const initialCachedMessages: Message[] = typeof window !== 'undefined' ? (() => {
  try {
    const raw = sessionStorage.getItem('xmessenger_cached_messages');
    return raw ? JSON.parse(raw) as Message[] : [];
  } catch {
    return [];
  }
})() : [];

export const useChatStore = create<ChatState>((set, get) => ({
  messages: initialCachedMessages,
  messagesByConversation: {},
  activeUserId: null,
  adminUsers: [],
  isAdminOnline: false,
  adminLastSeen: null,
  onlineUsers: {},
  lastSeenUsers: {},
  typingUsers: {},
  isLoadingMessages: false,

  setActiveUserId: (id) => {
    const prevActiveId = get().activeUserId;
    if (prevActiveId === id) return;

    // Cache previous messages under previous active user ID
    const currentMsgs = get().messages;
    const prevKey = prevActiveId || 'main';
    const updatedCache = {
      ...get().messagesByConversation,
      ...(currentMsgs.length > 0 ? { [prevKey]: currentMsgs } : {})
    };

    const nextKey = id || 'main';
    const cachedMessages = id ? (updatedCache[nextKey] || []) : [];

    // Instant UI switch (0ms) - Never display previous user's chat!
    set({
      activeUserId: id,
      messagesByConversation: updatedCache,
      messages: cachedMessages,
      isLoadingMessages: Boolean(id) && cachedMessages.length === 0
    });

    if (id) {
      // Immediately clear unread badge for this user (0ms instant sync)
      get().markConversationAsRead(id);
      get().loadMessages(id);
    }
  },

  setAdminUsers: (users) => {
    const { activeUserId, onlineUsers, lastSeenUsers } = get();
    const onlineMap: Record<string, boolean> = { ...onlineUsers };
    const lastSeenMap: Record<string, string> = { ...lastSeenUsers };

    const sanitizedUsers = users.map((u) => {
      if (typeof u.isOnline === 'boolean') {
        onlineMap[u.id] = u.isOnline;
      }
      if (u.last_seen) {
        lastSeenMap[u.id] = u.last_seen;
      }
      // If admin is currently in this user chat, unreadCount must stay 0
      if (activeUserId && u.id === activeUserId) {
        return { ...u, unreadCount: 0 };
      }
      return u;
    });

    set({ adminUsers: sanitizedUsers, onlineUsers: onlineMap, lastSeenUsers: lastSeenMap });
  },

  addAdminUser: (user) => {
    set((state) => {
      const exists = state.adminUsers.some((u) => u.id === user.id);
      if (exists) {
        return {
          adminUsers: state.adminUsers.map((u) => u.id === user.id ? { ...u, ...user } : u)
        };
      }
      return {
        adminUsers: [user, ...state.adminUsers]
      };
    });
  },

  updateAdminUserStatus: (userId, status) => {
    set((state) => ({
      adminUsers: state.adminUsers.map((u) => 
        u.id === userId ? { ...u, status } : u
      )
    }));
  },

  removeAdminUser: (userId) => {
    set((state) => ({
      adminUsers: state.adminUsers.filter((u) => u.id !== userId),
      activeUserId: state.activeUserId === userId ? null : state.activeUserId
    }));
  },

  loadMessages: async (targetUserId) => {
    try {
      const cacheKey = targetUserId || 'main';
      const cached = get().messagesByConversation[cacheKey];
      if (!cached || cached.length === 0) {
        set({ isLoadingMessages: true });
      }

      const data = await api.getMessages(targetUserId);

      // Race condition protection: ensure admin did not switch away to another chat while fetching
      const currentActiveId = get().activeUserId;
      const isTargetStillActive = targetUserId ? (currentActiveId === targetUserId) : (!currentActiveId);

      const nextCache = {
        ...get().messagesByConversation,
        [cacheKey]: data.messages
      };

      if (isTargetStillActive) {
        set({
          messages: data.messages,
          messagesByConversation: nextCache,
          isLoadingMessages: false
        });
        try {
          sessionStorage.setItem('xmessenger_cached_messages', JSON.stringify(data.messages.slice(-50)));
        } catch {}
      } else {
        set({ messagesByConversation: nextCache });
      }

      if (targetUserId) {
        set((state) => ({
          adminUsers: state.adminUsers.map((u) => 
            u.id === targetUserId ? { ...u, unreadCount: 0 } : u
          )
        }));
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
      set({ isLoadingMessages: false });
    }
  },

  syncMessages: async () => {
    const { activeUserId, messages: currentMessages } = get();
    try {
      const data = await api.getMessages(activeUserId || undefined);
      const newMessages = data.messages || [];

      // Check if messages have meaningfully changed before updating Zustand state
      const hasChanged =
        currentMessages.length !== newMessages.length ||
        newMessages.some((nm, idx) => {
          const cm = currentMessages[idx];
          return (
            !cm ||
            cm.id !== nm.id ||
            cm.text !== nm.text ||
            cm.isRead !== nm.isRead ||
            cm.expiresAt !== nm.expiresAt ||
            cm.replyToId !== nm.replyToId
          );
        });

      if (hasChanged) {
        set({ messages: newMessages });
        try {
          sessionStorage.setItem('xmessenger_cached_messages', JSON.stringify(newMessages.slice(-50)));
        } catch {}
      }

      if (activeUserId) {
        set((state) => ({
          adminUsers: state.adminUsers.map((u) => 
            u.id === activeUserId ? { ...u, unreadCount: 0 } : u
          )
        }));
      }
    } catch (err) {
      console.warn('Background sync failed:', err);
    }
  },

  markConversationAsRead: (partnerId: string) => {
    // 1. Optimistically zero the unreadCount in adminUsers
    set((state) => ({
      adminUsers: state.adminUsers.map((u) => 
        u.id === partnerId ? { ...u, unreadCount: 0 } : u
      )
    }));

    // 2. Emit socket event for instant 0ms real-time sync
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('conversation:read', { partnerId });
    }

    // 3. Fallback REST endpoint
    api.markMessagesAsRead(partnerId).catch(() => {});
  },

  markMessagesReadByRecipient: (readerId: string) => {
    set((state) => {
      let changed = false;
      const updatedMessages = state.messages.map((m) => {
        if ((m.recipientId === readerId || m.isOwn) && !m.isRead) {
          changed = true;
          return { ...m, isRead: true };
        }
        return m;
      });
      if (!changed) return state;
      return { messages: updatedMessages };
    });
  },

  syncReadUser: (userId: string) => {
    set((state) => ({
      adminUsers: state.adminUsers.map((u) => 
        u.id === userId ? { ...u, unreadCount: 0 } : u
      )
    }));
  },

  replaceMessage: (tempId: string, realMsg: Message) => {
    set((state) => {
      const realExists = state.messages.some((m) => m.id === realMsg.id);
      let newMessages: Message[];
      if (realExists) {
        newMessages = state.messages.filter((m) => m.id !== tempId);
      } else {
        newMessages = state.messages.map((m) => (m.id === tempId ? realMsg : m));
      }
      try {
        sessionStorage.setItem('xmessenger_cached_messages', JSON.stringify(newMessages.slice(-50)));
      } catch {}
      const convKey = state.activeUserId || 'main';
      return {
        messages: newMessages,
        messagesByConversation: {
          ...state.messagesByConversation,
          [convKey]: newMessages
        }
      };
    });
  },

  updateMessageStatus: (messageId: string, status: 'sending' | 'sent' | 'failed') => {
    set((state) => {
      const newMessages = state.messages.map((m) => (m.id === messageId ? { ...m, status } : m));
      return { messages: newMessages };
    });
  },

  sendMessage: async (text, targetUserId, ttlSeconds, replyToId) => {
    const authStore = useAuthStore.getState();
    const currentUserId = authStore.user?.id || '';
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expiryDate = new Date(Date.now() + (ttlSeconds || 86400) * 1000).toISOString();

    // 1. Optimistic message insertion (instant 0ms delivery on UI, no lag or jump)
    const optimisticMessage: Message = {
      id: tempId,
      senderId: currentUserId,
      recipientId: targetUserId || authStore.adminInfo?.id || '',
      text,
      createdAt: new Date().toISOString(),
      expiresAt: expiryDate,
      isRead: false,
      isOwn: true,
      replyToId: replyToId || null,
      status: 'sending'
    };

    get().addMessage(optimisticMessage);

    const socket = getSocket();
    if (socket && socket.connected) {
      return new Promise<void>((resolve, reject) => {
        let settled = false;

        // Fallback to REST if socket does not acknowledge within 2500ms
        const timeout = setTimeout(async () => {
          if (!settled) {
            settled = true;
            try {
              const res = await api.sendMessage(text, targetUserId, ttlSeconds, replyToId);
              get().replaceMessage(tempId, { ...res.message, isOwn: true, status: 'sent' });
              resolve();
            } catch (err: any) {
              get().updateMessageStatus(tempId, 'failed');
              reject(err);
            }
          }
        }, 2500);

        socket.emit('message:send', { text, targetUserId, ttlSeconds, replyToId }, async (res: any) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);

          if (res?.error) {
            console.warn('[Socket] message:send error from server:', res.error);
            try {
              const apiRes = await api.sendMessage(text, targetUserId, ttlSeconds, replyToId);
              get().replaceMessage(tempId, { ...apiRes.message, isOwn: true, status: 'sent' });
              resolve();
            } catch (err: any) {
              get().updateMessageStatus(tempId, 'failed');
              reject(new Error(res.error || err.message));
            }
          } else if (res?.message) {
            get().replaceMessage(tempId, { ...res.message, isOwn: true, status: 'sent' });
            resolve();
          } else {
            resolve();
          }
        });
      });
    } else {
      // Direct REST delivery
      try {
        const res = await api.sendMessage(text, targetUserId, ttlSeconds, replyToId);
        get().replaceMessage(tempId, { ...res.message, isOwn: true, status: 'sent' });
      } catch (err) {
        get().updateMessageStatus(tempId, 'failed');
        throw err;
      }
    }
  },

  deleteMessage: async (messageId) => {
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('message:delete', { messageId });
    } else {
      await api.deleteMessage(messageId);
    }
    get().removeMessage(messageId);
  },

  updateMessageReactions: (messageId, reactions) => {
    set((state) => {
      const idx = state.messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return state;
      const cur = state.messages[idx];
      if (JSON.stringify(cur.reactions || []) === JSON.stringify(reactions)) {
        return state;
      }
      const updated = [...state.messages];
      updated[idx] = { ...cur, reactions };
      try {
        sessionStorage.setItem('xmessenger_cached_messages', JSON.stringify(updated.slice(-50)));
      } catch {}
      const convKey = state.activeUserId || 'main';
      return {
        messages: updated,
        messagesByConversation: {
          ...state.messagesByConversation,
          [convKey]: updated
        }
      };
    });
  },

  toggleReaction: async (messageId, emoji = '👍') => {
    const authUser = useAuthStore.getState().user;
    if (!authUser) return;

    // 1. Optimistic toggle
    const currentMsgs = get().messages;
    const msg = currentMsgs.find((m) => m.id === messageId);
    if (msg) {
      const curReactions = msg.reactions || [];
      const hasReaction = curReactions.some((r) => r.userId === authUser.id && r.emoji === emoji);
      let nextReactions: MessageReaction[];
      if (hasReaction) {
        nextReactions = curReactions.filter((r) => !(r.userId === authUser.id && r.emoji === emoji));
      } else {
        nextReactions = [
          ...curReactions.filter((r) => r.userId !== authUser.id),
          {
            userId: authUser.id,
            username: authUser.username,
            avatarUrl: authUser.avatarUrl,
            emoji,
            createdAt: new Date().toISOString()
          }
        ];
      }
      get().updateMessageReactions(messageId, nextReactions);
    }

    // 2. Transmit via socket or fallback to REST
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('message:react', { messageId, emoji }, (res: any) => {
        if (res?.reactions) {
          get().updateMessageReactions(messageId, res.reactions);
        }
      });
    } else {
      try {
        const res = await api.reactToMessage(messageId, emoji);
        if (res?.reactions) {
          get().updateMessageReactions(messageId, res.reactions);
        }
      } catch (err) {
        console.warn('Failed to react via REST:', err);
      }
    }
  },

  addMessage: (msg) => {
    const { activeUserId } = get();
    // If msg is from the user that the admin is currently viewing, mark it read immediately!
    if (activeUserId && msg.senderId === activeUserId) {
      get().markConversationAsRead(activeUserId);
    }

    set((state) => {
      // 1. If message already exists by id, check if changed
      const existingIdx = state.messages.findIndex((m) => m.id === msg.id);
      if (existingIdx !== -1) {
        const cur = state.messages[existingIdx];
        if (
          cur.isRead === msg.isRead &&
          cur.text === msg.text &&
          cur.expiresAt === msg.expiresAt &&
          cur.status === msg.status
        ) {
          return state; // No-op, preserve reference!
        }
        const updated = [...state.messages];
        updated[existingIdx] = { ...cur, ...msg };
        return { messages: updated };
      }

      // 2. If it's a confirmed message matching a pending optimistic message, replace in-place!
      const pendingIdx = state.messages.findIndex(
        (m) =>
          (m.id.startsWith('temp_') || m.status === 'sending') &&
          m.text === msg.text &&
          (m.isOwn || m.senderId === msg.senderId)
      );

      let newMessages: Message[];
      if (pendingIdx !== -1) {
        newMessages = [...state.messages];
        newMessages[pendingIdx] = { ...msg, isOwn: true, status: 'sent' };
      } else {
        newMessages = [...state.messages, msg];
      }

      try {
        sessionStorage.setItem('xmessenger_cached_messages', JSON.stringify(newMessages.slice(-50)));
      } catch {}

      // Update adminUsers lastMessage and unreadCount in real time
      const updatedAdminUsers = state.adminUsers.map((u) => {
        if (u.id === msg.senderId || u.id === msg.recipientId) {
          const isSender = u.id === msg.senderId;
          const isActiveChat = activeUserId && u.id === activeUserId;
          const newUnread = isActiveChat ? 0 : (isSender ? (u.unreadCount || 0) + 1 : u.unreadCount || 0);
          return {
            ...u,
            unreadCount: newUnread,
            lastMessage: {
              id: msg.id,
              text: msg.text,
              createdAt: msg.createdAt,
              expiresAt: msg.expiresAt,
              isFromAdmin: !isSender
            }
          };
        }
        return u;
      });

      const convKey = activeUserId || 'main';
      return {
        messages: newMessages,
        messagesByConversation: {
          ...state.messagesByConversation,
          [convKey]: newMessages
        },
        adminUsers: updatedAdminUsers
      };
    });
  },

  removeMessage: (messageId) => {
    set((state) => {
      const newMessages = state.messages.filter((m) => m.id !== messageId);
      const convKey = state.activeUserId || 'main';
      return {
        messages: newMessages,
        messagesByConversation: {
          ...state.messagesByConversation,
          [convKey]: newMessages
        }
      };
    });
  },

  clearMessages: () => {
    try {
      sessionStorage.removeItem('xmessenger_cached_messages');
    } catch {}
    set((state) => {
      const convKey = state.activeUserId || 'main';
      return {
        messages: [],
        messagesByConversation: {
          ...state.messagesByConversation,
          [convKey]: []
        }
      };
    });
  },

  setOnlineStatus: (userId, isOnline, lastSeen) => {
    set((state) => ({
      onlineUsers: { ...state.onlineUsers, [userId]: isOnline },
      lastSeenUsers: lastSeen ? { ...state.lastSeenUsers, [userId]: lastSeen } : state.lastSeenUsers
    }));
  },

  setAdminOnline: (isOnline) => set({ isAdminOnline: isOnline }),

  setAdminLastSeen: (lastSeen) => set({ adminLastSeen: lastSeen }),

  setTyping: (userId, isTyping) => {
    set((state) => ({
      typingUsers: { ...state.typingUsers, [userId]: isTyping }
    }));
  },

  sendTyping: (isTyping, targetUserId) => {
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('typing', { isTyping, targetUserId });
    }
  }
}));
