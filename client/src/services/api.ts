const API_BASE = '/api';

export interface AppMeta {
  registrationEnabled: boolean;
  requireApproval: boolean;
  defaultTtl: number;
  appName?: string;
  pwaShortName?: string;
  pwaIconUrl?: string;
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
  status: 'active' | 'pending' | 'banned';
  avatarUrl?: string;
  created_at?: string;
  last_seen?: string;
}

export interface AdminUserItem extends User {
  unreadCount?: number;
  isOnline?: boolean;
  lastMessage?: {
    id: string;
    text: string;
    createdAt: string;
    expiresAt: string;
    isFromAdmin: boolean;
  } | null;
}

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  text: string;
  createdAt: string;
  expiresAt: string;
  isRead: boolean;
  isOwn?: boolean;
}

export interface AdminSettings {
  registrationEnabled: boolean;
  requireApproval: boolean;
  defaultTtlSeconds: number;
  appName?: string;
  pwaShortName?: string;
  pwaIconUrl?: string;
  adminAvatarUrl?: string;
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('xmessenger_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function safeJson<T = any>(res: Response, defaultErrorMsg: string): Promise<T> {
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) {
        throw new Error(`${defaultErrorMsg} (${res.status} ${res.statusText || 'Server Error'})`);
      }
      throw new Error(defaultErrorMsg);
    }
  }

  if (!res.ok) {
    const errorMsg = data && (data.message || data.error);
    throw new Error(errorMsg || `${defaultErrorMsg} (${res.status})`);
  }

  return data as T;
}

export const api = {
  // Public Meta
  async getMeta(): Promise<AppMeta> {
    const res = await fetch(`${API_BASE}/auth/meta`);
    return safeJson<AppMeta>(res, 'Failed to fetch app meta');
  },

  // Auth
  async login(username: string, password: string): Promise<{ token: string; user: User }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return safeJson<{ token: string; user: User }>(res, 'Login failed');
  },

  async register(username: string, password: string): Promise<{ token: string; user: User; message: string }> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return safeJson<{ token: string; user: User; message: string }>(res, 'Registration failed');
  },

  async getMe(): Promise<{ user: User; adminInfo: { id: string; username: string; lastSeen: string; isOnline?: boolean; avatarUrl?: string } | null }> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { ...getAuthHeader() }
    });
    return safeJson<{ user: User; adminInfo: { id: string; username: string; lastSeen: string; isOnline?: boolean; avatarUrl?: string } | null }>(res, 'Failed to fetch user');
  },

  async uploadAvatar(file: File): Promise<{ success: boolean; avatarUrl: string; message: string }> {
    const formData = new FormData();
    formData.append('avatar', file);
    const res = await fetch(`${API_BASE}/auth/avatar`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
      body: formData
    });
    return safeJson<{ success: boolean; avatarUrl: string; message: string }>(res, 'Failed to upload avatar');
  },

  async deleteAvatar(): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/auth/avatar`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() }
    });
    return safeJson<{ success: boolean }>(res, 'Failed to delete avatar');
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    return safeJson<{ success: boolean; message: string }>(res, 'Failed to change password');
  },

  // Messages
  async getMessages(targetUserId?: string): Promise<{ messages: Message[] }> {
    const url = targetUserId ? `${API_BASE}/messages?userId=${targetUserId}` : `${API_BASE}/messages`;
    const res = await fetch(url, {
      headers: { ...getAuthHeader() }
    });
    return safeJson<{ messages: Message[] }>(res, 'Failed to fetch messages');
  },

  async sendMessage(text: string, targetUserId?: string, ttlSeconds?: number): Promise<{ message: Message }> {
    const res = await fetch(`${API_BASE}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ text, targetUserId, ttlSeconds })
    });
    return safeJson<{ message: Message }>(res, 'Failed to send message');
  },

  async uploadChatImage(file: File): Promise<{ success: boolean; url: string; filename: string; size: number }> {
    const formData = new FormData();
    formData.append('image', file);

    const res = await fetch(`${API_BASE}/messages/upload`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
      body: formData
    });
    return safeJson<{ success: boolean; url: string; filename: string; size: number }>(res, 'Failed to upload image');
  },

  async deleteMessage(messageId: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/messages/${messageId}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() }
    });
    return safeJson<{ success: boolean }>(res, 'Failed to delete message');
  },

  async clearUserChat(): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/messages/clear-all/my-chat`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() }
    });
    return safeJson<{ success: boolean }>(res, 'Failed to clear chat');
  },

  // Admin
  async getAdminUsers(): Promise<{ users: AdminUserItem[] }> {
    const res = await fetch(`${API_BASE}/admin/users`, {
      headers: { ...getAuthHeader() }
    });
    return safeJson<{ users: AdminUserItem[] }>(res, 'Failed to fetch users');
  },

  async updateUserStatus(userId: string, status: 'active' | 'pending' | 'banned'): Promise<{ success: boolean; status: string }> {
    const res = await fetch(`${API_BASE}/admin/users/${userId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ status })
    });
    return safeJson<{ success: boolean; status: string }>(res, 'Failed to update user status');
  },

  async deleteUser(userId: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() }
    });
    return safeJson<{ success: boolean }>(res, 'Failed to delete user');
  },

  async getAdminSettings(): Promise<AdminSettings> {
    const res = await fetch(`${API_BASE}/admin/settings`, {
      headers: { ...getAuthHeader() }
    });
    return safeJson<AdminSettings>(res, 'Failed to get settings');
  },

  async updateAdminSettings(settings: Partial<AdminSettings>): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/admin/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(settings)
    });
    return safeJson<{ success: boolean }>(res, 'Failed to update settings');
  },

  async clearAdminConversation(userId: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/admin/conversations/${userId}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() }
    });
    return safeJson<{ success: boolean }>(res, 'Failed to clear conversation');
  },

  // PWA Custom Icon
  async uploadPwaIcon(file: File): Promise<{ success: boolean; pwaIconUrl: string; message: string }> {
    const formData = new FormData();
    formData.append('icon', file);
    const res = await fetch(`${API_BASE}/admin/pwa-icon`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
      body: formData
    });
    return safeJson<{ success: boolean; pwaIconUrl: string; message: string }>(res, 'Failed to upload PWA icon');
  },

  async deletePwaIcon(): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/admin/pwa-icon`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() }
    });
    return safeJson<{ success: boolean }>(res, 'Failed to reset PWA icon');
  },

  // Database Backup & Restore
  async downloadBackup(): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/backup`, {
      headers: { ...getAuthHeader() }
    });
    if (!res.ok) {
      const data = await safeJson(res, 'Failed to download database backup');
      throw new Error(data.message || 'Failed to download database backup');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    const contentDisp = res.headers.get('content-disposition');
    let filename = `xmessenger-backup-${new Date().toISOString().slice(0, 10)}.db`;
    if (contentDisp && contentDisp.includes('filename=')) {
      filename = contentDisp.split('filename=')[1].replace(/['"]/g, '').trim();
    }
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  async restoreBackup(file: File): Promise<{ success: boolean; message: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/admin/restore`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
      body: formData
    });
    return safeJson<{ success: boolean; message: string }>(res, 'Failed to restore database');
  }
};
