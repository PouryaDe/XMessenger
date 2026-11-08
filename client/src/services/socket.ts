import { io, Socket } from 'socket.io-client';
import { useChatStore } from '../stores/chatStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { playReceiveSound } from '../utils/sound.js';
import { notifyIncomingMessage } from '../utils/notifications.js';
import { AdminUserItem } from './api.js';

let socket: Socket | null = null;
let currentToken: string | null = null;
let visibilityAttached = false;

// Auto-initialize socket immediately on module load if user already has an active token
const initialSavedToken = typeof window !== 'undefined' ? localStorage.getItem('xmessenger_token') : null;
if (initialSavedToken) {
  try {
    initSocket(initialSavedToken);
  } catch (e) {
    console.warn('[Socket] Initial startup connect warning:', e);
  }
}

export function getSocket(): Socket | null {
  if (!socket) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('xmessenger_token') : null;
    if (token) {
      return initSocket(token);
    }
  }
  return socket;
}

export function initSocket(token: string): Socket {
  // If socket already exists with the identical active token and is connected or connecting, retain it!
  if (socket && currentToken === token && (socket.connected || socket.active)) {
    return socket;
  }

  if (socket) {
    socket.disconnect();
  }

  currentToken = token;
  socket = io(window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
    timeout: 10000
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected to real-time server');
    // Silently sync missed messages on reconnect
    useChatStore.getState().syncMessages();
    window.dispatchEvent(new CustomEvent('socket:connect', { detail: socket }));
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
    if (reason === 'io server disconnect') {
      socket?.connect();
    }
  });

  // Global Real-time Message Handler (Permanent, zero listener churn on navigation)
  socket.on('message:new', (msg) => {
    const authStore = useAuthStore.getState();
    const currentUserId = authStore.user?.id || '';
    const isOwn = msg.senderId === currentUserId;

    useChatStore.getState().addMessage({ ...msg, isOwn });

    if (!isOwn && msg.senderId !== currentUserId) {
      playReceiveSound();
      const senderName = authStore.user?.role === 'admin'
        ? (msg.senderUsername || 'کاربر')
        : (authStore.adminInfo?.username || 'مدیریت');
      notifyIncomingMessage(senderName, msg.text);
    }
  });

  socket.on('message:sent', (msg) => {
    useChatStore.getState().addMessage({ ...msg, isOwn: true });
  });

  socket.on('message:deleted', ({ messageId }) => {
    useChatStore.getState().removeMessage(messageId);
  });

  socket.on('conversation:cleared', () => {
    useChatStore.getState().clearMessages();
  });

  socket.on('messages:read', ({ readerId }: { readerId: string }) => {
    useChatStore.getState().markMessagesReadByRecipient(readerId);
  });

  socket.on('conversation:read_sync', ({ userId }: { userId: string }) => {
    useChatStore.getState().syncReadUser(userId);
  });

  socket.on('message:reaction', ({ messageId, reactions }: { messageId: string; reactions: any[] }) => {
    useChatStore.getState().updateMessageReactions(messageId, reactions);
  });

  socket.on('presence:init', ({ onlineUserIds }: { onlineUserIds: string[] }) => {
    onlineUserIds.forEach((id) => useChatStore.getState().setOnlineStatus(id, true));
  });

  socket.on('user:online_status', ({ userId, isOnline, lastSeen }) => {
    useChatStore.getState().setOnlineStatus(userId, isOnline, lastSeen);
  });

  socket.on('admin:online_status', ({ isOnline, lastSeen }) => {
    useChatStore.getState().setAdminOnline(isOnline);
    if (lastSeen) useChatStore.getState().setAdminLastSeen(lastSeen);
  });

  socket.on('typing', ({ userId, isTyping }) => {
    if (userId) {
      useChatStore.getState().setTyping(userId, isTyping);
    }
  });

  socket.on('user:registered', (newUser: AdminUserItem) => {
    useChatStore.getState().addAdminUser(newUser);
  });

  socket.on('user:pending_approval', (newUser: AdminUserItem) => {
    useChatStore.getState().addAdminUser(newUser);
  });

  socket.on('user:status_changed', ({ userId, status }: { userId: string; status: 'active' | 'pending' | 'banned' }) => {
    useChatStore.getState().updateAdminUserStatus(userId, status);
  });

  socket.on('user:deleted', ({ userId }: { userId: string }) => {
    useChatStore.getState().removeAdminUser(userId);
  });

  // Re-sync messages and reconnect if needed when returning to the tab or unlocking phone
  if (!visibilityAttached && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (socket && !socket.connected) {
          socket.connect();
        }
        useChatStore.getState().syncMessages();
      }
    });
    visibilityAttached = true;
  }

  window.dispatchEvent(new CustomEvent('socket:ready', { detail: socket }));
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentToken = null;
  }
}
