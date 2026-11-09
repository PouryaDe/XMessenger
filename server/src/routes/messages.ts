import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { db, getSettingValue } from '../database/index.js';
import { authenticate, requireActive, AuthenticatedRequest } from '../middleware/auth.js';
import { encryptMessage, decryptMessage } from '../utils/crypto.js';
import { deleteAttachmentFromMessageText } from '../utils/fileCleaner.js';
import { Server } from 'socket.io';
import { config } from '../config/index.js';
import { dispatchPushForMessage } from '../services/pushService.js';

export function createMessagesRouter(io?: Server) {
  const router = Router();

  // Chat Attachment Storage (Images & Generic Files up to 200MB)
  const chatUploadDir = path.join(config.dataDir, 'uploads', 'chat');
  if (!fs.existsSync(chatUploadDir)) {
    fs.mkdirSync(chatUploadDir, { recursive: true });
  }

  // Security: Strict blacklist of executable and script files
  const FORBIDDEN_FILE_EXTENSIONS = new Set([
    '.php', '.php3', '.php4', '.php5', '.phtml', '.phar',
    '.exe', '.dll', '.com', '.bat', '.cmd', '.vbs', '.vbe',
    '.js', '.jse', '.wsf', '.wsh', '.msc', '.scr',
    '.sh', '.bash', '.csh', '.ksh', '.zsh',
    '.cgi', '.pl', '.py', '.rb',
    '.asp', '.aspx', '.cer', '.asa', '.jsp', '.jspx',
    '.hta', '.jar', '.war', '.ear',
    '.msi', '.msp', '.reg',
    '.ps1', '.psm1', '.psd1',
    '.so', '.dylib'
  ]);

  const chatStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, chatUploadDir);
    },
    filename: (_req, file, cb) => {
      // Strip trailing dots, spaces, or control characters to prevent Windows/NTFS extension bypass
      const cleanOriginal = file.originalname.trim().replace(/[.\s\r\n\t]+$/, '');
      const ext = path.extname(cleanOriginal).toLowerCase().slice(0, 10);
      const isImg = file.mimetype.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
      const prefix = isImg ? 'img' : 'file';
      const safeExt = /^\.[a-z0-9]+$/i.test(ext) ? ext : (isImg ? '.jpg' : '.bin');
      // Full cryptographic UUIDv4 for collision resistance and unguessable URLs
      const uniqueName = `${prefix}-${Date.now()}-${uuidv4()}${safeExt}`;
      cb(null, uniqueName);
    }
  });

  const uploadChatAttachment = multer({
    storage: chatStorage,
    limits: { fileSize: 200 * 1024 * 1024 }, // 200MB max file size
    fileFilter: (_req, file, cb) => {
      // Strip trailing dots and spaces before inspecting extension
      const cleanOriginal = file.originalname.trim().replace(/[.\s\r\n\t]+$/, '');
      const ext = path.extname(cleanOriginal).toLowerCase();
      if (FORBIDDEN_FILE_EXTENSIONS.has(ext)) {
        return cb(new Error('FORBIDDEN_FILE_TYPE'));
      }
      cb(null, true);
    }
  });

  // Require active authentication
  router.use(authenticate, requireActive);

  // 0. Upload Chat Attachment Endpoint (supports both 'file' and 'image' fields up to 200MB)
  router.post('/upload', (req: AuthenticatedRequest, res: any, next: any) => {
    uploadChatAttachment.fields([
      { name: 'file', maxCount: 1 },
      { name: 'image', maxCount: 1 }
    ])(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'FILE_TOO_LARGE', message: 'File size cannot exceed 200MB' });
        }
        if (err.message === 'FORBIDDEN_FILE_TYPE') {
          return res.status(400).json({ error: 'FORBIDDEN_FILE_TYPE', message: 'Executable or script files are not allowed for security reasons' });
        }
        return res.status(400).json({ error: 'UPLOAD_FAILED', message: err.message || 'Upload failed' });
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const uploadedFile = (files?.file && files.file[0]) || (files?.image && files.image[0]) || (req as any).file;

      if (!uploadedFile) {
        return res.status(400).json({ error: 'NO_FILE', message: 'No file uploaded' });
      }

      const ext = path.extname(uploadedFile.originalname).toLowerCase();
      const isImage = uploadedFile.mimetype.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);

      // Sanitize original filename for client display and regex delimiters (| [ ])
      const safeFilename = (path.basename(uploadedFile.originalname || '').replace(/[|\[\]\r\n\t]/g, '_').trim()) || uploadedFile.filename;

      res.status(201).json({
        success: true,
        url: `/uploads/chat/${uploadedFile.filename}`,
        filename: safeFilename,
        storedName: uploadedFile.filename,
        size: uploadedFile.size,
        mimetype: uploadedFile.mimetype,
        isImage
      });
    });
  });

  // 0.1 Safe File Download Route (sets Content-Disposition: attachment)
  router.get('/download/:filename', (req: AuthenticatedRequest, res) => {
    try {
      const rawParam = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
      const safeFilename = path.basename(String(rawParam || ''));
      const filePath = path.join(chatUploadDir, safeFilename);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'FILE_NOT_FOUND', message: 'File not found or expired' });
      }

      // Sanitize requested download name against header injection (CRLF, quotes)
      const originalName = typeof req.query.name === 'string' && req.query.name.trim().length > 0
        ? path.basename(req.query.name.trim()).replace(/[\r\n\t"']/g, '_')
        : safeFilename;

      res.download(filePath, originalName);
    } catch (err: any) {
      console.error('Download error:', err);
      res.status(500).json({ error: 'DOWNLOAD_FAILED', message: 'Failed to download file' });
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
        SELECT id, sender_id, recipient_id, ciphertext, iv, auth_tag, created_at, expires_at, is_read, reply_to_id, reactions
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
        reactions?: string | null;
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
        replyToId: r.reply_to_id || null,
        reactions: r.reactions ? (() => { try { return JSON.parse(r.reactions); } catch { return []; } })() : []
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
        INSERT INTO messages (id, sender_id, recipient_id, ciphertext, iv, auth_tag, created_at, expires_at, is_read, reply_to_id, reactions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '[]')
      `).run(messageId, currentUser.id, recipientId, encrypted.ciphertext, encrypted.iv, encrypted.authTag, createdAt, expiresAt, validReplyToId);

      const messagePayload = {
        id: messageId,
        senderId: currentUser.id,
        recipientId,
        text: text.trim(),
        createdAt,
        expiresAt,
        isRead: false,
        replyToId: validReplyToId,
        reactions: []
      };

      // Emit to sockets (strictly matching server/src/socket/index.ts room logic)
      if (io) {
        if (currentUser.role === 'admin') {
          io.to(`user:${recipientId}`).emit('message:new', messagePayload);
          io.to('room:admin').emit('message:sent', messagePayload);
        } else {
          // Regular user sending to admin: emit once to room:admin (which includes all admin sessions)
          io.to('room:admin').emit('message:new', {
            ...messagePayload,
            senderUsername: currentUser.username
          });
          io.to(`user:${currentUser.id}`).emit('message:sent', messagePayload);
        }
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

      const row = db.prepare('SELECT id, sender_id, recipient_id, ciphertext, iv, auth_tag FROM messages WHERE id = ?').get(id) as {
        id: string;
        sender_id: string;
        recipient_id: string;
        ciphertext?: string;
        iv?: string;
        auth_tag?: string;
      } | undefined;

      if (!row) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Message not found or already deleted' });
      }

      // Only sender, recipient, or admin can delete
      if (currentUser.role !== 'admin' && row.sender_id !== currentUser.id && row.recipient_id !== currentUser.id) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Not authorized to delete this message' });
      }

      // Clean up attachment from server disk if present
      if (row.ciphertext && row.iv && row.auth_tag) {
        try {
          const decrypted = decryptMessage(row.ciphertext, row.iv, row.auth_tag);
          deleteAttachmentFromMessageText(decrypted);
        } catch (_) {}
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

  // 3.5. Toggle Reaction on Message
  router.post('/:id/react', (req: AuthenticatedRequest, res) => {
    try {
      const currentUser = req.user!;
      const { id } = req.params;
      const rawEmoji = typeof req.body.emoji === 'string' ? req.body.emoji.trim() : '👍';
      const emoji = (rawEmoji.length > 0 && rawEmoji.length <= 16) ? rawEmoji : '👍';

      const row = db.prepare('SELECT id, sender_id, recipient_id, reactions FROM messages WHERE id = ?').get(id) as {
        id: string;
        sender_id: string;
        recipient_id: string;
        reactions?: string | null;
      } | undefined;

      if (!row) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Message not found' });
      }

      if (currentUser.role !== 'admin' && row.sender_id !== currentUser.id && row.recipient_id !== currentUser.id) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Not authorized to react to this message' });
      }

      let reactions: Array<{ userId: string; username: string; avatarUrl?: string; emoji: string; createdAt: string }> = [];
      try {
        reactions = row.reactions ? JSON.parse(row.reactions) : [];
      } catch {}

      const liveUser = db.prepare('SELECT username, avatar_url FROM users WHERE id = ?').get(currentUser.id) as {
        username: string;
        avatar_url?: string;
      } | undefined;

      const existingIndex = reactions.findIndex((r) => r.userId === currentUser.id && r.emoji === emoji);
      if (existingIndex !== -1) {
        reactions.splice(existingIndex, 1);
      } else {
        reactions = reactions.filter((r) => r.userId !== currentUser.id);
        reactions.push({
          userId: currentUser.id,
          username: liveUser?.username || currentUser.username,
          avatarUrl: liveUser?.avatar_url || currentUser.avatarUrl || undefined,
          emoji,
          createdAt: new Date().toISOString()
        });
      }

      db.prepare('UPDATE messages SET reactions = ? WHERE id = ?').run(JSON.stringify(reactions), id);

      if (io) {
        io.to(`user:${row.sender_id}`).emit('message:reaction', { messageId: id, reactions });
        io.to(`user:${row.recipient_id}`).emit('message:reaction', { messageId: id, reactions });
        io.to('room:admin').emit('message:reaction', { messageId: id, reactions });
      }

      res.json({ success: true, reactions });
    } catch (err: any) {
      console.error('Error toggling reaction:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to toggle reaction' });
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

      // Clean up attachments from disk before wiping
      const msgRows = db.prepare(`
        SELECT ciphertext, iv, auth_tag FROM messages
        WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
      `).all(currentUser.id, admin.id, admin.id, currentUser.id) as Array<{
        ciphertext: string;
        iv: string;
        auth_tag: string;
      }>;

      for (const m of msgRows) {
        try {
          const decrypted = decryptMessage(m.ciphertext, m.iv, m.auth_tag);
          deleteAttachmentFromMessageText(decrypted);
        } catch (_) {}
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
