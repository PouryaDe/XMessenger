"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMessagesRouter = createMessagesRouter;
const express_1 = require("express");
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const index_js_1 = require("../database/index.js");
const auth_js_1 = require("../middleware/auth.js");
const crypto_js_1 = require("../utils/crypto.js");
const fileCleaner_js_1 = require("../utils/fileCleaner.js");
const index_js_2 = require("../config/index.js");
const pushService_js_1 = require("../services/pushService.js");
function createMessagesRouter(io) {
    const router = (0, express_1.Router)();
    // Chat Attachment Storage (Images & Generic Files up to 200MB)
    const chatUploadDir = path_1.default.join(index_js_2.config.dataDir, 'uploads', 'chat');
    if (!fs_1.default.existsSync(chatUploadDir)) {
        fs_1.default.mkdirSync(chatUploadDir, { recursive: true });
    }
    /**
     * Fixes Multer / Busboy Latin-1 header decoding bug for non-ASCII (Persian, Arabic, UTF-8) filenames.
     */
    function fixMulterFilename(name) {
        if (!name || typeof name !== 'string')
            return '';
        try {
            const fixed = Buffer.from(name, 'latin1').toString('utf8');
            if (!fixed.includes('\uFFFD') && /[\u00C0-\u00FF]/.test(name)) {
                return fixed;
            }
        }
        catch { }
        return name;
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
    const chatStorage = multer_1.default.diskStorage({
        destination: (_req, _file, cb) => {
            cb(null, chatUploadDir);
        },
        filename: (_req, file, cb) => {
            // Strip trailing dots, spaces, or control characters to prevent Windows/NTFS extension bypass
            const cleanOriginal = file.originalname.trim().replace(/[.\s\r\n\t]+$/, '');
            const ext = path_1.default.extname(cleanOriginal).toLowerCase().slice(0, 10);
            const isImg = file.mimetype.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
            const prefix = isImg ? 'img' : 'file';
            const safeExt = /^\.[a-z0-9]+$/i.test(ext) ? ext : (isImg ? '.jpg' : '.bin');
            // Full cryptographic UUIDv4 for collision resistance and unguessable URLs
            const uniqueName = `${prefix}-${Date.now()}-${(0, uuid_1.v4)()}${safeExt}`;
            cb(null, uniqueName);
        }
    });
    const uploadChatAttachment = (0, multer_1.default)({
        storage: chatStorage,
        limits: { fileSize: 200 * 1024 * 1024 }, // 200MB max file size
        fileFilter: (_req, file, cb) => {
            // Strip trailing dots and spaces before inspecting extension
            const cleanOriginal = file.originalname.trim().replace(/[.\s\r\n\t]+$/, '');
            const ext = path_1.default.extname(cleanOriginal).toLowerCase();
            if (FORBIDDEN_FILE_EXTENSIONS.has(ext)) {
                return cb(new Error('FORBIDDEN_FILE_TYPE'));
            }
            cb(null, true);
        }
    });
    // Require active authentication
    router.use(auth_js_1.authenticate, auth_js_1.requireActive);
    // 0. Upload Chat Attachment Endpoint (supports both 'file' and 'image' fields up to 200MB)
    router.post('/upload', (req, res, next) => {
        uploadChatAttachment.fields([
            { name: 'file', maxCount: 1 },
            { name: 'image', maxCount: 1 }
        ])(req, res, (err) => {
            if (err) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ error: 'FILE_TOO_LARGE', message: 'File size cannot exceed 200MB' });
                }
                if (err.message === 'FORBIDDEN_FILE_TYPE') {
                    return res.status(400).json({ error: 'FORBIDDEN_FILE_TYPE', message: 'Executable or script files are not allowed for security reasons' });
                }
                return res.status(400).json({ error: 'UPLOAD_FAILED', message: err.message || 'Upload failed' });
            }
            const files = req.files;
            const uploadedFile = (files?.file && files.file[0]) || (files?.image && files.image[0]) || req.file;
            if (!uploadedFile) {
                return res.status(400).json({ error: 'NO_FILE', message: 'No file uploaded' });
            }
            const ext = path_1.default.extname(uploadedFile.originalname).toLowerCase();
            const isImage = uploadedFile.mimetype.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
            // Fix Multer latin1 encoding bug and sanitize original filename for client display and regex delimiters (| [ ])
            const fixedOriginal = fixMulterFilename(uploadedFile.originalname || '');
            const safeFilename = (path_1.default.basename(fixedOriginal).replace(/[|\[\]\r\n\t]/g, '_').trim()) || uploadedFile.filename;
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
    router.get('/download/:filename', (req, res) => {
        try {
            const rawParam = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
            const safeFilename = path_1.default.basename(String(rawParam || ''));
            const filePath = path_1.default.join(chatUploadDir, safeFilename);
            if (!fs_1.default.existsSync(filePath)) {
                return res.status(404).json({ error: 'FILE_NOT_FOUND', message: 'File not found or expired' });
            }
            // Sanitize requested download name against header injection (CRLF, quotes) and fix any mojibake
            const rawQueryName = typeof req.query.name === 'string' && req.query.name.trim().length > 0
                ? req.query.name.trim()
                : safeFilename;
            const originalName = path_1.default.basename(fixMulterFilename(rawQueryName)).replace(/[\r\n\t"']/g, '_');
            res.download(filePath, originalName);
        }
        catch (err) {
            console.error('Download error:', err);
            res.status(500).json({ error: 'DOWNLOAD_FAILED', message: 'Failed to download file' });
        }
    });
    // 1. Get messages for a conversation
    // If user: gets messages between themselves and Admin
    // If admin: gets messages between Admin and specified :userId in query or param
    router.get('/', (req, res) => {
        try {
            const currentUser = req.user;
            let partnerId;
            if (currentUser.role === 'admin') {
                partnerId = req.query.userId;
                if (!partnerId) {
                    return res.status(400).json({ error: 'MISSING_USER_ID', message: 'Admin must specify target userId' });
                }
            }
            else {
                // Regular user can only talk to Admin
                const admin = index_js_1.db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
                if (!admin) {
                    return res.status(500).json({ error: 'ADMIN_NOT_FOUND', message: 'System administrator not initialized' });
                }
                partnerId = admin.id;
            }
            const now = new Date().toISOString();
            // Fetch non-expired messages in chronological order
            const rows = index_js_1.db.prepare(`
        SELECT id, sender_id, recipient_id, ciphertext, iv, auth_tag, created_at, expires_at, is_read, reply_to_id, reactions
        FROM messages
        WHERE ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))
          AND expires_at > ?
        ORDER BY created_at ASC
      `).all(currentUser.id, partnerId, partnerId, currentUser.id, now);
            // Mark incoming messages as read
            const updated = index_js_1.db.prepare(`
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
                text: (0, crypto_js_1.decryptMessage)(r.ciphertext, r.iv, r.auth_tag),
                createdAt: r.created_at,
                expiresAt: r.expires_at,
                isRead: Boolean(r.is_read),
                isOwn: r.sender_id === currentUser.id,
                replyToId: r.reply_to_id || null,
                reactions: r.reactions ? (() => { try {
                    return JSON.parse(r.reactions);
                }
                catch {
                    return [];
                } })() : []
            }));
            res.json({ messages });
        }
        catch (err) {
            console.error('Error fetching messages:', err);
            res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to retrieve messages' });
        }
    });
    // 2. Send message (REST fallback, socket is primary)
    router.post('/', (req, res) => {
        try {
            const currentUser = req.user;
            const { text, targetUserId, ttlSeconds, replyToId } = req.body;
            if (!text || typeof text !== 'string' || !text.trim()) {
                return res.status(400).json({ error: 'INVALID_TEXT', message: 'Message text cannot be empty' });
            }
            const validReplyToId = (typeof replyToId === 'string' && replyToId.trim().length > 0 && replyToId.length <= 64)
                ? replyToId.trim()
                : null;
            let recipientId;
            if (currentUser.role === 'admin') {
                if (!targetUserId) {
                    return res.status(400).json({ error: 'MISSING_RECIPIENT', message: 'Admin must specify targetUserId' });
                }
                recipientId = targetUserId;
            }
            else {
                // Enforce Hub-and-Spoke rule: regular user can ONLY send to Admin
                const admin = index_js_1.db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
                if (!admin) {
                    return res.status(500).json({ error: 'ADMIN_NOT_FOUND', message: 'Admin not available' });
                }
                recipientId = admin.id;
            }
            // Check recipient exists and not banned
            const recipient = index_js_1.db.prepare('SELECT id, status FROM users WHERE id = ?').get(recipientId);
            if (!recipient || recipient.status === 'banned') {
                return res.status(403).json({ error: 'RECIPIENT_UNAVAILABLE', message: 'Recipient is not reachable' });
            }
            // Determine TTL
            const defaultTtl = parseInt((0, index_js_1.getSettingValue)('default_ttl_seconds', '86400'), 10);
            const activeTtl = (typeof ttlSeconds === 'number' && ttlSeconds > 0) ? ttlSeconds : defaultTtl;
            const messageId = (0, uuid_1.v4)();
            const now = new Date();
            const expiresAt = new Date(now.getTime() + activeTtl * 1000).toISOString();
            const createdAt = now.toISOString();
            // Encrypt message at rest
            const encrypted = (0, crypto_js_1.encryptMessage)(text.trim());
            index_js_1.db.prepare(`
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
                }
                else {
                    // Regular user sending to admin: emit once to room:admin (which includes all admin sessions)
                    io.to('room:admin').emit('message:new', {
                        ...messagePayload,
                        senderUsername: currentUser.username
                    });
                    io.to(`user:${currentUser.id}`).emit('message:sent', messagePayload);
                }
            }
            // Dispatch Web Push notification for background/PWA users
            (0, pushService_js_1.dispatchPushForMessage)(currentUser, recipientId, text.trim()).catch(() => { });
            res.status(201).json({ message: { ...messagePayload, isOwn: true } });
        }
        catch (err) {
            console.error('Error sending message:', err);
            res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to send message' });
        }
    });
    // 3. Two-way instant deletion (Delete for everyone)
    router.delete('/:id', (req, res) => {
        try {
            const currentUser = req.user;
            const { id } = req.params;
            const row = index_js_1.db.prepare('SELECT id, sender_id, recipient_id, ciphertext, iv, auth_tag FROM messages WHERE id = ?').get(id);
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
                    const decrypted = (0, crypto_js_1.decryptMessage)(row.ciphertext, row.iv, row.auth_tag);
                    (0, fileCleaner_js_1.deleteAttachmentFromMessageText)(decrypted);
                }
                catch (_) { }
            }
            // Hard delete from database
            index_js_1.db.prepare('DELETE FROM messages WHERE id = ?').run(id);
            // Notify both parties instantly via socket
            if (io) {
                io.to(`user:${row.sender_id}`).emit('message:deleted', { messageId: id, deletedBy: currentUser.id });
                io.to(`user:${row.recipient_id}`).emit('message:deleted', { messageId: id, deletedBy: currentUser.id });
            }
            res.json({ success: true, message: 'Message deleted for everyone' });
        }
        catch (err) {
            console.error('Error deleting message:', err);
            res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to delete message' });
        }
    });
    // 3.5. Toggle Reaction on Message
    router.post('/:id/react', (req, res) => {
        try {
            const currentUser = req.user;
            const { id } = req.params;
            const rawEmoji = typeof req.body.emoji === 'string' ? req.body.emoji.trim() : '👍';
            const emoji = (rawEmoji.length > 0 && rawEmoji.length <= 16) ? rawEmoji : '👍';
            const row = index_js_1.db.prepare('SELECT id, sender_id, recipient_id, reactions FROM messages WHERE id = ?').get(id);
            if (!row) {
                return res.status(404).json({ error: 'NOT_FOUND', message: 'Message not found' });
            }
            if (currentUser.role !== 'admin' && row.sender_id !== currentUser.id && row.recipient_id !== currentUser.id) {
                return res.status(403).json({ error: 'FORBIDDEN', message: 'Not authorized to react to this message' });
            }
            let reactions = [];
            try {
                reactions = row.reactions ? JSON.parse(row.reactions) : [];
            }
            catch { }
            const liveUser = index_js_1.db.prepare('SELECT username, avatar_url FROM users WHERE id = ?').get(currentUser.id);
            const existingIndex = reactions.findIndex((r) => r.userId === currentUser.id && r.emoji === emoji);
            if (existingIndex !== -1) {
                reactions.splice(existingIndex, 1);
            }
            else {
                reactions = reactions.filter((r) => r.userId !== currentUser.id);
                reactions.push({
                    userId: currentUser.id,
                    username: liveUser?.username || currentUser.username,
                    avatarUrl: liveUser?.avatar_url || currentUser.avatarUrl || undefined,
                    emoji,
                    createdAt: new Date().toISOString()
                });
            }
            index_js_1.db.prepare('UPDATE messages SET reactions = ? WHERE id = ?').run(JSON.stringify(reactions), id);
            if (io) {
                io.to(`user:${row.sender_id}`).emit('message:reaction', { messageId: id, reactions });
                io.to(`user:${row.recipient_id}`).emit('message:reaction', { messageId: id, reactions });
                io.to('room:admin').emit('message:reaction', { messageId: id, reactions });
            }
            res.json({ success: true, reactions });
        }
        catch (err) {
            console.error('Error toggling reaction:', err);
            res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to toggle reaction' });
        }
    });
    // 4. User clears entire conversation with Admin
    router.delete('/clear-all/my-chat', (req, res) => {
        try {
            const currentUser = req.user;
            if (currentUser.role === 'admin') {
                return res.status(400).json({ error: 'ADMIN_USE_TARGET', message: 'Admin should clear specific user conversation' });
            }
            const admin = index_js_1.db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
            if (!admin) {
                return res.status(500).json({ error: 'ADMIN_NOT_FOUND', message: 'Admin not found' });
            }
            // Clean up attachments from disk before wiping
            const msgRows = index_js_1.db.prepare(`
        SELECT ciphertext, iv, auth_tag FROM messages
        WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
      `).all(currentUser.id, admin.id, admin.id, currentUser.id);
            for (const m of msgRows) {
                try {
                    const decrypted = (0, crypto_js_1.decryptMessage)(m.ciphertext, m.iv, m.auth_tag);
                    (0, fileCleaner_js_1.deleteAttachmentFromMessageText)(decrypted);
                }
                catch (_) { }
            }
            index_js_1.db.prepare(`
        DELETE FROM messages
        WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
      `).run(currentUser.id, admin.id, admin.id, currentUser.id);
            if (io) {
                io.to(`user:${currentUser.id}`).emit('conversation:cleared', { clearedBy: currentUser.id });
                io.to(`user:${admin.id}`).emit('conversation:cleared', { userId: currentUser.id, clearedBy: currentUser.id });
            }
            res.json({ success: true, message: 'Conversation wiped' });
        }
        catch (err) {
            res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to wipe conversation' });
        }
    });
    // 5. Explicit Mark Conversation Messages as Read
    router.post('/:partnerId/read', (req, res) => {
        try {
            const currentUser = req.user;
            const { partnerId } = req.params;
            const updated = index_js_1.db.prepare(`
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
        }
        catch (err) {
            console.error('Error marking messages as read:', err);
            res.status(500).json({ error: 'INTERNAL_ERROR' });
        }
    });
    return router;
}
