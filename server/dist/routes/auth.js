"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
exports.createAuthRouter = createAuthRouter;
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
const security_js_1 = require("../middleware/security.js");
function createAuthRouter(io) {
    const authRouter = (0, express_1.Router)();
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
            const ext = path_1.default.extname(file.originalname).toLowerCase();
            const cleanExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.png';
            cb(null, `avatar-${req.user.id}-${Date.now()}${cleanExt}`);
        }
    });
    const uploadAvatar = (0, multer_1.default)({
        storage: avatarStorage,
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
        fileFilter: (_req, file, cb) => {
            const ext = path_1.default.extname(file.originalname).toLowerCase();
            if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) && file.mimetype.startsWith('image/')) {
                cb(null, true);
            }
            else {
                cb(new Error('Only safe image files (.png, .jpg, .jpeg, .webp, .gif) are allowed'));
            }
        }
    });
    // Public app information and status
    authRouter.get('/meta', (req, res) => {
        const regEnabled = (0, index_js_2.getSettingValue)('registration_enabled', 'true') === 'true';
        const requireApproval = (0, index_js_2.getSettingValue)('require_approval', 'true') === 'true';
        const systemEnabled = (0, index_js_2.getSettingValue)('system_enabled', 'true') === 'true';
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
            systemEnabled,
            defaultTtl,
            appName,
            pwaShortName,
            pwaIconUrl,
            version: index_js_1.config.appVersion,
            buildVersion
        });
    });
    // Register new user (protected by IP rate limiting & strict input validation)
    authRouter.post('/register', security_js_1.registerRateLimiter, async (req, res) => {
        try {
            const { username, password } = req.body;
            if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
                return res.status(400).json({ error: 'INVALID_INPUT', message: 'Username and password are required' });
            }
            // Strict security check against injection, control chars and illegal formats
            const usernameValidation = (0, security_js_1.validateUsernameSecurity)(username);
            if (!usernameValidation.valid) {
                return res.status(400).json({ error: usernameValidation.error, message: usernameValidation.message });
            }
            if (password.length < 6) {
                return res.status(400).json({ error: 'WEAK_PASSWORD', message: 'Password must be at least 6 characters' });
            }
            if (password.length > 128) {
                return res.status(400).json({ error: 'INVALID_INPUT', message: 'Password exceeds maximum allowed length' });
            }
            const trimmedUsername = username.trim().toLowerCase();
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
            // Real-time: Notify admin room instantly about new user registration / pending approval
            if (io) {
                const adminUserItem = {
                    id: userId,
                    username: trimmedUsername,
                    role: 'user',
                    status: initialStatus,
                    avatarUrl: undefined,
                    created_at: now,
                    last_seen: now,
                    lastMessage: null,
                    unreadCount: 0,
                    isOnline: false
                };
                // Broadcast new user to admin room (contains status: 'pending' | 'active')
                io.to('room:admin').emit('user:registered', adminUserItem);
                if (initialStatus === 'pending') {
                    io.to('room:admin').emit('user:pending_approval', adminUserItem);
                }
            }
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
    // Login (anti-bot brute force protection, IP lockout, timing attack mitigation)
    authRouter.post('/login', async (req, res) => {
        try {
            const ip = (0, security_js_1.getClientIp)(req);
            const { username, password } = req.body;
            if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
                return res.status(400).json({ error: 'INVALID_INPUT', message: 'Username and password are required' });
            }
            if (password.length > 128) {
                return res.status(400).json({ error: 'INVALID_INPUT', message: 'Password exceeds maximum allowed length' });
            }
            const trimmedUsername = username.trim().toLowerCase();
            // 1. Guard against brute force attacks and automated bots
            const lockout = (0, security_js_1.checkLoginLockout)(ip, trimmedUsername);
            if (lockout) {
                res.setHeader('Retry-After', lockout.remainingSeconds.toString());
                return res.status(429).json({
                    error: lockout.reason === 'ACCOUNT' ? 'ACCOUNT_LOCKED' : 'TOO_MANY_ATTEMPTS',
                    message: lockout.reason === 'ACCOUNT'
                        ? 'This account is temporarily locked due to repeated failed login attempts. Please try again in 15 minutes.'
                        : 'Too many failed login attempts from this IP. Please try again later.',
                    retryAfter: lockout.remainingSeconds
                });
            }
            // 2. Query user from database
            const user = index_js_2.db.prepare('SELECT id, username, password_hash, role, status FROM users WHERE username = ?').get(trimmedUsername);
            // 3. User does not exist: simulate bcrypt comparison using pre-computed DUMMY_BCRYPT_HASH
            // This strictly prevents timing analysis that bots use to enumerate usernames
            if (!user) {
                await (0, crypto_js_1.comparePassword)(password, security_js_1.DUMMY_BCRYPT_HASH);
                await (0, security_js_1.recordFailedLogin)(ip, trimmedUsername);
                return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
            }
            // 4. Verify password
            const passwordValid = await (0, crypto_js_1.comparePassword)(password, user.password_hash);
            if (!passwordValid) {
                await (0, security_js_1.recordFailedLogin)(ip, trimmedUsername);
                return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
            }
            // 5. Successful login: clear failed attempt tracker
            (0, security_js_1.recordSuccessfulLogin)(ip, trimmedUsername);
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
    authRouter.get('/me', auth_js_1.authenticate, (req, res) => {
        const userRow = index_js_2.db.prepare('SELECT id, username, role, status, avatar_url FROM users WHERE id = ?').get(req.user.id);
        const adminRow = index_js_2.db.prepare("SELECT id, username, last_seen, avatar_url FROM users WHERE role = 'admin'").get();
        const adminAvatarSetting = (0, index_js_2.getSettingValue)('admin_avatar_url', '');
        const systemEnabled = (0, index_js_2.getSettingValue)('system_enabled', 'true') === 'true';
        const showAdminPresence = (0, index_js_2.getSettingValue)('show_admin_presence', 'true') === 'true';
        res.json({
            user: userRow ? {
                id: userRow.id,
                username: userRow.username,
                role: userRow.role,
                status: userRow.status,
                avatarUrl: userRow.avatar_url || (userRow.role === 'admin' ? adminAvatarSetting : undefined) || undefined
            } : req.user,
            systemEnabled,
            adminInfo: req.user.role === 'user' && adminRow ? {
                id: adminRow.id,
                username: adminRow.username,
                lastSeen: showAdminPresence ? adminRow.last_seen : null,
                isOnline: showAdminPresence ? (0, index_js_3.isAnyAdminOnline)() : false,
                showPresence: showAdminPresence,
                avatarUrl: adminRow.avatar_url || adminAvatarSetting || undefined
            } : null
        });
    });
    // Upload User / Admin Profile Picture
    authRouter.post('/avatar', auth_js_1.authenticate, uploadAvatar.single('avatar'), (req, res) => {
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
                if (io) {
                    io.emit('admin:avatar_changed', { avatarUrl });
                }
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
    authRouter.delete('/avatar', auth_js_1.authenticate, (req, res) => {
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
                if (io) {
                    io.emit('admin:avatar_changed', { avatarUrl: undefined });
                }
            }
            res.json({ success: true, message: 'Avatar removed' });
        }
        catch (err) {
            res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to remove avatar' });
        }
    });
    // Change Password
    authRouter.post('/change-password', auth_js_1.authenticate, async (req, res) => {
        try {
            const { currentPassword, newPassword } = req.body;
            if (!currentPassword || !newPassword || typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 128) {
                return res.status(400).json({ error: 'INVALID_INPUT', message: 'Valid new password is required (6-128 characters)' });
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
    return authRouter;
}
exports.authRouter = createAuthRouter();
