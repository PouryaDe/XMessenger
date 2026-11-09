import { create } from 'zustand';
import { Message, MessageReaction, AdminUserItem, api } from '../services/api.js';
import { getSocket } from '../services/socket.js';
import { useAuthStore } from './authStore.js';
import { playSendSound } from '../utils/sound.js';

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
  updateAdminUserCategory: (userId: string, category: string | null) => void;
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

export const getAdminUserSortTime = (u: AdminUserItem): number => {
  if (u.lastMessage?.createdAt) {
    const t = new Date(u.lastMessage.createdAt).getTime();
    if (!isNaN(t)) return t;
  }
  return 0;
};

export const sortAdminUsersByLastMessage = (users: AdminUserItem[]): AdminUserItem[] => {
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
};

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

    const sanitizedUsers = sortAdminUsersByLastMessage(users.map((u) => {
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
    }));

    set({ adminUsers: sanitizedUsers, onlineUsers: onlineMap, lastSeenUsers: lastSeenMap });
  },

  addAdminUser: (user) => {
    set((state) => {
      const exists = state.adminUsers.some((u) => u.id === user.id);
      let updated: AdminUserItem[];
      if (exists) {
        updated = state.adminUsers.map((u) => u.id === user.id ? { ...u, ...user } : u);
      } else {
        updated = [user, ...state.adminUsers];
      }
      return {
        adminUsers: sortAdminUsersByLastMessage(updated)
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

  updateAdminUserCategory: (userId, category) => {
    set((state) => ({
      adminUsers: state.adminUsers.map((u) =>
        u.id === userId ? { ...u, category } : u
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
        if (m.recipientId === readerId && !m.isRead) {
          changed = true;
          return { ...m, isRead: true };
        }
        return m;
      });

      // Also update messages in conversation cache
      const cached = state.messagesByConversation[readerId];
      let updatedCache: Message[] | null = null;
      if (cached) {
        updatedCache = cached.map((m) => {
          if (m.recipientId === readerId && !m.isRead) {
            return { ...m, isRead: true };
          }
          return m;
        });
      }

      if (!changed && !updatedCache) return state;

      return {
        messages: updatedMessages,
        messagesByConversation: updatedCache ? {
          ...state.messagesByConversation,
          [readerId]: updatedCache
        } : state.messagesByConversation
      };
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
            playSendSound();
            resolve();
          } else {
            playSendSound();
            resolve();
          }
        });
      });
    } else {
      // Direct REST delivery
      try {
        const res = await api.sendMessage(text, targetUserId, ttlSeconds, replyToId);
        get().replaceMessage(tempId, { ...res.message, isOwn: true, status: 'sent' });
        playSendSound();
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
    const authStore = useAuthStore.getState();
    const currentUserId = authStore.user?.id || '';
    const isCurrentUserAdmin = authStore.user?.role === 'admin';
    const { activeUserId } = get();

    // Determine target conversation key
    let convPartnerId: string;
    if (isCurrentUserAdmin) {
      convPartnerId = (msg.senderId === currentUserId ? msg.recipientId : msg.senderId) || activeUserId || 'main';
    } else {
      convPartnerId = 'main';
    }

    const isActive = isCurrentUserAdmin ? (activeUserId === convPartnerId) : true;

    // If incoming message in the active chat, mark it read immediately!
    if (isActive && msg.senderId !== currentUserId) {
      get().markConversationAsRead(isCurrentUserAdmin ? convPartnerId : (authStore.adminInfo?.id || msg.senderId));
    }

    set((state) => {
      // 1. Target conversation message list
      const targetList = state.messagesByConversation[convPartnerId] || (isActive ? state.messages : []);

      // Check if message already exists by id or matches a pending optimistic message
      const existingIdx = targetList.findIndex((m) => m.id === msg.id);
      const pendingIdx = targetList.findIndex(
        (m) =>
          (m.id.startsWith('temp_') || m.status === 'sending') &&
          m.text === msg.text &&
          (m.isOwn || m.senderId === msg.senderId)
      );
      let updatedTargetList: Message[];

      if (existingIdx !== -1) {
        const cur = targetList[existingIdx];
        if (
          cur.isRead === msg.isRead &&
          cur.text === msg.text &&
          cur.expiresAt === msg.expiresAt &&
          cur.status === msg.status
        ) {
          return state; // No-op, preserve reference!
        }
        updatedTargetList = [...targetList];
        updatedTargetList[existingIdx] = { ...cur, ...msg };
      } else if (pendingIdx !== -1) {
        // If it's a confirmed message matching a pending optimistic message, replace in-place!
        updatedTargetList = [...targetList];
        updatedTargetList[pendingIdx] = { ...msg, isOwn: true, status: 'sent' };
      } else {
        updatedTargetList = [...targetList, msg];
      }

      // 2. Update adminUsers lastMessage and unreadCount in real time (for Admin)
      let updatedAdminUsers = state.adminUsers;
      if (isCurrentUserAdmin) {
        const isBrandNewMessage = existingIdx === -1 && pendingIdx === -1;
        let found = false;
        updatedAdminUsers = state.adminUsers.map((u) => {
          if (u.id === convPartnerId) {
            found = true;
            const isSender = u.id === msg.senderId;
            const newUnread = isActive ? 0 : (isBrandNewMessage && isSender ? (u.unreadCount || 0) + 1 : (u.unreadCount || 0));
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

        // If user is not yet in adminUsers list (e.g. freshly registered), add them dynamically
        if (!found && convPartnerId && convPartnerId !== 'main') {
          const isSender = convPartnerId === msg.senderId;
          const dynamicUser: AdminUserItem = {
            id: convPartnerId,
            username: (msg as any).senderUsername || `user_${convPartnerId.substring(0, 6)}`,
            role: 'user',
            status: 'active',
            created_at: msg.createdAt,
            last_seen: msg.createdAt,
            unreadCount: isActive ? 0 : (isSender ? 1 : 0),
            isOnline: true,
            lastMessage: {
              id: msg.id,
              text: msg.text,
              createdAt: msg.createdAt,
              expiresAt: msg.expiresAt,
              isFromAdmin: !isSender
            }
          };
          updatedAdminUsers = [dynamicUser, ...updatedAdminUsers];
        }

        updatedAdminUsers = sortAdminUsersByLastMessage(updatedAdminUsers);
      }

      // 3. Update state
      const nextByConv = {
        ...state.messagesByConversation,
        [convPartnerId]: updatedTargetList
      };

      if (isActive) {
        try {
          sessionStorage.setItem('xmessenger_cached_messages', JSON.stringify(updatedTargetList.slice(-50)));
        } catch {}

        return {
          messages: updatedTargetList,
          messagesByConversation: nextByConv,
          adminUsers: updatedAdminUsers
        };
      } else {
        return {
          messagesByConversation: nextByConv,
          adminUsers: updatedAdminUsers
        };
      }
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
