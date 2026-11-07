import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import { db, getSettingValue } from '../database/index.js';
import { AuthUser } from '../middleware/auth.js';
import { encryptMessage, decryptMessage } from '../utils/crypto.js';

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
      const user = db.prepare('SELECT id, username, role, status FROM users WHERE id = ?').get(decoded.id) as AuthUser | undefined;

      if (!user) {
        return next(new Error('USER_NOT_FOUND'));
      }

      if (user.status === 'banned') {
        return next(new Error('ACCOUNT_BANNED'));
      }

      socket.user = user;
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
    socket.on('message:send', ({ text, targetUserId, ttlSeconds }: { text: string; targetUserId?: string; ttlSeconds?: number }, callback) => {
      try {
        if (user.status === 'pending') {
          if (callback) callback({ error: 'ACCOUNT_PENDING_APPROVAL' });
          return;
        }

        if (!text || !text.trim()) {
          if (callback) callback({ error: 'EMPTY_TEXT' });
          return;
        }

        let recipientId: string;
        if (user.role === 'admin') {
          if (!targetUserId) {
            if (callback) callback({ error: 'MISSING_RECIPIENT' });
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
          INSERT INTO messages (id, sender_id, recipient_id, ciphertext, iv, auth_tag, created_at, expires_at, is_read)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run(messageId, user.id, recipientId, encrypted.ciphertext, encrypted.iv, encrypted.authTag, createdAt, expiresAt);

        const messagePayload = {
          id: messageId,
          senderId: user.id,
          recipientId,
          text: text.trim(),
          createdAt,
          expiresAt,
          isRead: false
        };

        // Emit to recipient and sender with exact message types
        if (user.role === 'admin') {
          // Send to regular user
          io.to(`user:${recipientId}`).emit('message:new', messagePayload);
          // Broadcast to admin's active sockets
          io.to('room:admin').emit('message:sent', messagePayload);
        } else {
          // Regular user sending to admin
          io.to(`user:${recipientId}`).emit('message:new', messagePayload);
          io.to('room:admin').emit('message:new', messagePayload);
          // Broadcast to user's active sockets
          io.to(userRoom).emit('message:sent', messagePayload);
        }

        if (callback) callback({ success: true, message: { ...messagePayload, isOwn: true } });
      } catch (err) {
        console.error('Socket message error:', err);
        if (callback) callback({ error: 'INTERNAL_ERROR' });
      }
    });

    // Delete message for everyone via Socket
    socket.on('message:delete', ({ messageId }: { messageId: string }, callback) => {
      try {
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
