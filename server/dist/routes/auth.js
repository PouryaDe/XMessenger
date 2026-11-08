"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const index_js_1 = require("../config/index.js");
const index_js_2 = require("../database/index.js");
const crypto_js_1 = require("../utils/crypto.js");
const auth_js_1 = require("../middleware/auth.js");
const index_js_3 = require("../socket/index.js");
exports.authRouter = (0, express_1.Router)();
// Setup Multer for User/Admin Avatar uploads
const avatarsDir = path_1.default.join(index_js_1.config.dataDir, 'uploads', 'avatars');
if (!fs_1.default.existsSync(avatarsDir)) {
    fs_1.default.mkdirSync(avatarsDir, { recursive: true });
}
const avatarStorage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, avatarsDir);
    },
    filename: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase() || '.png';
        cb(null, `avatar-${req.user.id}-${Date.now()}${ext}`);
    }
});
const uploadAvatar = (0, multer_1.default)({
    storage: avatarStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only image files are allowed'));
        }
    }
});
// Public app information and status
exports.authRouter.get('/meta', (req, res) => {
    const regEnabled = (0, index_js_2.getSettingValue)('registration_enabled', 'true') === 'true';
    const requireApproval = (0, index_js_2.getSettingValue)('require_approval', 'true') === 'true';
    const defaultTtl = parseInt((0, index_js_2.getSettingValue)('default_ttl_seconds', '86400'), 10);
    const appName = (0, index_js_2.getSettingValue)('app_name', 'XMessenger');
    const pwaShortName = (0, index_js_2.getSettingValue)('pwa_short_name', 'XMessenger');
    const pwaIconUrl = (0, index_js_2.getSettingValue)('pwa_icon_url', '');
    let buildVersion = '';
    try {
        const v1 = path_1.default.resolve(process.cwd(), '../client/dist/version.json');
        const v2 = path_1.default.resolve(process.cwd(), './client-dist/version.json');
        const target = fs_1.default.existsSync(v1) ? v1 : (fs_1.default.existsSync(v2) ? v2 : null);
        if (target) {
            const data = JSON.parse(fs_1.default.readFileSync(target, 'utf-8'));
            buildVersion = data.buildVersion || '';
        }
    }
    catch (e) { }
    res.json({
        registrationEnabled: regEnabled,
        requireApproval,
        defaultTtl,
        appName,
        pwaShortName,
        pwaIconUrl,
        version: index_js_1.config.appVersion,
        buildVersion
    });
});
// Register new user
exports.authRouter.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ error: 'INVALID_INPUT', message: 'Username and password are required' });
        }
        const trimmedUsername = username.trim().toLowerCase();
        if (trimmedUsername.length < 3 || trimmedUsername.length > 32) {
            return res.status(400).json({ error: 'INVALID_USERNAME', message: 'Username must be between 3 and 32 characters' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'WEAK_PASSWORD', message: 'Password must be at least 6 characters' });
        }
        // Check if registration is enabled by admin
        const regEnabled = (0, index_js_2.getSettingValue)('registration_enabled', 'true') === 'true';
        if (!regEnabled) {
            return res.status(403).json({ error: 'REGISTRATION_DISABLED', message: 'Registration is currently disabled by administrator' });
        }
        // Check if username already exists
        const existing = index_js_2.db.prepare('SELECT id FROM users WHERE username = ?').get(trimmedUsername);
        if (existing) {
            return res.status(409).json({ error: 'USERNAME_TAKEN', message: 'Username already in use' });
        }
        // Determine initial status based on admin approval policy
        const requireApproval = (0, index_js_2.getSettingValue)('require_approval', 'true') === 'true';
        const initialStatus = requireApproval ? 'pending' : 'active';
        const userId = (0, uuid_1.v4)();
        const passwordHash = await (0, crypto_js_1.hashPassword)(password);
        const now = new Date().toISOString();
        index_js_2.db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, last_seen)
      VALUES (?, ?, ?, 'user', ?, ?, ?)
    `).run(userId, trimmedUsername, passwordHash, initialStatus, now, now);
        const newUser = {
            id: userId,
            username: trimmedUsername,
            role: 'user',
            status: initialStatus
        };
        const token = (0, auth_js_1.generateToken)(newUser);
        res.status(201).json({
            token,
            user: newUser,
            message: initialStatus === 'pending'
                ? 'Account registered and awaiting admin approval'
                : 'Account created successfully'
        });
    }
    catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to register account' });
    }
});
// Login
exports.authRouter.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'INVALID_INPUT', message: 'Username and password are required' });
        }
        const trimmedUsername = username.trim().toLowerCase();
        const user = index_js_2.db.prepare('SELECT id, username, password_hash, role, status FROM users WHERE username = ?').get(trimmedUsername);
        if (!user) {
            return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
        }
        const passwordValid = await (0, crypto_js_1.comparePassword)(password, user.password_hash);
        if (!passwordValid) {
            return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
        }
        // Update last seen
        const now = new Date().toISOString();
        index_js_2.db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(now, user.id);
        const authUser = {
            id: user.id,
            username: user.username,
            role: user.role,
            status: user.status
        };
        const token = (0, auth_js_1.generateToken)(authUser);
        res.json({
            token,
            user: authUser
        });
    }
    catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Login failed' });
    }
});
// Get profile & live status
exports.authRouter.get('/me', auth_js_1.authenticate, (req, res) => {
    const userRow = index_js_2.db.prepare('SELECT id, username, role, status, avatar_url FROM users WHERE id = ?').get(req.user.id);
    const adminRow = index_js_2.db.prepare("SELECT id, username, last_seen, avatar_url FROM users WHERE role = 'admin'").get();
    const adminAvatarSetting = (0, index_js_2.getSettingValue)('admin_avatar_url', '');
    res.json({
        user: userRow ? {
            id: userRow.id,
            username: userRow.username,
            role: userRow.role,
            status: userRow.status,
            avatarUrl: userRow.avatar_url || undefined
        } : req.user,
        adminInfo: req.user.role === 'user' && adminRow ? {
            id: adminRow.id,
            username: adminRow.username,
            lastSeen: adminRow.last_seen,
            isOnline: (0, index_js_3.isAnyAdminOnline)(),
            avatarUrl: adminRow.avatar_url || adminAvatarSetting || undefined
        } : null
    });
});
// Upload User / Admin Profile Picture
exports.authRouter.post('/avatar', auth_js_1.authenticate, uploadAvatar.single('avatar'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'NO_FILE', message: 'No image file uploaded' });
        }
        const avatarUrl = `/uploads/avatars/${req.file.filename}`;
        const userId = req.user.id;
        // Fetch previous avatar to delete file if it exists
        const prev = index_js_2.db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(userId);
        if (prev?.avatar_url && prev.avatar_url.startsWith('/uploads/avatars/')) {
            const oldPath = path_1.default.join(index_js_1.config.dataDir, prev.avatar_url);
            if (fs_1.default.existsSync(oldPath)) {
                try {
                    fs_1.default.unlinkSync(oldPath);
                }
                catch (_) { }
            }
        }
        // Save avatar URL in database
        index_js_2.db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, userId);
        // If admin, synchronize with global admin avatar setting
        if (req.user.role === 'admin') {
            (0, index_js_2.updateSettingValue)('admin_avatar_url', avatarUrl);
        }
        res.json({
            success: true,
            avatarUrl,
            message: 'Avatar updated successfully'
        });
    }
    catch (err) {
        console.error('Error uploading avatar:', err);
        res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to upload avatar' });
    }
});
// Delete Profile Picture
exports.authRouter.delete('/avatar', auth_js_1.authenticate, (req, res) => {
    try {
        const userId = req.user.id;
        const prev = index_js_2.db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(userId);
        if (prev?.avatar_url && prev.avatar_url.startsWith('/uploads/avatars/')) {
            const oldPath = path_1.default.join(index_js_1.config.dataDir, prev.avatar_url);
            if (fs_1.default.existsSync(oldPath)) {
                try {
                    fs_1.default.unlinkSync(oldPath);
                }
                catch (_) { }
            }
        }
        index_js_2.db.prepare('UPDATE users SET avatar_url = NULL WHERE id = ?').run(userId);
        if (req.user.role === 'admin') {
            (0, index_js_2.updateSettingValue)('admin_avatar_url', '');
        }
        res.json({ success: true, message: 'Avatar removed' });
    }
    catch (err) {
        res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to remove avatar' });
    }
});
// Change Password
exports.authRouter.post('/change-password', auth_js_1.authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: 'INVALID_INPUT', message: 'Valid new password is required (min 6 characters)' });
        }
        const row = index_js_2.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
        const valid = await (0, crypto_js_1.comparePassword)(currentPassword, row.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'INVALID_PASSWORD', message: 'Current password is incorrect' });
        }
        const newHash = await (0, crypto_js_1.hashPassword)(newPassword);
        index_js_2.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);
        res.json({ success: true, message: 'Password updated successfully' });
    }
    catch (err) {
        res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to update password' });
    }
});
