import { io, Socket } from 'socket.io-client';
import { useChatStore } from '../stores/chatStore.js';

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
