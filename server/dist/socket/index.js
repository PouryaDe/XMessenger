"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUserOnline = isUserOnline;
exports.isAnyAdminOnline = isAnyAdminOnline;
exports.getOnlineUserIds = getOnlineUserIds;
exports.setupSocketServer = setupSocketServer;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const uuid_1 = require("uuid");
const index_js_1 = require("../config/index.js");
const index_js_2 = require("../database/index.js");
const crypto_js_1 = require("../utils/crypto.js");
// Track connected sockets per user for 100% accurate online presence
const userSockets = new Map();
function isUserOnline(userId) {
    const sockets = userSockets.get(userId);
    return Boolean(sockets && sockets.size > 0);
}
function isAnyAdminOnline() {
    for (const [userId, sockets] of userSockets.entries()) {
        if (sockets.size > 0) {
            const u = index_js_2.db.prepare("SELECT role FROM users WHERE id = ?").get(userId);
            if (u?.role === 'admin')
                return true;
        }
    }
    return false;
}
function getOnlineUserIds() {
    const ids = [];
    for (const [userId, sockets] of userSockets.entries()) {
        if (sockets.size > 0)
            ids.push(userId);
    }
    return ids;
}
function setupSocketServer(io) {
    // Authentication middleware for Socket.io
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
        if (!token) {
            return next(new Error('AUTHENTICATION_ERROR: Token required'));
        }
        try {
            const decoded = jsonwebtoken_1.default.verify(token, index_js_1.config.jwtSecret);
            const user = index_js_2.db.prepare('SELECT id, username, role, status FROM users WHERE id = ?').get(decoded.id);
            if (!user) {
                return next(new Error('USER_NOT_FOUND'));
            }
            if (user.status === 'banned') {
                return next(new Error('ACCOUNT_BANNED'));
            }
            socket.user = user;
            next();
        }
        catch (err) {
            next(new Error('INVALID_TOKEN'));
        }
    });
    io.on('connection', (socket) => {
        const user = socket.user;
        const userRoom = `user:${user.id}`;
        socket.join(userRoom);
        if (user.role === 'admin') {
            socket.join('room:admin');
        }
        // Add to active sockets registry
        if (!userSockets.has(user.id)) {
            userSockets.set(user.id, new Set());
        }
        const sockets = userSockets.get(user.id);
        const wasOffline = sockets.size === 0;
        sockets.add(socket.id);
        // Update last seen
        const now = new Date().toISOString();
        index_js_2.db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(now, user.id);
        // Broadcast online status to the counterpart only if state transitioned from offline to online
        if (wasOffline) {
            if (user.role === 'user') {
                io.to('room:admin').emit('user:online_status', { userId: user.id, isOnline: true });
            }
            else {
                io.emit('admin:online_status', { isOnline: true });
            }
        }
        // Immediately inform this newly connected client about counterpart presence state
        if (user.role === 'admin') {
            socket.emit('presence:init', { onlineUserIds: getOnlineUserIds() });
        }
        else {
            const adminUser = index_js_2.db.prepare("SELECT last_seen FROM users WHERE role = 'admin'").get();
            socket.emit('admin:online_status', { isOnline: isAnyAdminOnline(), lastSeen: adminUser?.last_seen });
        }
        // Typing indicators
        socket.on('typing', ({ isTyping, targetUserId }) => {
            if (user.role === 'user') {
                io.to('room:admin').emit('typing', {
                    userId: user.id,
                    username: user.username,
                    isTyping
                });
            }
            else if (user.role === 'admin' && targetUserId) {
                io.to(`user:${targetUserId}`).emit('typing', {
                    userId: user.id,
                    username: user.username,
                    isTyping
                });
            }
        });
        // Send Message via Socket
        socket.on('message:send', ({ text, targetUserId, ttlSeconds }, callback) => {
            try {
                if (user.status === 'pending') {
                    if (callback)
                        callback({ error: 'ACCOUNT_PENDING_APPROVAL' });
                    return;
                }
                if (!text || !text.trim()) {
                    if (callback)
                        callback({ error: 'EMPTY_TEXT' });
                    return;
                }
                let recipientId;
                if (user.role === 'admin') {
                    if (!targetUserId) {
                        if (callback)
                            callback({ error: 'MISSING_RECIPIENT' });
                        return;
                    }
                    recipientId = targetUserId;
                }
                else {
                    // Regular user can ONLY talk to admin
                    const admin = index_js_2.db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
                    if (!admin) {
                        if (callback)
                            callback({ error: 'ADMIN_NOT_FOUND' });
                        return;
                    }
                    recipientId = admin.id;
                }
                const defaultTtl = parseInt((0, index_js_2.getSettingValue)('default_ttl_seconds', '86400'), 10);
                const activeTtl = (typeof ttlSeconds === 'number' && ttlSeconds > 0) ? ttlSeconds : defaultTtl;
                const messageId = (0, uuid_1.v4)();
                const nowTime = new Date();
                const expiresAt = new Date(nowTime.getTime() + activeTtl * 1000).toISOString();
                const createdAt = nowTime.toISOString();
                // Encrypt at rest
                const encrypted = (0, crypto_js_1.encryptMessage)(text.trim());
                index_js_2.db.prepare(`
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
                }
                else {
                    // Regular user sending to admin
                    io.to(`user:${recipientId}`).emit('message:new', messagePayload);
                    io.to('room:admin').emit('message:new', messagePayload);
                    // Broadcast to user's active sockets
                    io.to(userRoom).emit('message:sent', messagePayload);
                }
                if (callback)
                    callback({ success: true, message: { ...messagePayload, isOwn: true } });
            }
            catch (err) {
                console.error('Socket message error:', err);
                if (callback)
                    callback({ error: 'INTERNAL_ERROR' });
            }
        });
        // Mark conversation messages as read (Instant 0ms Sync)
        socket.on('conversation:read', ({ partnerId }, callback) => {
            try {
                if (!partnerId)
                    return;
                const updated = index_js_2.db.prepare(`
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
                if (callback)
                    callback({ success: true, count: updated.changes });
            }
            catch (err) {
                console.error('Socket conversation:read error:', err);
                if (callback)
                    callback({ error: 'INTERNAL_ERROR' });
            }
        });
        // Delete message for everyone via Socket
        socket.on('message:delete', ({ messageId }, callback) => {
            try {
                const row = index_js_2.db.prepare('SELECT id, sender_id, recipient_id FROM messages WHERE id = ?').get(messageId);
                if (!row) {
                    if (callback)
                        callback({ error: 'NOT_FOUND' });
                    return;
                }
                if (user.role !== 'admin' && row.sender_id !== user.id && row.recipient_id !== user.id) {
                    if (callback)
                        callback({ error: 'FORBIDDEN' });
                    return;
                }
                // Hard delete
                index_js_2.db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
                // Notify both sides instantly
                io.to(`user:${row.sender_id}`).emit('message:deleted', { messageId, deletedBy: user.id });
                io.to(`user:${row.recipient_id}`).emit('message:deleted', { messageId, deletedBy: user.id });
                if (callback)
                    callback({ success: true });
            }
            catch (err) {
                console.error('Socket message delete error:', err);
                if (callback)
                    callback({ error: 'INTERNAL_ERROR' });
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
                    index_js_2.db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(offlineTime, user.id);
                    if (user.role === 'user') {
                        io.to('room:admin').emit('user:online_status', { userId: user.id, isOnline: false, lastSeen: offlineTime });
                    }
                    else {
                        io.emit('admin:online_status', { isOnline: isAnyAdminOnline(), lastSeen: offlineTime });
                    }
                }
            }
        });
    });
}
