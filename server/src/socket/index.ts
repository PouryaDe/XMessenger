import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import { db, getSettingValue } from '../database/index.js';
import { AuthUser } from '../middleware/auth.js';
import { encryptMessage, decryptMessage } from '../utils/crypto.js';
import { dispatchPushForMessage } from '../services/pushService.js';

interface AuthenticatedSocket extends Socket {
  user?: AuthUser;
}

// Track connected sockets per user for 100% accurate online presence
const userSockets = new Map<string, Set<string>>();

export function isUserOnline(userId: string): boolean {
  const sockets = userSockets.get(userId);
  return Boolean(sockets && sockets.size > 0);
}

export function isAnyAdminOnline(): boolean {
  for (const [userId, sockets] of userSockets.entries()) {
    if (sockets.size > 0) {
      const u = db.prepare("SELECT role FROM users WHERE id = ?").get(userId) as { role: string } | undefined;
      if (u?.role === 'admin') return true;
    }
  }
  return false;
}

export function getOnlineUserIds(): string[] {
  const ids: string[] = [];
  for (const [userId, sockets] of userSockets.entries()) {
    if (sockets.size > 0) ids.push(userId);
  }
  return ids;
}

export function setupSocketServer(io: Server) {
  // Authentication middleware for Socket.io
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('AUTHENTICATION_ERROR: Token required'));
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as AuthUser;
      const user = db.prepare('SELECT id, username, role, status, avatar_url FROM users WHERE id = ?').get(decoded.id) as {
        id: string;
        username: string;
        role: 'admin' | 'user';
        status: 'active' | 'pending' | 'banned';
        avatar_url?: string;
      } | undefined;

      if (!user) {
        return next(new Error('USER_NOT_FOUND'));
      }

      if (user.status === 'banned') {
        return next(new Error('ACCOUNT_BANNED'));
      }

      socket.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
        avatarUrl: user.avatar_url || undefined
      };
      next();
    } catch (err) {
      next(new Error('INVALID_TOKEN'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const user = socket.user!;
    const userRoom = `user:${user.id}`;
    socket.join(userRoom);

    if (user.role === 'admin') {
      socket.join('room:admin');
    }

    // Add to active sockets registry
    if (!userSockets.has(user.id)) {
      userSockets.set(user.id, new Set());
    }
    const sockets = userSockets.get(user.id)!;
    const wasOffline = sockets.size === 0;
    sockets.add(socket.id);

    // Update last seen
    const now = new Date().toISOString();
    db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(now, user.id);

    // Broadcast online status to the counterpart only if state transitioned from offline to online
    if (wasOffline) {
      if (user.role === 'user') {
        io.to('room:admin').emit('user:online_status', { userId: user.id, isOnline: true });
      } else {
        io.emit('admin:online_status', { isOnline: true });
      }
    }

    // Immediately inform this newly connected client about counterpart presence state
    if (user.role === 'admin') {
      socket.emit('presence:init', { onlineUserIds: getOnlineUserIds() });
    } else {
      const adminUser = db.prepare("SELECT last_seen FROM users WHERE role = 'admin'").get() as { last_seen: string } | undefined;
      socket.emit('admin:online_status', { isOnline: isAnyAdminOnline(), lastSeen: adminUser?.last_seen });
    }

    // Typing indicators
    socket.on('typing', ({ isTyping, targetUserId }: { isTyping: boolean; targetUserId?: string }) => {
      if (user.role === 'user') {
        io.to('room:admin').emit('typing', {
          userId: user.id,
          username: user.username,
          isTyping
        });
      } else if (user.role === 'admin' && targetUserId) {
        io.to(`user:${targetUserId}`).emit('typing', {
          userId: user.id,
          username: user.username,
          isTyping
        });
      }
    });

    // Send Message via Socket
    socket.on('message:send', ({ text, targetUserId, ttlSeconds, replyToId }: { text: string; targetUserId?: string; ttlSeconds?: number; replyToId?: string | null }, callback) => {
      try {
        const currentUserRow = db.prepare('SELECT id, status, role FROM users WHERE id = ?').get(user.id) as { id: string; status: string; role: string } | undefined;
        if (!currentUserRow || currentUserRow.status === 'banned') {
          if (callback) callback({ error: 'ACCOUNT_BANNED', message: 'Account is suspended' });
          socket.emit('user:status_changed', { userId: user.id, status: 'banned' });
          socket.disconnect(true);
          return;
        }

        if (currentUserRow.status === 'pending') {
          if (callback) callback({ error: 'ACCOUNT_PENDING_APPROVAL' });
          return;
        }

        if (currentUserRow.role === 'user' && getSettingValue('system_enabled', 'true') === 'false') {
          if (callback) callback({ error: 'SYSTEM_DISABLED', message: 'System is currently disabled for maintenance' });
          socket.emit('system:status_changed', { systemEnabled: false });
          return;
        }

        if (!text || !text.trim()) {
          if (callback) callback({ error: 'EMPTY_TEXT' });
          return;
        }

        const validReplyToId = (typeof replyToId === 'string' && replyToId.trim().length > 0 && replyToId.length <= 64)
          ? replyToId.trim()
          : null;

        let recipientId: string;
        if (user.role === 'admin') {
          if (!targetUserId) {
            if (callback) callback({ error: 'MISSING_RECIPIENT' });
            return;
          }
          const recipientCheck = db.prepare('SELECT id, status FROM users WHERE id = ?').get(targetUserId) as { id: string; status: string } | undefined;
          if (!recipientCheck || recipientCheck.status === 'banned') {
            if (callback) callback({ error: 'RECIPIENT_BANNED', message: 'Recipient is banned' });
            return;
          }
          recipientId = targetUserId;
        } else {
          // Regular user can ONLY talk to admin
          const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get() as { id: string } | undefined;
          if (!admin) {
            if (callback) callback({ error: 'ADMIN_NOT_FOUND' });
            return;
          }
          recipientId = admin.id;
        }

        const defaultTtl = parseInt(getSettingValue('default_ttl_seconds', '86400'), 10);
        const activeTtl = (typeof ttlSeconds === 'number' && ttlSeconds > 0) ? ttlSeconds : defaultTtl;

        const messageId = uuidv4();
        const nowTime = new Date();
        const expiresAt = new Date(nowTime.getTime() + activeTtl * 1000).toISOString();
        const createdAt = nowTime.toISOString();

        // Encrypt at rest
        const encrypted = encryptMessage(text.trim());

        db.prepare(`
          INSERT INTO messages (id, sender_id, recipient_id, ciphertext, iv, auth_tag, created_at, expires_at, is_read, reply_to_id, reactions)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '[]')
        `).run(messageId, user.id, recipientId, encrypted.ciphertext, encrypted.iv, encrypted.authTag, createdAt, expiresAt, validReplyToId);

        const messagePayload = {
          id: messageId,
          senderId: user.id,
          recipientId,
          text: text.trim(),
          createdAt,
          expiresAt,
          isRead: false,
          replyToId: validReplyToId,
          reactions: []
        };

        // Emit to recipient and sender with exact message types
        if (user.role === 'admin') {
          // Send to regular user
          io.to(`user:${recipientId}`).emit('message:new', messagePayload);
          // Broadcast to admin's active sockets
          io.to('room:admin').emit('message:sent', messagePayload);
        } else {
          // Regular user sending to admin: emit once to room:admin (which includes all admin sessions)
          io.to('room:admin').emit('message:new', {
            ...messagePayload,
            senderUsername: user.username
          });
          // Broadcast to user's active sockets
          io.to(userRoom).emit('message:sent', messagePayload);
        }

        // Dispatch Web Push notification for background/PWA users
        dispatchPushForMessage(user, recipientId, text.trim()).catch(() => {});

        if (callback) callback({ success: true, message: { ...messagePayload, isOwn: true } });
      } catch (err) {
        console.error('Socket message error:', err);
        if (callback) callback({ error: 'INTERNAL_ERROR' });
      }
    });

    // Mark conversation messages as read (Instant 0ms Sync)
    socket.on('conversation:read', ({ partnerId }: { partnerId: string }, callback) => {
      try {
        if (!partnerId) return;

        const updated = db.prepare(`
          UPDATE messages
          SET is_read = 1
          WHERE recipient_id = ? AND sender_id = ? AND is_read = 0
        `).run(user.id, partnerId);

        if (updated.changes > 0) {
          // Notify sender (partnerId) that their messages were read -> double checkmark instantly
          io.to(`user:${partnerId}`).emit('messages:read', {
            readerId: user.id,
            readAt: new Date().toISOString()
          });

          // Sync unread removal to admin room
          if (user.role === 'admin') {
            io.to('room:admin').emit('conversation:read_sync', {
              userId: partnerId,
              readerId: user.id
            });
          }
        }

        if (callback) callback({ success: true, count: updated.changes });
      } catch (err) {
        console.error('Socket conversation:read error:', err);
        if (callback) callback({ error: 'INTERNAL_ERROR' });
      }
    });

    // Delete message for everyone via Socket
    socket.on('message:delete', ({ messageId }: { messageId: string }, callback) => {
      try {
        const currentUserRow = db.prepare('SELECT id, status, role FROM users WHERE id = ?').get(user.id) as { id: string; status: string; role: string } | undefined;
        if (!currentUserRow || currentUserRow.status === 'banned') {
          if (callback) callback({ error: 'ACCOUNT_BANNED', message: 'Account is suspended' });
          socket.emit('user:status_changed', { userId: user.id, status: 'banned' });
          socket.disconnect(true);
          return;
        }

        const row = db.prepare('SELECT id, sender_id, recipient_id FROM messages WHERE id = ?').get(messageId) as {
          id: string;
          sender_id: string;
          recipient_id: string;
        } | undefined;

        if (!row) {
          if (callback) callback({ error: 'NOT_FOUND' });
          return;
        }

        if (user.role !== 'admin' && row.sender_id !== user.id && row.recipient_id !== user.id) {
          if (callback) callback({ error: 'FORBIDDEN' });
          return;
        }

        // Hard delete
        db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);

        // Notify both sides instantly
        io.to(`user:${row.sender_id}`).emit('message:deleted', { messageId, deletedBy: user.id });
        io.to(`user:${row.recipient_id}`).emit('message:deleted', { messageId, deletedBy: user.id });

        if (callback) callback({ success: true });
      } catch (err) {
        console.error('Socket message delete error:', err);
        if (callback) callback({ error: 'INTERNAL_ERROR' });
      }
    });

    // Toggle reaction on message via Socket
    socket.on('message:react', ({ messageId, emoji }: { messageId: string; emoji?: string }, callback) => {
      try {
        const currentUserRow = db.prepare('SELECT id, status, role FROM users WHERE id = ?').get(user.id) as { id: string; status: string; role: string } | undefined;
        if (!currentUserRow || currentUserRow.status === 'banned') {
          if (callback) callback({ error: 'ACCOUNT_BANNED', message: 'Account is suspended' });
          socket.emit('user:status_changed', { userId: user.id, status: 'banned' });
          socket.disconnect(true);
          return;
        }

        if (currentUserRow.status === 'pending') {
          if (callback) callback({ error: 'ACCOUNT_PENDING_APPROVAL' });
          return;
        }

        if (currentUserRow.role === 'user' && getSettingValue('system_enabled', 'true') === 'false') {
          if (callback) callback({ error: 'SYSTEM_DISABLED', message: 'System is currently disabled for maintenance' });
          socket.emit('system:status_changed', { systemEnabled: false });
          return;
        }

        const rawEmoji = (typeof emoji === 'string' && emoji.trim()) ? emoji.trim() : '👍';
        // Bound emoji input length to prevent payload abuse
        const reactionEmoji = (rawEmoji.length > 0 && rawEmoji.length <= 16) ? rawEmoji : '👍';

        const row = db.prepare('SELECT id, sender_id, recipient_id, reactions FROM messages WHERE id = ?').get(messageId) as {
          id: string;
          sender_id: string;
          recipient_id: string;
          reactions?: string | null;
        } | undefined;

        if (!row) {
          if (callback) callback({ error: 'NOT_FOUND' });
          return;
        }

        if (user.role !== 'admin' && row.sender_id !== user.id && row.recipient_id !== user.id) {
          if (callback) callback({ error: 'FORBIDDEN' });
          return;
        }

        let reactions: Array<{ userId: string; username: string; avatarUrl?: string; emoji: string; createdAt: string }> = [];
        try {
          reactions = row.reactions ? JSON.parse(row.reactions) : [];
        } catch {}

        const liveUser = db.prepare('SELECT username, avatar_url FROM users WHERE id = ?').get(user.id) as {
          username: string;
          avatar_url?: string;
        } | undefined;

        const existingIndex = reactions.findIndex((r) => r.userId === user.id && r.emoji === reactionEmoji);
        if (existingIndex !== -1) {
          reactions.splice(existingIndex, 1);
        } else {
          reactions = reactions.filter((r) => r.userId !== user.id);
          reactions.push({
            userId: user.id,
            username: liveUser?.username || user.username,
            avatarUrl: liveUser?.avatar_url || user.avatarUrl || undefined,
            emoji: reactionEmoji,
            createdAt: new Date().toISOString()
          });
        }

        db.prepare('UPDATE messages SET reactions = ? WHERE id = ?').run(JSON.stringify(reactions), messageId);

        // Notify all sessions of both participants
        io.to(`user:${row.sender_id}`).emit('message:reaction', { messageId, reactions });
        io.to(`user:${row.recipient_id}`).emit('message:reaction', { messageId, reactions });
        io.to('room:admin').emit('message:reaction', { messageId, reactions });

        if (callback) callback({ success: true, reactions });
      } catch (err) {
        console.error('Socket message:react error:', err);
        if (callback) callback({ error: 'INTERNAL_ERROR' });
      }
    });

    // Disconnect handler with accurate socket-set counting
    socket.on('disconnect', () => {
      const userSocketSet = userSockets.get(user.id);
      if (userSocketSet) {
        userSocketSet.delete(socket.id);
        if (userSocketSet.size === 0) {
          userSockets.delete(user.id);
          const offlineTime = new Date().toISOString();
          db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(offlineTime, user.id);

          if (user.role === 'user') {
            io.to('room:admin').emit('user:online_status', { userId: user.id, isOnline: false, lastSeen: offlineTime });
          } else {
            io.emit('admin:online_status', { isOnline: isAnyAdminOnline(), lastSeen: offlineTime });
          }
        }
      }
    });
  });
}
