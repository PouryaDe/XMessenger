import { create } from 'zustand';
import { Message, AdminUserItem, api } from '../services/api.js';
import { getSocket } from '../services/socket.js';

interface ChatState {
  messages: Message[];
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
  loadMessages: (targetUserId?: string) => Promise<void>;
  syncMessages: () => Promise<void>;
  markConversationAsRead: (partnerId: string) => void;
  markMessagesReadByRecipient: (readerId: string) => void;
  syncReadUser: (userId: string) => void;
  sendMessage: (text: string, targetUserId?: string, ttlSeconds?: number) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  addMessage: (msg: Message) => void;
  removeMessage: (messageId: string) => void;
  clearMessages: () => void;
  setOnlineStatus: (userId: string, isOnline: boolean, lastSeen?: string) => void;
  setAdminOnline: (isOnline: boolean) => void;
  setAdminLastSeen: (lastSeen: string) => void;
  setTyping: (userId: string, isTyping: boolean) => void;
  sendTyping: (isTyping: boolean, targetUserId?: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  activeUserId: null,
  adminUsers: [],
  isAdminOnline: false,
  adminLastSeen: null,
  onlineUsers: {},
  lastSeenUsers: {},
  typingUsers: {},
  isLoadingMessages: false,

  setActiveUserId: (id) => {
    set({ activeUserId: id });
    if (id) {
      // Immediately clear unread badge for this user (0ms instant sync)
      get().markConversationAsRead(id);
      get().loadMessages(id);
    } else {
      set({ messages: [] });
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

  loadMessages: async (targetUserId) => {
    try {
      set({ isLoadingMessages: true });
      const data = await api.getMessages(targetUserId);
      set({ messages: data.messages, isLoadingMessages: false });
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
    const { activeUserId } = get();
    try {
      const data = await api.getMessages(activeUserId || undefined);
      // Merge silently without flickering loading state
      set({ messages: data.messages });
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
    set((state) => ({
      messages: state.messages.map((m) => 
        (m.recipientId === readerId || m.isOwn) ? { ...m, isRead: true } : m
      )
    }));
  },

  syncReadUser: (userId: string) => {
    set((state) => ({
      adminUsers: state.adminUsers.map((u) => 
        u.id === userId ? { ...u, unreadCount: 0 } : u
      )
    }));
  },

  sendMessage: async (text, targetUserId, ttlSeconds) => {
    const socket = getSocket();
    if (socket && socket.connected) {
      return new Promise<void>((resolve, reject) => {
        let settled = false;

        // Fallback to REST if socket does not acknowledge within 2500ms
        const timeout = setTimeout(async () => {
          if (!settled) {
            settled = true;
            try {
              const res = await api.sendMessage(text, targetUserId, ttlSeconds);
              get().addMessage({ ...res.message, isOwn: true });
              resolve();
            } catch (err: any) {
              reject(err);
            }
          }
        }, 2500);

        socket.emit('message:send', { text, targetUserId, ttlSeconds }, async (res: any) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);

          if (res?.error) {
            console.warn('[Socket] message:send error from server:', res.error);
            try {
              const apiRes = await api.sendMessage(text, targetUserId, ttlSeconds);
              get().addMessage({ ...apiRes.message, isOwn: true });
              resolve();
            } catch (err: any) {
              reject(new Error(res.error || err.message));
            }
          } else if (res?.message) {
            get().addMessage({ ...res.message, isOwn: true });
            resolve();
          } else {
            resolve();
          }
        });
      });
    } else {
      // Direct REST delivery
      const res = await api.sendMessage(text, targetUserId, ttlSeconds);
      get().addMessage({ ...res.message, isOwn: true });
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

  addMessage: (msg) => {
    const { activeUserId } = get();
    // If msg is from the user that the admin is currently viewing, mark it read immediately!
    if (activeUserId && msg.senderId === activeUserId) {
      get().markConversationAsRead(activeUserId);
    }

    set((state) => {
      // Prevent duplicates
      const exists = state.messages.some((m) => m.id === msg.id);
      const newMessages = exists ? state.messages : [...state.messages, msg];

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

      return {
        messages: newMessages,
        adminUsers: updatedAdminUsers
      };
    });
  },

  removeMessage: (messageId) => {
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId)
    }));
  },

  clearMessages: () => {
    set({ messages: [] });
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
