"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAdminRouter = createAdminRouter;
const express_1 = require("express");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const index_js_1 = require("../config/index.js");
const index_js_2 = require("../database/index.js");
const auth_js_1 = require("../middleware/auth.js");
const crypto_js_1 = require("../utils/crypto.js");
const index_js_3 = require("../socket/index.js");
function createAdminRouter(io) {
    const router = (0, express_1.Router)();
    // Ensure directories exist
    const iconsDir = path_1.default.join(index_js_1.config.dataDir, 'uploads', 'icons');
    const tempDir = path_1.default.join(index_js_1.config.dataDir, 'uploads', 'temp');
    if (!fs_1.default.existsSync(iconsDir))
        fs_1.default.mkdirSync(iconsDir, { recursive: true });
    if (!fs_1.default.existsSync(tempDir))
        fs_1.default.mkdirSync(tempDir, { recursive: true });
    // Multer for PWA icon upload
    const iconStorage = multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, iconsDir),
        filename: (_req, file, cb) => {
            const ext = path_1.default.extname(file.originalname).toLowerCase();
            const cleanExt = ['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(ext) ? ext : '.png';
            cb(null, `pwa-icon-${Date.now()}${cleanExt}`);
        }
    });
    const uploadIcon = (0, multer_1.default)({
        storage: iconStorage,
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
        fileFilter: (_req, file, cb) => {
            if (file.mimetype.startsWith('image/'))
                cb(null, true);
            else
                cb(new Error('Only image files are allowed for PWA icon'));
        }
    });
    // Multer for Database restore file upload
    const dbStorage = multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, tempDir),
        filename: (_req, _file, cb) => {
            cb(null, `restore-upload-${Date.now()}.db`);
        }
    });
    const uploadDb = (0, multer_1.default)({
        storage: dbStorage,
        limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
    });
    // All endpoints require admin authentication
    router.use(auth_js_1.authenticate, auth_js_1.requireAdmin);
    // 1. Get all users with conversation meta
    router.get('/users', (req, res) => {
        try {
            const users = index_js_2.db.prepare(`
        SELECT id, username, role, status, created_at, last_seen, avatar_url, category
        FROM users
        WHERE role = 'user'
        ORDER BY last_seen DESC
      `).all();
            const now = new Date().toISOString();
            // Enhance with conversation summary
            const usersWithMeta = users.map(user => {
                // Count unread non-expired messages sent by user to admin
                const unreadCount = index_js_2.db.prepare(`
          SELECT COUNT(*) as count
          FROM messages
          WHERE sender_id = ? AND recipient_id = ? AND is_read = 0 AND expires_at > ?
        `).get(user.id, req.user.id, now);
                // Get last non-expired message
                const lastMsgRow = index_js_2.db.prepare(`
          SELECT id, sender_id, recipient_id, ciphertext, iv, auth_tag, created_at, expires_at
          FROM messages
          WHERE ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))
            AND expires_at > ?
          ORDER BY created_at DESC
          LIMIT 1
        `).get(user.id, req.user.id, req.user.id, user.id, now);
                let lastMessage = null;
                if (lastMsgRow) {
                    lastMessage = {
                        id: lastMsgRow.id,
                        senderId: lastMsgRow.sender_id,
                        isFromAdmin: lastMsgRow.sender_id === req.user.id,
                        text: (0, crypto_js_1.decryptMessage)(lastMsgRow.ciphertext, lastMsgRow.iv, lastMsgRow.auth_tag),
                        createdAt: lastMsgRow.created_at,
                        expiresAt: lastMsgRow.expires_at
                    };
                }
                return {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    status: user.status,
                    created_at: user.created_at,
                    last_seen: user.last_seen,
                    avatarUrl: user.avatar_url || undefined,
                    category: user.category || null,
                    isOnline: (0, index_js_3.isUserOnline)(user.id),
                    unreadCount: unreadCount ? unreadCount.count : 0,
                    lastMessage
                };
            });
            // Sort users: conversations with messages first (by latest message timestamp DESC),
            // followed by users with no messages yet (sorted by created_at DESC)
            usersWithMeta.sort((a, b) => {
                const timeA = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
                const timeB = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
                if (timeA > 0 && timeB > 0) {
                    return timeB - timeA;
                }
                if (timeA > 0 && timeB === 0)
                    return -1;
                if (timeA === 0 && timeB > 0)
                    return 1;
                const fallbackA = a.created_at ? new Date(a.created_at).getTime() : (a.last_seen ? new Date(a.last_seen).getTime() : 0);
                const fallbackB = b.created_at ? new Date(b.created_at).getTime() : (b.last_seen ? new Date(b.last_seen).getTime() : 0);
                return fallbackB - fallbackA;
            });
            res.json({ users: usersWithMeta });
        }
        catch (err) {
            console.error('Error fetching admin users:', err);
            res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch users' });
        }
    });
    // 2. Change user status (approve, ban, or make pending)
    router.patch('/users/:id/status', (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;
            if (!['active', 'pending', 'banned'].includes(status)) {
                return res.status(400).json({ error: 'INVALID_STATUS', message: 'Status must be active, pending, or banned' });
            }
            const result = index_js_2.db.prepare('UPDATE users SET status = ? WHERE id = ? AND role = ?').run(status, id, 'user');
            if (result.changes === 0) {
                return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
            }
            // Notify user and admin room in real-time
            if (io) {
                io.to(`user:${id}`).emit('user:status_changed', { userId: id, status });
                io.to('room:admin').emit('user:status_changed', { userId: id, status });
                // If user is banned, disconnect active sockets after notifying
                if (status === 'banned') {
                    const userRoom = `user:${id}`;
                    const socketsInRoom = io.sockets.adapter.rooms.get(userRoom);
                    if (socketsInRoom) {
                        for (const socketId of socketsInRoom) {
                            const clientSocket = io.sockets.sockets.get(socketId);
                            if (clientSocket) {
                                clientSocket.emit('user:status_changed', { userId: id, status: 'banned' });
                                clientSocket.disconnect(true);
                            }
                        }
                    }
                }
            }
            res.json({ success: true, status });
        }
        catch (err) {
            res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to update user status' });
        }
    });
    // 3. Delete user completely
    router.delete('/users/:id', (req, res) => {
        try {
            const { id } = req.params;
            const user = index_js_2.db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
            if (!user || user.role === 'admin') {
                return res.status(400).json({ error: 'CANNOT_DELETE', message: 'Cannot delete admin or non-existent user' });
            }
            // Hard delete messages and user
            index_js_2.db.prepare('DELETE FROM messages WHERE sender_id = ? OR recipient_id = ?').run(id, id);
            index_js_2.db.prepare('DELETE FROM users WHERE id = ?').run(id);
            if (io) {
                io.to(`user:${id}`).emit('user:deleted');
                io.to('room:admin').emit('user:deleted', { userId: id });
            }
            res.json({ success: true, message: 'User and all conversation history deleted' });
        }
        catch (err) {
            res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to delete user' });
        }
    });
    // 3.5. Get encrypted admin notes for user (Admin Only)
    router.get('/users/:id/notes', (req, res) => {
        try {
            const { id } = req.params;
            const row = index_js_2.db.prepare('SELECT ciphertext, iv, auth_tag, updated_at FROM admin_user_notes WHERE user_id = ?').get(id);
            if (!row) {
                return res.json({ notes: '', updatedAt: null });
            }
            const notes = (0, crypto_js_1.decryptMessage)(row.ciphertext, row.iv, row.auth_tag);
            res.json({ notes, updatedAt: row.updated_at });
        }
        catch (err) {
            console.error('Failed to get user notes:', err);
            res.status(500).json({ error: 'FAILED_TO_GET_NOTES', message: 'Could not fetch user notes' });
        }
    });
    // 3.6. Update encrypted admin notes for user (Admin Only)
    router.put('/users/:id/notes', (req, res) => {
        try {
            const { id } = req.params;
            const { notes } = req.body;
            const targetUser = index_js_2.db.prepare('SELECT id FROM users WHERE id = ?').get(id);
            if (!targetUser) {
                return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
            }
            const text = typeof notes === 'string' ? notes.trim() : '';
            const now = new Date().toISOString();
            if (!text) {
                index_js_2.db.prepare('DELETE FROM admin_user_notes WHERE user_id = ?').run(id);
                return res.json({ success: true, notes: '', updatedAt: null });
            }
            const encrypted = (0, crypto_js_1.encryptMessage)(text);
            index_js_2.db.prepare(`
        INSERT INTO admin_user_notes (user_id, ciphertext, iv, auth_tag, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          ciphertext = excluded.ciphertext,
          iv = excluded.iv,
          auth_tag = excluded.auth_tag,
          updated_at = excluded.updated_at
      `).run(id, encrypted.ciphertext, encrypted.iv, encrypted.authTag, now);
            res.json({ success: true, notes: text, updatedAt: now });
        }
        catch (err) {
            console.error('Failed to update user notes:', err);
            res.status(500).json({ error: 'FAILED_TO_SAVE_NOTES', message: 'Could not save user notes' });
        }
    });
    // 3.7. Update user category (Admin Only)
    router.put('/users/:id/category', (req, res) => {
        try {
            const { id } = req.params;
            const { category } = req.body;
            const targetUser = index_js_2.db.prepare('SELECT id FROM users WHERE id = ?').get(id);
            if (!targetUser) {
                return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
            }
            const sanitizedCategory = (typeof category === 'string' && category.trim()) ? category.trim() : null;
            index_js_2.db.prepare('UPDATE users SET category = ? WHERE id = ?').run(sanitizedCategory, id);
            if (io) {
                io.to('room:admin').emit('user:category_updated', { userId: id, category: sanitizedCategory });
            }
            res.json({ success: true, category: sanitizedCategory });
        }
        catch (err) {
            console.error('Failed to update user category:', err);
            res.status(500).json({ error: 'FAILED_TO_UPDATE_CATEGORY', message: 'Could not update user category' });
        }
    });
    // 4. Get System Settings & Branding
    router.get('/settings', (req, res) => {
        const regEnabled = (0, index_js_2.getSettingValue)('registration_enabled', 'true') === 'true';
        const requireApproval = (0, index_js_2.getSettingValue)('require_approval', 'true') === 'true';
        const systemEnabled = (0, index_js_2.getSettingValue)('system_enabled', 'true') === 'true';
        const showAdminPresence = (0, index_js_2.getSettingValue)('show_admin_presence', 'true') === 'true';
        const defaultTtlSeconds = parseInt((0, index_js_2.getSettingValue)('default_ttl_seconds', '86400'), 10);
        const appName = (0, index_js_2.getSettingValue)('app_name', 'XMessenger');
        const pwaShortName = (0, index_js_2.getSettingValue)('pwa_short_name', 'XMessenger');
        const pwaIconUrl = (0, index_js_2.getSettingValue)('pwa_icon_url', '');
        const adminAvatarUrl = (0, index_js_2.getSettingValue)('admin_avatar_url', '');
        res.json({
            registrationEnabled: regEnabled,
            requireApproval,
            systemEnabled,
            showAdminPresence,
            defaultTtlSeconds,
            appName,
            pwaShortName,
            pwaIconUrl,
            adminAvatarUrl
        });
    });
    // 5. Update System Settings & Branding
    router.post('/settings', (req, res) => {
        try {
            const { registrationEnabled, requireApproval, systemEnabled, showAdminPresence, defaultTtlSeconds, appName, pwaShortName, pwaIconUrl, adminAvatarUrl } = req.body;
            if (typeof registrationEnabled === 'boolean') {
                (0, index_js_2.updateSettingValue)('registration_enabled', registrationEnabled ? 'true' : 'false');
            }
            if (typeof requireApproval === 'boolean') {
                (0, index_js_2.updateSettingValue)('require_approval', requireApproval ? 'true' : 'false');
            }
            if (typeof systemEnabled === 'boolean') {
                (0, index_js_2.updateSettingValue)('system_enabled', systemEnabled ? 'true' : 'false');
                if (io) {
                    io.emit('system:status_changed', { systemEnabled });
                }
            }
            if (typeof showAdminPresence === 'boolean') {
                (0, index_js_2.updateSettingValue)('show_admin_presence', showAdminPresence ? 'true' : 'false');
                if (io) {
                    if (!showAdminPresence) {
                        io.emit('admin:online_status', { isOnline: false, lastSeen: null, showPresence: false });
                    }
                    else {
                        const adminUser = index_js_2.db.prepare("SELECT last_seen FROM users WHERE role = 'admin'").get();
                        io.emit('admin:online_status', { isOnline: (0, index_js_3.isAnyAdminOnline)(), lastSeen: adminUser?.last_seen, showPresence: true });
                    }
                }
            }
            if (typeof defaultTtlSeconds === 'number' && defaultTtlSeconds > 0) {
                (0, index_js_2.updateSettingValue)('default_ttl_seconds', defaultTtlSeconds.toString());
            }
            if (typeof appName === 'string' && appName.trim().length > 0) {
                (0, index_js_2.updateSettingValue)('app_name', appName.trim());
            }
            if (typeof pwaShortName === 'string' && pwaShortName.trim().length > 0) {
                (0, index_js_2.updateSettingValue)('pwa_short_name', pwaShortName.trim());
            }
            if (typeof pwaIconUrl === 'string') {
                (0, index_js_2.updateSettingValue)('pwa_icon_url', pwaIconUrl.trim());
            }
            if (typeof adminAvatarUrl === 'string') {
                (0, index_js_2.updateSettingValue)('admin_avatar_url', adminAvatarUrl.trim());
                if (adminAvatarUrl.trim()) {
                    index_js_2.db.prepare("UPDATE users SET avatar_url = ? WHERE role = 'admin'").run(adminAvatarUrl.trim());
                }
            }
            res.json({ success: true, message: 'Settings updated successfully' });
        }
        catch (err) {
            res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to update settings' });
        }
    });
    // 6. Upload Custom PWA Icon
    router.post('/pwa-icon', uploadIcon.single('icon'), (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'NO_FILE', message: 'No icon file uploaded' });
            }
            const pwaIconUrl = `/uploads/icons/${req.file.filename}`;
            const prevIcon = (0, index_js_2.getSettingValue)('pwa_icon_url', '');
            // Remove previous icon file if custom
            if (prevIcon && prevIcon.startsWith('/uploads/icons/')) {
                const oldPath = path_1.default.join(index_js_1.config.dataDir, prevIcon);
                if (fs_1.default.existsSync(oldPath)) {
                    try {
                        fs_1.default.unlinkSync(oldPath);
                    }
                    catch (_) { }
                }
            }
            (0, index_js_2.updateSettingValue)('pwa_icon_url', pwaIconUrl);
            res.json({
                success: true,
                pwaIconUrl,
                message: 'PWA Icon updated successfully'
            });
        }
        catch (err) {
            console.error('Error updating PWA icon:', err);
            res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to update PWA icon' });
        }
    });
    // 7. Reset PWA Icon to default
    router.delete('/pwa-icon', (req, res) => {
        try {
            const prevIcon = (0, index_js_2.getSettingValue)('pwa_icon_url', '');
            if (prevIcon && prevIcon.startsWith('/uploads/icons/')) {
                const oldPath = path_1.default.join(index_js_1.config.dataDir, prevIcon);
                if (fs_1.default.existsSync(oldPath)) {
                    try {
                        fs_1.default.unlinkSync(oldPath);
                    }
                    catch (_) { }
                }
            }
            (0, index_js_2.updateSettingValue)('pwa_icon_url', '');
            res.json({ success: true, message: 'PWA icon reset to default' });
        }
        catch (err) {
            res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
        }
    });
    // 8. Download Database Backup (.db)
    router.get('/backup', async (req, res) => {
        try {
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10);
            const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');
            const backupFileName = `xmessenger-backup-${dateStr}-${timeStr}.db`;
            const tempBackupPath = path_1.default.join(index_js_1.config.dataDir, `backup-temp-${Date.now()}.db`);
            // SQLite native online backup: consistent snapshot without interrupting live readers/writers
            await index_js_2.db.backup(tempBackupPath);
            res.download(tempBackupPath, backupFileName, (err) => {
                if (fs_1.default.existsSync(tempBackupPath)) {
                    try {
                        fs_1.default.unlinkSync(tempBackupPath);
                    }
                    catch (_) { }
                }
                if (err && !res.headersSent) {
                    console.error('Download error:', err);
                    res.status(500).json({ error: 'DOWNLOAD_FAILED', message: 'Failed to download backup' });
                }
            });
        }
        catch (err) {
            console.error('Database backup error:', err);
            res.status(500).json({ error: 'BACKUP_FAILED', message: err.message || 'Failed to create database backup' });
        }
    });
    // 9. Restore Database from uploaded file
    router.post('/restore', uploadDb.single('file'), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'NO_FILE', message: 'No database backup file uploaded' });
        }
        const uploadedFilePath = req.file.path;
        try {
            // Step A: Open and strictly validate the uploaded SQLite database
            let uploadedDb;
            try {
                uploadedDb = new better_sqlite3_1.default(uploadedFilePath, { readonly: true });
            }
            catch (e) {
                throw new Error('The uploaded file is not a valid SQLite database');
            }
            // Check integrity
            const check = uploadedDb.pragma('quick_check');
            if (!check || check[0]?.quick_check !== 'ok') {
                uploadedDb.close();
                throw new Error('Database integrity check failed: file may be corrupted');
            }
            // Check essential tables
            const tables = uploadedDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
            const requiredTables = ['users', 'messages', 'settings'];
            const missing = requiredTables.filter(t => !tables.includes(t));
            if (missing.length > 0) {
                uploadedDb.close();
                throw new Error(`Invalid schema: missing required table(s): ${missing.join(', ')}`);
            }
            // Check admin account exists
            const adminCount = uploadedDb.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get();
            if (!adminCount || adminCount.count === 0) {
                uploadedDb.close();
                throw new Error('The backup does not contain an active admin account');
            }
            // Step B: Online restore into live database using SQLite online backup API
            await uploadedDb.backup(index_js_1.config.dbPath);
            uploadedDb.close();
            // Checkpoint WAL
            index_js_2.db.pragma('wal_checkpoint(TRUNCATE)');
            // Delete the temporary uploaded file
            if (fs_1.default.existsSync(uploadedFilePath)) {
                try {
                    fs_1.default.unlinkSync(uploadedFilePath);
                }
                catch (_) { }
            }
            if (io) {
                io.emit('database:restored');
            }
            res.json({
                success: true,
                message: 'Database restored successfully'
            });
        }
        catch (err) {
            if (fs_1.default.existsSync(uploadedFilePath)) {
                try {
                    fs_1.default.unlinkSync(uploadedFilePath);
                }
                catch (_) { }
            }
            console.error('Database restore error:', err);
            res.status(400).json({ error: 'RESTORE_FAILED', message: err.message || 'Failed to restore database' });
        }
    });
    // 10. Delete entire conversation between admin and a specific user
    router.delete('/conversations/:userId', (req, res) => {
        try {
            const { userId } = req.params;
            const adminId = req.user.id;
            index_js_2.db.prepare(`
        DELETE FROM messages
        WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
      `).run(adminId, userId, userId, adminId);
            if (io) {
                io.to(`user:${userId}`).emit('conversation:cleared', { clearedBy: 'admin' });
                io.to(`user:${adminId}`).emit('conversation:cleared', { userId, clearedBy: 'admin' });
            }
            res.json({ success: true, message: 'Conversation wiped for both sides' });
        }
        catch (err) {
            res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to clear conversation' });
        }
    });
    return router;
}
