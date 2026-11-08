import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { db, getSettingValue } from '../database/index.js';
import { authenticate, requireActive, AuthenticatedRequest } from '../middleware/auth.js';
import { encryptMessage, decryptMessage } from '../utils/crypto.js';
import { Server } from 'socket.io';
import { config } from '../config/index.js';
import { dispatchPushForMessage } from '../services/pushService.js';

export function createMessagesRouter(io?: Server) {
  const router = Router();

  // Chat Image Upload Storage
  const chatUploadDir = path.join(config.dataDir, 'uploads', 'chat');
  if (!fs.existsSync(chatUploadDir)) {
    fs.mkdirSync(chatUploadDir, { recursive: true });
  }

  const chatStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, chatUploadDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const cleanExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
      const uniqueName = `img-${Date.now()}-${uuidv4().substring(0, 8)}${cleanExt}`;
      cb(null, uniqueName);
    }
  });

  const uploadChatImage = multer({
    storage: chatStorage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('ONLY_IMAGES_ALLOWED'));
      }
    }
  });

  // Require active authentication
  router.use(authenticate, requireActive);

  // 0. Upload Chat Image Endpoint
  router.post('/upload', uploadChatImage.single('image'), (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'NO_FILE', message: 'No image file uploaded' });
      }

      const imageUrl = `/uploads/chat/${req.file.filename}`;
      res.status(201).json({
        success: true,
        url: imageUrl,
        filename: req.file.filename,
        size: req.file.size
      });
    } catch (err: any) {
      console.error('Error uploading chat image:', err);
      res.status(500).json({ error: 'UPLOAD_FAILED', message: err.message || 'Image upload failed' });
    }
  });

  // 1. Get messages for a conversation
  // If user: gets messages between themselves and Admin
  // If admin: gets messages between Admin and specified :userId in query or param
  router.get('/', (req: AuthenticatedRequest, res) => {
    try {
      const currentUser = req.user!;
      let partnerId: string;

      if (currentUser.role === 'admin') {
        partnerId = req.query.userId as string;
        if (!partnerId) {
          return res.status(400).json({ error: 'MISSING_USER_ID', message: 'Admin must specify target userId' });
        }
      } else {
        // Regular user can only talk to Admin
        const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get() as { id: string } | undefined;
        if (!admin) {
          return res.status(500).json({ error: 'ADMIN_NOT_FOUND', message: 'System administrator not initialized' });
        }
        partnerId = admin.id;
      }

      const now = new Date().toISOString();

      // Fetch non-expired messages in chronological order
      const rows = db.prepare(`
        SELECT id, sender_id, recipient_id, ciphertext, iv, auth_tag, created_at, expires_at, is_read, reply_to_id
        FROM messages
        WHERE ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))
          AND expires_at > ?
        ORDER BY created_at ASC
      `).all(currentUser.id, partnerId, partnerId, currentUser.id, now) as Array<{
        id: string;
        sender_id: string;
        recipient_id: string;
        ciphertext: string;
        iv: string;
        auth_tag: string;
        created_at: string;
        expires_at: string;
        is_read: number;
        reply_to_id?: string | null;
      }>;

      // Mark incoming messages as read
      const updated = db.prepare(`
        UPDATE messages
        SET is_read = 1
        WHERE recipient_id = ? AND sender_id = ? AND is_read = 0
      `).run(currentUser.id, partnerId);

      if (updated.changes > 0 && io) {
        // Real-time: Notify the sender that their messages were seen (double checkmark)
        io.to(`user:${partnerId}`).emit('messages:read', {
          readerId: currentUser.id,
          readAt: new Date().toISOString()
        });

        // Real-time: Sync unread count removal across all admin sessions
        if (currentUser.role === 'admin') {
          io.to('room:admin').emit('conversation:read_sync', {
            userId: partnerId,
            readerId: currentUser.id
          });
        }
      }

      // Decrypt messages for the authorized party
      const messages = rows.map(r => ({
        id: r.id,
        senderId: r.sender_id,
        recipientId: r.recipient_id,
        text: decryptMessage(r.ciphertext, r.iv, r.auth_tag),
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        isRead: Boolean(r.is_read),
        isOwn: r.sender_id === currentUser.id,
        replyToId: r.reply_to_id || null
      }));

      res.json({ messages });
    } catch (err) {
      console.error('Error fetching messages:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to retrieve messages' });
    }
  });

  // 2. Send message (REST fallback, socket is primary)
  router.post('/', (req: AuthenticatedRequest, res) => {
    try {
      const currentUser = req.user!;
      const { text, targetUserId, ttlSeconds, replyToId } = req.body;

      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'INVALID_TEXT', message: 'Message text cannot be empty' });
      }

      const validReplyToId = (typeof replyToId === 'string' && replyToId.trim().length > 0 && replyToId.length <= 64)
        ? replyToId.trim()
        : null;

      let recipientId: string;
      if (currentUser.role === 'admin') {
        if (!targetUserId) {
          return res.status(400).json({ error: 'MISSING_RECIPIENT', message: 'Admin must specify targetUserId' });
        }
        recipientId = targetUserId;
      } else {
        // Enforce Hub-and-Spoke rule: regular user can ONLY send to Admin
        const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get() as { id: string } | undefined;
        if (!admin) {
          return res.status(500).json({ error: 'ADMIN_NOT_FOUND', message: 'Admin not available' });
        }
        recipientId = admin.id;
      }

      // Check recipient exists and not banned
      const recipient = db.prepare('SELECT id, status FROM users WHERE id = ?').get(recipientId) as { id: string; status: string } | undefined;
      if (!recipient || recipient.status === 'banned') {
        return res.status(403).json({ error: 'RECIPIENT_UNAVAILABLE', message: 'Recipient is not reachable' });
      }

      // Determine TTL
      const defaultTtl = parseInt(getSettingValue('default_ttl_seconds', '86400'), 10);
      const activeTtl = (typeof ttlSeconds === 'number' && ttlSeconds > 0) ? ttlSeconds : defaultTtl;

      const messageId = uuidv4();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + activeTtl * 1000).toISOString();
      const createdAt = now.toISOString();

      // Encrypt message at rest
      const encrypted = encryptMessage(text.trim());

      db.prepare(`
        INSERT INTO messages (id, sender_id, recipient_id, ciphertext, iv, auth_tag, created_at, expires_at, is_read, reply_to_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).run(messageId, currentUser.id, recipientId, encrypted.ciphertext, encrypted.iv, encrypted.authTag, createdAt, expiresAt, validReplyToId);

      const messagePayload = {
        id: messageId,
        senderId: currentUser.id,
        recipientId,
        text: text.trim(),
        createdAt,
        expiresAt,
        isRead: false,
        replyToId: validReplyToId
      };

      // Emit to sockets
      if (io) {
        io.to(`user:${recipientId}`).emit('message:new', messagePayload);
        io.to('room:admin').emit('message:new', messagePayload);
        io.to(`user:${currentUser.id}`).emit('message:sent', messagePayload);
      }

      // Dispatch Web Push notification for background/PWA users
      dispatchPushForMessage(currentUser, recipientId, text.trim()).catch(() => {});

      res.status(201).json({ message: { ...messagePayload, isOwn: true } });
    } catch (err) {
      console.error('Error sending message:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to send message' });
    }
  });

  // 3. Two-way instant deletion (Delete for everyone)
  router.delete('/:id', (req: AuthenticatedRequest, res) => {
    try {
      const currentUser = req.user!;
      const { id } = req.params;

      const row = db.prepare('SELECT id, sender_id, recipient_id FROM messages WHERE id = ?').get(id) as {
        id: string;
        sender_id: string;
        recipient_id: string;
      } | undefined;

      if (!row) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Message not found or already deleted' });
      }

      // Only sender, recipient, or admin can delete
      if (currentUser.role !== 'admin' && row.sender_id !== currentUser.id && row.recipient_id !== currentUser.id) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Not authorized to delete this message' });
      }

      // Hard delete from database
      db.prepare('DELETE FROM messages WHERE id = ?').run(id);

      // Notify both parties instantly via socket
      if (io) {
        io.to(`user:${row.sender_id}`).emit('message:deleted', { messageId: id, deletedBy: currentUser.id });
        io.to(`user:${row.recipient_id}`).emit('message:deleted', { messageId: id, deletedBy: currentUser.id });
      }

      res.json({ success: true, message: 'Message deleted for everyone' });
    } catch (err) {
      console.error('Error deleting message:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to delete message' });
    }
  });

  // 4. User clears entire conversation with Admin
  router.delete('/clear-all/my-chat', (req: AuthenticatedRequest, res) => {
    try {
      const currentUser = req.user!;
      if (currentUser.role === 'admin') {
        return res.status(400).json({ error: 'ADMIN_USE_TARGET', message: 'Admin should clear specific user conversation' });
      }

      const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get() as { id: string } | undefined;
      if (!admin) {
        return res.status(500).json({ error: 'ADMIN_NOT_FOUND', message: 'Admin not found' });
      }

      db.prepare(`
        DELETE FROM messages
        WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
      `).run(currentUser.id, admin.id, admin.id, currentUser.id);

      if (io) {
        io.to(`user:${currentUser.id}`).emit('conversation:cleared', { clearedBy: currentUser.id });
        io.to(`user:${admin.id}`).emit('conversation:cleared', { userId: currentUser.id, clearedBy: currentUser.id });
      }

      res.json({ success: true, message: 'Conversation wiped' });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to wipe conversation' });
    }
  });

  // 5. Explicit Mark Conversation Messages as Read
  router.post('/:partnerId/read', (req: AuthenticatedRequest, res) => {
    try {
      const currentUser = req.user!;
      const { partnerId } = req.params;

      const updated = db.prepare(`
        UPDATE messages
        SET is_read = 1
        WHERE recipient_id = ? AND sender_id = ? AND is_read = 0
      `).run(currentUser.id, partnerId);

      if (updated.changes > 0 && io) {
        io.to(`user:${partnerId}`).emit('messages:read', {
          readerId: currentUser.id,
          readAt: new Date().toISOString()
        });

        if (currentUser.role === 'admin') {
          io.to('room:admin').emit('conversation:read_sync', {
            userId: partnerId,
            readerId: currentUser.id
          });
        }
      }

      res.json({ success: true, count: updated.changes });
    } catch (err) {
      console.error('Error marking messages as read:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
