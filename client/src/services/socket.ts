import { io, Socket } from 'socket.io-client';
import { useChatStore } from '../stores/chatStore.js';

let socket: Socket | null = null;
let visibilityAttached = false;

export function getSocket(): Socket | null {
  return socket;
}

export function initSocket(token: string): Socket {
  if (socket) {
    socket.disconnect();
  }

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

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
