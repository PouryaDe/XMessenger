import { create } from 'zustand';
import { User, api } from '../services/api.js';
import { initSocket, disconnectSocket } from '../services/socket.js';

interface AuthState {
  token: string | null;
  user: User | null;
  adminInfo: { id: string; username: string; lastSeen?: string | null; isOnline?: boolean; showPresence?: boolean; avatarUrl?: string } | null;
  isLoading: boolean;
  systemEnabled: boolean;
  theme: 'dark' | 'light';
  appName: string;
  login: (token: string, user: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
  setSystemEnabled: (enabled: boolean) => void;
  setAppName: (appName: string) => void;
  updateUserAvatar: (avatarUrl?: string) => void;
  updateAdminAvatar: (avatarUrl?: string) => void;
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

const savedToken = typeof window !== 'undefined' ? localStorage.getItem('xmessenger_token') : null;

const savedUser: User | null = typeof window !== 'undefined' ? (() => {
  try {
    const raw = localStorage.getItem('xmessenger_user');
    return raw ? JSON.parse(raw) as User : null;
  } catch {
    return null;
  }
})() : null;

const savedAdminInfo = typeof window !== 'undefined' ? (() => {
  try {
    const raw = localStorage.getItem('xmessenger_admin_info');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})() : null;

const savedAppName = typeof window !== 'undefined' ? (localStorage.getItem('xmessenger_app_name') || 'XMessenger') : 'XMessenger';

export const useAuthStore = create<AuthState>((set, get) => ({
  token: savedToken,
  user: savedUser,
  adminInfo: savedAdminInfo,
  // If we already have token and cached user, don't block the screen with full loader (0ms instant hydration)
  isLoading: Boolean(savedToken && !savedUser),
  systemEnabled: true,
  theme: savedTheme,
  appName: savedAppName,

  login: (token, user) => {
    localStorage.setItem('xmessenger_token', token);
    localStorage.setItem('xmessenger_user', JSON.stringify(user));
    initSocket(token);
    set({ token, user, isLoading: false });
  },

  logout: () => {
    localStorage.removeItem('xmessenger_token');
    localStorage.removeItem('xmessenger_user');
    localStorage.removeItem('xmessenger_admin_info');
    try {
      sessionStorage.removeItem('xmessenger_cached_messages');
    } catch {}
    disconnectSocket();
    set({ token: null, user: null, adminInfo: null, isLoading: false });
  },

  setUser: (user) => {
    try {
      localStorage.setItem('xmessenger_user', JSON.stringify(user));
    } catch {}
    set({ user });
  },

  setSystemEnabled: (systemEnabled: boolean) => {
    set({ systemEnabled });
  },

  setAppName: (appName: string) => {
    const clean = appName?.trim() || 'XMessenger';
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('xmessenger_app_name', clean);
      } catch (_) {}
    }
    set({ appName: clean });
  },

  updateUserAvatar: (avatarUrl?: string) => {
    const current = get().user;
    if (current) {
      const updated = { ...current, avatarUrl };
      try {
        localStorage.setItem('xmessenger_user', JSON.stringify(updated));
      } catch {}
      set({ user: updated });
    }
  },

  updateAdminAvatar: (avatarUrl?: string) => {
    const currentAdmin = get().adminInfo;
    const updated = currentAdmin
      ? { ...currentAdmin, avatarUrl }
      : { id: '', username: 'admin', avatarUrl };
    try {
      localStorage.setItem('xmessenger_admin_info', JSON.stringify(updated));
    } catch {}
    set({ adminInfo: updated });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('xmessenger_token');
    if (!token) {
      set({ isLoading: false, user: null, token: null });
      return;
    }

    try {
      if (!get().user) {
        set({ isLoading: true });
      }
      const data = await api.getMe();
      if ((data as any).systemEnabled !== undefined) {
        set({ systemEnabled: (data as any).systemEnabled });
      }
      try {
        localStorage.setItem('xmessenger_user', JSON.stringify(data.user));
        if (data.adminInfo) {
          localStorage.setItem('xmessenger_admin_info', JSON.stringify(data.adminInfo));
        }
      } catch {}
      initSocket(token);
      set({ user: data.user, adminInfo: data.adminInfo, token, isLoading: false });
    } catch (err: any) {
      const isBannedError = err?.status === 403 && (err?.code === 'ACCOUNT_BANNED' || /suspended|banned/i.test(err?.message || ''));
      if (isBannedError) {
        const current = get().user;
        if (current) {
          const updated = { ...current, status: 'banned' as const };
          try { localStorage.setItem('xmessenger_user', JSON.stringify(updated)); } catch {}
          disconnectSocket();
          set({ user: updated, isLoading: false });
        }
        return;
      }

      const isAuthError = err?.status === 401 || err?.response?.status === 401 || err?.message?.includes('401');
      if (isAuthError) {
        console.error('Session expired or invalid:', err);
        localStorage.removeItem('xmessenger_token');
        localStorage.removeItem('xmessenger_user');
        localStorage.removeItem('xmessenger_admin_info');
        disconnectSocket();
        set({ token: null, user: null, adminInfo: null, isLoading: false });
      } else {
        console.warn('Network issue during checkAuth, retaining cached session:', err);
        initSocket(token);
        set({ isLoading: false });
      }
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

if (typeof window !== 'undefined') {
  window.addEventListener('auth:banned', () => {
    const current = useAuthStore.getState().user;
    if (current && current.status !== 'banned') {
      const updated = { ...current, status: 'banned' as const };
      try { localStorage.setItem('xmessenger_user', JSON.stringify(updated)); } catch {}
      disconnectSocket();
      useAuthStore.getState().setUser(updated);
    }
  });

  window.addEventListener('system:status_changed', (e: any) => {
    if (e.detail && typeof e.detail.systemEnabled === 'boolean') {
      useAuthStore.getState().setSystemEnabled(e.detail.systemEnabled);
    }
  });
}
