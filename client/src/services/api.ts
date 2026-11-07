const API_BASE = '/api';

export interface AppMeta {
  registrationEnabled: boolean;
  requireApproval: boolean;
  defaultTtl: number;
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
  status: 'active' | 'pending' | 'banned';
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
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('xmessenger_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  // Public Meta
  async getMeta(): Promise<AppMeta> {
    const res = await fetch(`${API_BASE}/auth/meta`);
    if (!res.ok) throw new Error('Failed to fetch app meta');
    return res.json();
  },

  // Auth
  async login(username: string, password: string): Promise<{ token: string; user: User }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');
    return data;
  },

  async register(username: string, password: string): Promise<{ token: string; user: User; message: string }> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Registration failed');
    return data;
  },

  async getMe(): Promise<{ user: User; adminInfo: { id: string; username: string; lastSeen: string; isOnline?: boolean } | null }> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { ...getAuthHeader() }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch user');
    return data;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to change password');
    return data;
  },

  // Messages
  async getMessages(targetUserId?: string): Promise<{ messages: Message[] }> {
    const url = targetUserId ? `${API_BASE}/messages?userId=${targetUserId}` : `${API_BASE}/messages`;
    const res = await fetch(url, {
      headers: { ...getAuthHeader() }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch messages');
    return data;
  },

  async sendMessage(text: string, targetUserId?: string, ttlSeconds?: number): Promise<{ message: Message }> {
    const res = await fetch(`${API_BASE}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ text, targetUserId, ttlSeconds })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to send message');
    return data;
  },

  async deleteMessage(messageId: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/messages/${messageId}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to delete message');
    return data;
  },

  async clearUserChat(): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/messages/clear-all/my-chat`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to clear chat');
    return data;
  },

  // Admin
  async getAdminUsers(): Promise<{ users: AdminUserItem[] }> {
    const res = await fetch(`${API_BASE}/admin/users`, {
      headers: { ...getAuthHeader() }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch users');
    return data;
  },

  async updateUserStatus(userId: string, status: 'active' | 'pending' | 'banned'): Promise<{ success: boolean; status: string }> {
    const res = await fetch(`${API_BASE}/admin/users/${userId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to update user status');
    return data;
  },

  async deleteUser(userId: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to delete user');
    return data;
  },

  async getAdminSettings(): Promise<AdminSettings> {
    const res = await fetch(`${API_BASE}/admin/settings`, {
      headers: { ...getAuthHeader() }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to get settings');
    return data;
  },

  async updateAdminSettings(settings: Partial<AdminSettings>): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/admin/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(settings)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to update settings');
    return data;
  },

  async clearAdminConversation(userId: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/admin/conversations/${userId}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to clear conversation');
    return data;
  }
};

