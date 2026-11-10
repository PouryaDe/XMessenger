"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChannelRouter = createChannelRouter;
const express_1 = __importDefault(require("express"));
const uuid_1 = require("uuid");
const index_js_1 = require("../database/index.js");
const auth_js_1 = require("../middleware/auth.js");
const crypto_js_1 = require("../utils/crypto.js");
const fileCleaner_js_1 = require("../utils/fileCleaner.js");
const pushService_js_1 = require("../services/pushService.js");
function createChannelRouter(io) {
    const router = express_1.default.Router();
    // All channel endpoints require authentication and active account status
    router.use(auth_js_1.authenticate, auth_js_1.requireActive);
    // 1. Get Channel Metadata (Title, Description, Subscribers Count)
    router.get('/meta', (req, res) => {
        try {
            const channelTitle = (0, index_js_1.getSettingValue)('channel_title', 'کانال اطلاع‌رسانی');
            const channelDescription = (0, index_js_1.getSettingValue)('channel_description', 'کانال رسمی اطلاع‌رسانی و اخبار سامانه');
            const subscribersRow = index_js_1.db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'active'").get();
            return res.json({
                title: channelTitle,
                description: channelDescription,
                subscribersCount: subscribersRow.count || 1
            });
        }
        catch (err) {
            console.error('[Channel] Error fetching metadata:', err);
            return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
        }
    });
    // 2. Get All Channel Posts (sorted by createdAt ASC for stream rendering)
    router.get('/posts', (req, res) => {
        try {
            const userId = req.user.id;
            const rows = index_js_1.db.prepare(`
        SELECT
          id,
          admin_id,
          ciphertext,
          iv,
          auth_tag,
          created_at,
          views_count,
          reactions
        FROM channel_posts
        ORDER BY created_at ASC
      `).all();
            // Fetch user's viewed post IDs to mark hasViewed accurately
            const userViews = new Set();
            const viewRows = index_js_1.db.prepare('SELECT post_id FROM channel_post_views WHERE user_id = ?').all(userId);
            viewRows.forEach((v) => userViews.add(v.post_id));
            const posts = rows.map((r) => {
                let text = '';
                try {
                    text = (0, crypto_js_1.decryptMessage)(r.ciphertext, r.iv, r.auth_tag);
                }
                catch (_) {
                    text = '[Encrypted message]';
                }
                let reactions = [];
                try {
                    reactions = r.reactions ? JSON.parse(r.reactions) : [];
                }
                catch {
                    reactions = [];
                }
                return {
                    id: r.id,
                    adminId: r.admin_id,
                    text,
                    createdAt: r.created_at,
                    viewsCount: r.views_count,
                    reactions,
                    hasViewed: userViews.has(r.id)
                };
            });
            return res.json({ posts });
        }
        catch (err) {
            console.error('[Channel] Error fetching posts:', err);
            return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
        }
    });
    // 3. Create a New Channel Post (Admin Only)
    router.post('/posts', auth_js_1.requireAdmin, async (req, res) => {
        try {
            const { text } = req.body;
            if (!text || typeof text !== 'string' || !text.trim()) {
                return res.status(400).json({ error: 'EMPTY_TEXT', message: 'Post content cannot be empty' });
            }
            if (text.length > 50000) {
                return res.status(400).json({ error: 'TEXT_TOO_LONG', message: 'Post exceeds maximum allowed length of 50,000 characters' });
            }
            const postId = (0, uuid_1.v4)();
            const adminId = req.user.id;
            const createdAt = new Date().toISOString();
            const trimmedText = text.trim();
            // Encrypt at rest with AES-256-GCM
            const encrypted = (0, crypto_js_1.encryptMessage)(trimmedText);
            index_js_1.db.prepare(`
        INSERT INTO channel_posts (id, admin_id, ciphertext, iv, auth_tag, created_at, views_count, reactions)
        VALUES (?, ?, ?, ?, ?, ?, 1, '[]')
      `).run(postId, adminId, encrypted.ciphertext, encrypted.iv, encrypted.authTag, createdAt);
            // Record admin's own view immediately
            index_js_1.db.prepare(`
        INSERT OR IGNORE INTO channel_post_views (post_id, user_id, viewed_at)
        VALUES (?, ?, ?)
      `).run(postId, adminId, createdAt);
            const postPayload = {
                id: postId,
                adminId,
                text: trimmedText,
                createdAt,
                viewsCount: 1,
                reactions: [],
                hasViewed: true
            };
            // Broadcast to all connected clients via Socket.IO
            io.emit('channel:post_new', postPayload);
            // Dispatch Web Push notification to all active subscribers asynchronously
            (0, pushService_js_1.dispatchPushForChannelPost)(postId).catch(() => { });
            return res.status(201).json({ success: true, post: postPayload });
        }
        catch (err) {
            console.error('[Channel] Error creating post:', err);
            return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
        }
    });
    // 4. Delete a Channel Post (Admin Only)
    router.delete('/posts/:id', auth_js_1.requireAdmin, (req, res) => {
        try {
            const { id } = req.params;
            const row = index_js_1.db.prepare('SELECT id, ciphertext, iv, auth_tag FROM channel_posts WHERE id = ?').get(id);
            if (!row) {
                return res.status(404).json({ error: 'POST_NOT_FOUND', message: 'Post not found' });
            }
            // Clean up any uploaded file or image attachment from disk
            if (row.ciphertext && row.iv && row.auth_tag) {
                try {
                    const decrypted = (0, crypto_js_1.decryptMessage)(row.ciphertext, row.iv, row.auth_tag);
                    (0, fileCleaner_js_1.deleteAttachmentFromMessageText)(decrypted);
                }
                catch (_) { }
            }
            // Defensive hard delete from database (views + post)
            index_js_1.db.prepare('DELETE FROM channel_post_views WHERE post_id = ?').run(id);
            index_js_1.db.prepare('DELETE FROM channel_posts WHERE id = ?').run(id);
            // Broadcast real-time deletion
            io.emit('channel:post_deleted', { postId: id });
            return res.json({ success: true });
        }
        catch (err) {
            console.error('[Channel] Error deleting post:', err);
            return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
        }
    });
    // 5. Record Post View (Increments view count and stores user view timestamp)
    router.post('/posts/:id/view', (req, res) => {
        try {
            const { id } = req.params;
            const userId = req.user.id;
            const now = new Date().toISOString();
            const post = index_js_1.db.prepare('SELECT id, views_count FROM channel_posts WHERE id = ?').get(id);
            if (!post) {
                return res.status(404).json({ error: 'POST_NOT_FOUND', message: 'Post not found' });
            }
            // Insert view record (unique per user per post)
            const insertResult = index_js_1.db.prepare(`
        INSERT OR IGNORE INTO channel_post_views (post_id, user_id, viewed_at)
        VALUES (?, ?, ?)
      `).run(id, userId, now);
            let currentViews = post.views_count;
            if (insertResult.changes > 0) {
                // Compute accurate total views directly from channel_post_views to prevent drift
                const countRow = index_js_1.db.prepare('SELECT COUNT(*) as count FROM channel_post_views WHERE post_id = ?').get(id);
                currentViews = countRow.count || 1;
                index_js_1.db.prepare('UPDATE channel_posts SET views_count = ? WHERE id = ?').run(currentViews, id);
                // Emit updated view count to all clients
                io.emit('channel:post_viewed', { postId: id, viewsCount: currentViews, userId });
            }
            return res.json({ success: true, viewsCount: currentViews });
        }
        catch (err) {
            console.error('[Channel] Error recording view:', err);
            return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
        }
    });
    // 6. Get Granular Post Viewers List (Admin Only)
    router.get('/posts/:id/viewers', auth_js_1.requireAdmin, (req, res) => {
        try {
            const { id } = req.params;
            const post = index_js_1.db.prepare('SELECT id FROM channel_posts WHERE id = ?').get(id);
            if (!post) {
                return res.status(404).json({ error: 'POST_NOT_FOUND', message: 'Post not found' });
            }
            const viewers = index_js_1.db.prepare(`
        SELECT
          u.id as userId,
          u.username,
          u.avatar_url as avatarUrl,
          u.category,
          cpv.viewed_at as viewedAt
        FROM channel_post_views cpv
        JOIN users u ON u.id = cpv.user_id
        WHERE cpv.post_id = ?
        ORDER BY cpv.viewed_at DESC
      `).all(id);
            return res.json({ viewers });
        }
        catch (err) {
            console.error('[Channel] Error fetching viewers:', err);
            return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
        }
    });
    // 7. Toggle Reaction on Channel Post
    router.post('/posts/:id/react', (req, res) => {
        try {
            const { id } = req.params;
            const user = req.user;
            const rawEmoji = (typeof req.body?.emoji === 'string' && req.body.emoji.trim()) ? req.body.emoji.trim() : '👍';
            const reactionEmoji = ['👍', '❤️'].includes(rawEmoji) ? rawEmoji : '👍';
            const post = index_js_1.db.prepare('SELECT id, reactions FROM channel_posts WHERE id = ?').get(id);
            if (!post) {
                return res.status(404).json({ error: 'POST_NOT_FOUND', message: 'Post not found' });
            }
            let reactions = [];
            try {
                reactions = post.reactions ? JSON.parse(post.reactions) : [];
            }
            catch { }
            const liveUser = index_js_1.db.prepare('SELECT username, avatar_url FROM users WHERE id = ?').get(user.id);
            const existingIndex = reactions.findIndex((r) => r.userId === user.id && r.emoji === reactionEmoji);
            if (existingIndex !== -1) {
                // Toggle off
                reactions.splice(existingIndex, 1);
            }
            else {
                // Remove existing reaction by same user and add new
                reactions = reactions.filter((r) => r.userId !== user.id);
                reactions.push({
                    userId: user.id,
                    username: liveUser?.username || user.username,
                    avatarUrl: liveUser?.avatar_url || user.avatarUrl || undefined,
                    emoji: reactionEmoji,
                    createdAt: new Date().toISOString()
                });
            }
            const reactionsJson = JSON.stringify(reactions);
            index_js_1.db.prepare('UPDATE channel_posts SET reactions = ? WHERE id = ?').run(reactionsJson, id);
            // Broadcast reaction update to all clients
            io.emit('channel:post_reaction', { postId: id, reactions });
            return res.json({ success: true, reactions });
        }
        catch (err) {
            console.error('[Channel] Error toggling reaction:', err);
            return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
        }
    });
    // 8. Forward Channel Post to a User Conversation
    router.post('/posts/:id/forward', async (req, res) => {
        try {
            const { id } = req.params;
            const { targetUserId } = req.body;
            const user = req.user;
            const post = index_js_1.db.prepare('SELECT id, ciphertext, iv, auth_tag FROM channel_posts WHERE id = ?').get(id);
            if (!post) {
                return res.status(404).json({ error: 'POST_NOT_FOUND', message: 'Post not found' });
            }
            const postText = (0, crypto_js_1.decryptMessage)(post.ciphertext, post.iv, post.auth_tag);
            // Determine recipient according to Hub-and-Spoke security model:
            let recipientId;
            if (user.role === 'admin') {
                if (!targetUserId) {
                    return res.status(400).json({ error: 'MISSING_RECIPIENT', message: 'targetUserId required for admin forward' });
                }
                const recipientCheck = index_js_1.db.prepare('SELECT id, status FROM users WHERE id = ?').get(targetUserId);
                if (!recipientCheck || recipientCheck.status === 'banned') {
                    return res.status(400).json({ error: 'RECIPIENT_BANNED', message: 'Recipient is not active' });
                }
                recipientId = targetUserId;
            }
            else {
                // Regular user forward strictly goes to Admin
                const admin = index_js_1.db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
                if (!admin) {
                    return res.status(500).json({ error: 'ADMIN_NOT_FOUND', message: 'Admin account not found' });
                }
                recipientId = admin.id;
            }
            const defaultTtl = parseInt((0, index_js_1.getSettingValue)('default_ttl_seconds', '86400'), 10);
            const nowTime = new Date();
            const expiresAt = new Date(nowTime.getTime() + defaultTtl * 1000).toISOString();
            const createdAt = nowTime.toISOString();
            const messageId = (0, uuid_1.v4)();
            const encrypted = (0, crypto_js_1.encryptMessage)(postText);
            // Save into messages table with forward_from = 'channel'
            index_js_1.db.prepare(`
        INSERT INTO messages (id, sender_id, recipient_id, ciphertext, iv, auth_tag, created_at, expires_at, is_read, forward_from, reactions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'channel', '[]')
      `).run(messageId, user.id, recipientId, encrypted.ciphertext, encrypted.iv, encrypted.authTag, createdAt, expiresAt);
            const messagePayload = {
                id: messageId,
                senderId: user.id,
                recipientId,
                text: postText,
                createdAt,
                expiresAt,
                isRead: false,
                forwardFrom: 'channel',
                reactions: []
            };
            if (user.role === 'admin') {
                io.to(`user:${recipientId}`).emit('message:new', messagePayload);
                io.to('room:admin').emit('message:sent', messagePayload);
            }
            else {
                io.to('room:admin').emit('message:new', {
                    ...messagePayload,
                    senderUsername: user.username
                });
                io.to(`user:${user.id}`).emit('message:sent', messagePayload);
            }
            (0, pushService_js_1.dispatchPushForMessage)(user, recipientId, postText).catch(() => { });
            return res.status(201).json({ success: true, message: messagePayload });
        }
        catch (err) {
            console.error('[Channel] Error forwarding post:', err);
            return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
        }
    });
    return router;
}
