const API_BASE = '/api';

export interface AppMeta {
  registrationEnabled: boolean;
  requireApproval: boolean;
  systemEnabled?: boolean;
  defaultTtl: number;
  appName?: string;
  pwaShortName?: string;
  pwaIconUrl?: string;
  version?: string;
  buildVersion?: string;
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
  category?: string | null;
  lastMessage?: {
    id: string;
    text: string;
    createdAt: string;
    expiresAt: string;
    isFromAdmin: boolean;
  } | null;
}

export interface MessageReaction {
  userId: string;
  username: string;
  avatarUrl?: string;
  emoji: string;
  createdAt: string;
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
  replyToId?: string | null;
  forwardFrom?: string | null;
  status?: 'sending' | 'sent' | 'failed';
  reactions?: MessageReaction[];
}

export interface ChannelMeta {
  title: string;
  description: string;
  subscribersCount: number;
}

export interface ChannelPost {
  id: string;
  adminId: string;
  text: string;
  createdAt: string;
  viewsCount: number;
  reactions?: MessageReaction[];
  hasViewed?: boolean;
}

export interface ChannelViewer {
  userId: string;
  username: string;
  avatarUrl?: string;
  category?: string;
  viewedAt: string;
}

export interface AdminSettings {
  registrationEnabled: boolean;
  requireApproval: boolean;
  systemEnabled?: boolean;
  showAdminPresence?: boolean;
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

export class ApiError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function safeJson<T = any>(res: Response, defaultErrorMsg: string): Promise<T> {
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) {
        throw new ApiError(`${defaultErrorMsg} (${res.status} ${res.statusText || 'Server Error'})`, 'SERVER_ERROR', res.status);
      }
      throw new ApiError(defaultErrorMsg, 'PARSE_ERROR');
    }
  }

  if (!res.ok) {
    const errorCode = data && data.error;
    const errorMsg = data && (data.message || data.error);
    if (typeof window !== 'undefined') {
      if (res.status === 403 && (errorCode === 'ACCOUNT_BANNED' || /suspended|banned/i.test(errorMsg || ''))) {
        window.dispatchEvent(new CustomEvent('auth:banned'));
      } else if (res.status === 503 && errorCode === 'SYSTEM_DISABLED') {
        window.dispatchEvent(new CustomEvent('system:status_changed', { detail: { systemEnabled: false } }));
      }
    }
    throw new ApiError(errorMsg || `${defaultErrorMsg} (${res.status})`, errorCode, res.status);
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

  async sendMessage(text: string, targetUserId?: string, ttlSeconds?: number, replyToId?: string | null): Promise<{ message: Message }> {
    const res = await fetch(`${API_BASE}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ text, targetUserId, ttlSeconds, replyToId })
    });
    return safeJson<{ message: Message }>(res, 'Failed to send message');
  },

  async uploadChatAttachment(file: File): Promise<{
    success: boolean;
    url: string;
    filename: string;
    storedName: string;
    size: number;
    mimetype: string;
    isImage: boolean;
  }> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/messages/upload`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
      body: formData
    });
    return safeJson<{
      success: boolean;
      url: string;
      filename: string;
      storedName: string;
      size: number;
      mimetype: string;
      isImage: boolean;
    }>(res, 'Failed to upload attachment');
  },

  async uploadChatImage(file: File): Promise<{ success: boolean; url: string; filename: string; size: number }> {
    return this.uploadChatAttachment(file);
  },

  async deleteMessage(messageId: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/messages/${messageId}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() }
    });
    return safeJson<{ success: boolean }>(res, 'Failed to delete message');
  },

  async reactToMessage(messageId: string, emoji: string = '👍'): Promise<{ success: boolean; reactions: MessageReaction[] }> {
    const res = await fetch(`${API_BASE}/messages/${messageId}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ emoji })
    });
    return safeJson<{ success: boolean; reactions: MessageReaction[] }>(res, 'Failed to react to message');
  },

  async markMessagesAsRead(partnerId: string): Promise<{ success: boolean; count: number }> {
    const res = await fetch(`${API_BASE}/messages/${partnerId}/read`, {
      method: 'POST',
      headers: { ...getAuthHeader() }
    });
    return safeJson<{ success: boolean; count: number }>(res, 'Failed to mark messages as read');
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

  // Admin Private Notes (Encrypted with AES-256-GCM)
  async getUserNotes(userId: string): Promise<{ notes: string; updatedAt: string | null }> {
    const res = await fetch(`${API_BASE}/admin/users/${userId}/notes`, {
      headers: { ...getAuthHeader() }
    });
    return safeJson<{ notes: string; updatedAt: string | null }>(res, 'Failed to get user notes');
  },

  async updateUserNotes(userId: string, notes: string): Promise<{ success: boolean; notes: string; updatedAt: string | null }> {
    const res = await fetch(`${API_BASE}/admin/users/${userId}/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ notes })
    });
    return safeJson<{ success: boolean; notes: string; updatedAt: string | null }>(res, 'Failed to update user notes');
  },

  // Admin User Categorization
  async updateUserCategory(userId: string, category: string | null): Promise<{ success: boolean; category: string | null }> {
    const res = await fetch(`${API_BASE}/admin/users/${userId}/category`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ category })
    });
    return safeJson<{ success: boolean; category: string | null }>(res, 'Failed to update user category');
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
  },

  // Web Push Notifications
  async getVapidPublicKey(): Promise<{ publicKey: string }> {
    const res = await fetch(`${API_BASE}/push/vapid-public-key`);
    return safeJson<{ publicKey: string }>(res, 'Failed to get VAPID key');
  },

  async getPushStatus(): Promise<{ subscribed: boolean; activeDevices: number }> {
    const res = await fetch(`${API_BASE}/push/status`, {
      headers: { ...getAuthHeader() }
    });
    return safeJson<{ subscribed: boolean; activeDevices: number }>(res, 'Failed to get push status');
  },

  async savePushSubscription(subscription: any): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ subscription })
    });
    return safeJson<{ success: boolean; message: string }>(res, 'Failed to save push subscription');
  },

  async removePushSubscription(endpoint: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/push/unsubscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ endpoint })
    });
    return safeJson<{ success: boolean; message: string }>(res, 'Failed to remove push subscription');
  },

  async sendTestPush(): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/push/test`, {
      method: 'POST',
      headers: { ...getAuthHeader() }
    });
    return safeJson<{ success: boolean; message: string }>(res, 'Failed to send test push notification');
  },

  // Broadcast Channel Methods
  async getChannelMeta(): Promise<ChannelMeta> {
    const res = await fetch(`${API_BASE}/channel/meta`, {
      headers: { ...getAuthHeader() }
    });
    return safeJson<ChannelMeta>(res, 'Failed to fetch channel meta');
  },

  async getChannelPosts(): Promise<{ posts: ChannelPost[] }> {
    const res = await fetch(`${API_BASE}/channel/posts`, {
      headers: { ...getAuthHeader() }
    });
    return safeJson<{ posts: ChannelPost[] }>(res, 'Failed to fetch channel posts');
  },

  async createChannelPost(text: string): Promise<{ success: boolean; post: ChannelPost }> {
    const res = await fetch(`${API_BASE}/channel/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ text })
    });
    return safeJson<{ success: boolean; post: ChannelPost }>(res, 'Failed to create channel post');
  },

  async deleteChannelPost(postId: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/channel/posts/${postId}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() }
    });
    return safeJson<{ success: boolean }>(res, 'Failed to delete channel post');
  },

  async viewChannelPost(postId: string): Promise<{ success: boolean; viewsCount: number }> {
    const res = await fetch(`${API_BASE}/channel/posts/${postId}/view`, {
      method: 'POST',
      headers: { ...getAuthHeader() }
    });
    return safeJson<{ success: boolean; viewsCount: number }>(res, 'Failed to record post view');
  },

  async getChannelPostViewers(postId: string): Promise<{ viewers: ChannelViewer[] }> {
    const res = await fetch(`${API_BASE}/channel/posts/${postId}/viewers`, {
      headers: { ...getAuthHeader() }
    });
    return safeJson<{ viewers: ChannelViewer[] }>(res, 'Failed to fetch post viewers');
  },

  async reactChannelPost(postId: string, emoji?: string): Promise<{ success: boolean; reactions: MessageReaction[] }> {
    const res = await fetch(`${API_BASE}/channel/posts/${postId}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ emoji })
    });
    return safeJson<{ success: boolean; reactions: MessageReaction[] }>(res, 'Failed to react to channel post');
  },

  async forwardChannelPost(postId: string, targetUserId?: string): Promise<{ success: boolean; message: Message }> {
    const res = await fetch(`${API_BASE}/channel/posts/${postId}/forward`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ targetUserId })
    });
    return safeJson<{ success: boolean; message: Message }>(res, 'Failed to forward channel post');
  }
};
