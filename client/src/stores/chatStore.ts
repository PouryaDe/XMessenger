import { create } from 'zustand';
import { Message, AdminUserItem, api } from '../services/api.js';
import { getSocket } from '../services/socket.js';

interface ChatState {
  messages: Message[];
  activeUserId: string | null; // Selected user for Admin
  adminUsers: AdminUserItem[];
  isAdminOnline: boolean;
  onlineUsers: Record<string, boolean>;
  typingUsers: Record<string, boolean>;
  isLoadingMessages: boolean;

  // Actions
  setActiveUserId: (id: string | null) => void;
  setAdminUsers: (users: AdminUserItem[]) => void;
  loadMessages: (targetUserId?: string) => Promise<void>;
  sendMessage: (text: string, targetUserId?: string, ttlSeconds?: number) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  addMessage: (msg: Message) => void;
  removeMessage: (messageId: string) => void;
  clearMessages: () => void;
  setOnlineStatus: (userId: string, isOnline: boolean) => void;
  setAdminOnline: (isOnline: boolean) => void;
  setTyping: (userId: string, isTyping: boolean) => void;
  sendTyping: (isTyping: boolean, targetUserId?: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  activeUserId: null,
  adminUsers: [],
  isAdminOnline: false,
  onlineUsers: {},
  typingUsers: {},
  isLoadingMessages: false,

  setActiveUserId: (id) => {
    set({ activeUserId: id });
    if (id) {
      get().loadMessages(id);
    } else {
      set({ messages: [] });
    }
  },

  setAdminUsers: (users) => set({ adminUsers: users }),

  loadMessages: async (targetUserId) => {
    try {
      set({ isLoadingMessages: true });
      const data = await api.getMessages(targetUserId);
      set({ messages: data.messages, isLoadingMessages: false });
    } catch (err) {
      console.error('Failed to load messages:', err);
      set({ isLoadingMessages: false });
    }
  },

  sendMessage: async (text, targetUserId, ttlSeconds) => {
    const socket = getSocket();
    if (socket && socket.connected) {
      // Send fast through socket
      socket.emit('message:send', { text, targetUserId, ttlSeconds });
    } else {
      // Fallback to REST
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
    set((state) => {
      // Prevent duplicates
      if (state.messages.some((m) => m.id === msg.id)) {
        return state;
      }
      return { messages: [...state.messages, msg] };
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

  setOnlineStatus: (userId, isOnline) => {
    set((state) => ({
      onlineUsers: { ...state.onlineUsers, [userId]: isOnline }
    }));
  },

  setAdminOnline: (isOnline) => set({ isAdminOnline: isOnline }),

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
