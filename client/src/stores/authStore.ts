import { create } from 'zustand';
import { User, api } from '../services/api.js';
import { initSocket, disconnectSocket } from '../services/socket.js';

interface AuthState {
  token: string | null;
  user: User | null;
  adminInfo: { id: string; username: string; lastSeen: string; isOnline?: boolean } | null;
  isLoading: boolean;
  theme: 'dark' | 'light';
  login: (token: string, user: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
  checkAuth: () => Promise<void>;
  toggleTheme: () => void;
}

const savedTheme = (typeof window !== 'undefined' ? (localStorage.getItem('xmessenger_theme') as 'dark' | 'light') : null) || 'dark';

if (typeof window !== 'undefined') {
  if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('xmessenger_token'),
  user: null,
  adminInfo: null,
  isLoading: true,
  theme: savedTheme,

  login: (token, user) => {
    localStorage.setItem('xmessenger_token', token);
    initSocket(token);
    set({ token, user, isLoading: false });
  },

  logout: () => {
    localStorage.removeItem('xmessenger_token');
    disconnectSocket();
    set({ token: null, user: null, adminInfo: null, isLoading: false });
  },

  setUser: (user) => set({ user }),

  checkAuth: async () => {
    const token = localStorage.getItem('xmessenger_token');
    if (!token) {
      set({ isLoading: false, user: null, token: null });
      return;
    }

    try {
      set({ isLoading: true });
      const data = await api.getMe();
      initSocket(token);
      set({ user: data.user, adminInfo: data.adminInfo, token, isLoading: false });
    } catch (err) {
      console.error('Session expired or invalid:', err);
      localStorage.removeItem('xmessenger_token');
      set({ token: null, user: null, adminInfo: null, isLoading: false });
      disconnectSocket();
    }
  },

  toggleTheme: () => {
    const current = get().theme;
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('xmessenger_theme', next);
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    set({ theme: next });
  }
}));
