import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { Server } from 'socket.io';
import { config } from '../config/index.js';
import { db, getSettingValue, updateSettingValue } from '../database/index.js';
import { hashPassword, comparePassword } from '../utils/crypto.js';
import { generateToken, authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { isAnyAdminOnline } from '../socket/index.js';
import {
  getClientIp,
  checkLoginLockout,
  recordFailedLogin,
  recordSuccessfulLogin,
  registerRateLimiter,
  validateUsernameSecurity,
  DUMMY_BCRYPT_HASH
} from '../middleware/security.js';

export function createAuthRouter(io?: Server) {
  const authRouter = Router();

// Setup Multer for User/Admin Avatar uploads
const avatarsDir = path.join(config.dataDir, 'uploads', 'avatars');
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, avatarsDir);
  },
  filename: (req: AuthenticatedRequest, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.png';
    cb(null, `avatar-${req.user!.id}-${Date.now()}${cleanExt}`);
  }
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only safe image files (.png, .jpg, .jpeg, .webp, .gif) are allowed'));
    }
  }
});

// Public app information and status
authRouter.get('/meta', (req, res) => {
  const regEnabled = getSettingValue('registration_enabled', 'true') === 'true';
  const requireApproval = getSettingValue('require_approval', 'true') === 'true';
  const systemEnabled = getSettingValue('system_enabled', 'true') === 'true';
  const defaultTtl = parseInt(getSettingValue('default_ttl_seconds', '86400'), 10);
  const appName = getSettingValue('app_name', 'XMessenger');
  const pwaShortName = getSettingValue('pwa_short_name', 'XMessenger');
  const pwaIconUrl = getSettingValue('pwa_icon_url', '');

  let buildVersion = '';
  try {
    const v1 = path.resolve(process.cwd(), '../client/dist/version.json');
    const v2 = path.resolve(process.cwd(), './client-dist/version.json');
    const target = fs.existsSync(v1) ? v1 : (fs.existsSync(v2) ? v2 : null);
    if (target) {
      const data = JSON.parse(fs.readFileSync(target, 'utf-8'));
      buildVersion = data.buildVersion || '';
    }
  } catch (e) {}

  res.json({
    registrationEnabled: regEnabled,
    requireApproval,
    systemEnabled,
    defaultTtl,
    appName,
    pwaShortName,
    pwaIconUrl,
    version: config.appVersion,
    buildVersion
  });
});

// Register new user (protected by IP rate limiting & strict input validation)
authRouter.post('/register', registerRateLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Username and password are required' });
    }

    // Strict security check against injection, control chars and illegal formats
    const usernameValidation = validateUsernameSecurity(username);
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
    const regEnabled = getSettingValue('registration_enabled', 'true') === 'true';
    if (!regEnabled) {
      return res.status(403).json({ error: 'REGISTRATION_DISABLED', message: 'Registration is currently disabled by administrator' });
    }

    // Check if username already exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(trimmedUsername);
    if (existing) {
      return res.status(409).json({ error: 'USERNAME_TAKEN', message: 'Username already in use' });
    }

    // Determine initial status based on admin approval policy
    const requireApproval = getSettingValue('require_approval', 'true') === 'true';
    const initialStatus = requireApproval ? 'pending' : 'active';

    const userId = uuidv4();
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, last_seen)
      VALUES (?, ?, ?, 'user', ?, ?, ?)
    `).run(userId, trimmedUsername, passwordHash, initialStatus, now, now);

    const newUser = {
      id: userId,
      username: trimmedUsername,
      role: 'user' as const,
      status: initialStatus as 'active' | 'pending'
    };

    const token = generateToken(newUser);

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
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to register account' });
  }
});

// Login (anti-bot brute force protection, IP lockout, timing attack mitigation)
authRouter.post('/login', async (req, res) => {
  try {
    const ip = getClientIp(req);
    const { username, password } = req.body;

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Username and password are required' });
    }

    if (password.length > 128) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Password exceeds maximum allowed length' });
    }

    const trimmedUsername = username.trim().toLowerCase();

    // 1. Guard against brute force attacks and automated bots
    const lockout = checkLoginLockout(ip, trimmedUsername);
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
    const user = db.prepare('SELECT id, username, password_hash, role, status FROM users WHERE username = ?').get(trimmedUsername) as {
      id: string;
      username: string;
      password_hash: string;
      role: 'admin' | 'user';
      status: 'active' | 'pending' | 'banned';
    } | undefined;

    // 3. User does not exist: simulate bcrypt comparison using pre-computed DUMMY_BCRYPT_HASH
    // This strictly prevents timing analysis that bots use to enumerate usernames
    if (!user) {
      await comparePassword(password, DUMMY_BCRYPT_HASH);
      await recordFailedLogin(ip, trimmedUsername);
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
    }

    // 4. Verify password
    const passwordValid = await comparePassword(password, user.password_hash);
    if (!passwordValid) {
      await recordFailedLogin(ip, trimmedUsername);
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
    }

    // 5. Successful login: clear failed attempt tracker
    recordSuccessfulLogin(ip, trimmedUsername);

    // Update last seen
    const now = new Date().toISOString();
    db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(now, user.id);

    const authUser = {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status
    };

    const token = generateToken(authUser);

    res.json({
      token,
      user: authUser
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Login failed' });
  }
});

// Get profile & live status
authRouter.get('/me', authenticate, (req: AuthenticatedRequest, res) => {
  const userRow = db.prepare('SELECT id, username, role, status, avatar_url FROM users WHERE id = ?').get(req.user!.id) as {
    id: string;
    username: string;
    role: 'admin' | 'user';
    status: 'active' | 'pending' | 'banned';
    avatar_url?: string;
  } | undefined;

  const adminRow = db.prepare("SELECT id, username, last_seen, avatar_url FROM users WHERE role = 'admin'").get() as {
    id: string;
    username: string;
    last_seen: string;
    avatar_url?: string;
  } | undefined;

  const adminAvatarSetting = getSettingValue('admin_avatar_url', '');
  const systemEnabled = getSettingValue('system_enabled', 'true') === 'true';
  const showAdminPresence = getSettingValue('show_admin_presence', 'true') === 'true';

  res.json({
    user: userRow ? {
      id: userRow.id,
      username: userRow.username,
      role: userRow.role,
      status: userRow.status,
      avatarUrl: userRow.avatar_url || (userRow.role === 'admin' ? adminAvatarSetting : undefined) || undefined
    } : req.user,
    systemEnabled,
    adminInfo: req.user!.role === 'user' && adminRow ? {
      id: adminRow.id,
      username: adminRow.username,
      lastSeen: showAdminPresence ? adminRow.last_seen : null,
      isOnline: showAdminPresence ? isAnyAdminOnline() : false,
      showPresence: showAdminPresence,
      avatarUrl: adminRow.avatar_url || adminAvatarSetting || undefined
    } : null
  });
});

// Upload User / Admin Profile Picture
authRouter.post('/avatar', authenticate, uploadAvatar.single('avatar'), (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'NO_FILE', message: 'No image file uploaded' });
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const userId = req.user!.id;

    // Fetch previous avatar to delete file if it exists
    const prev = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(userId) as { avatar_url?: string } | undefined;
    if (prev?.avatar_url && prev.avatar_url.startsWith('/uploads/avatars/')) {
      const oldPath = path.join(config.dataDir, prev.avatar_url);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (_) {}
      }
    }

    // Save avatar URL in database
    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, userId);

    // If admin, synchronize with global admin avatar setting
    if (req.user!.role === 'admin') {
      updateSettingValue('admin_avatar_url', avatarUrl);
      if (io) {
        io.emit('admin:avatar_changed', { avatarUrl });
      }
    }

    res.json({
      success: true,
      avatarUrl,
      message: 'Avatar updated successfully'
    });
  } catch (err: any) {
    console.error('Error uploading avatar:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to upload avatar' });
  }
});

// Delete Profile Picture
authRouter.delete('/avatar', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const prev = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(userId) as { avatar_url?: string } | undefined;
    if (prev?.avatar_url && prev.avatar_url.startsWith('/uploads/avatars/')) {
      const oldPath = path.join(config.dataDir, prev.avatar_url);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (_) {}
      }
    }

    db.prepare('UPDATE users SET avatar_url = NULL WHERE id = ?').run(userId);

    if (req.user!.role === 'admin') {
      updateSettingValue('admin_avatar_url', '');
      if (io) {
        io.emit('admin:avatar_changed', { avatarUrl: undefined });
      }
    }

    res.json({ success: true, message: 'Avatar removed' });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to remove avatar' });
  }
});

// Change Password
authRouter.post('/change-password', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 128) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Valid new password is required (6-128 characters)' });
    }

    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as { password_hash: string };
    const valid = await comparePassword(currentPassword, row.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'INVALID_PASSWORD', message: 'Current password is incorrect' });
    }

    const newHash = await hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user!.id);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to update password' });
  }
});

  return authRouter;
}

export const authRouter = createAuthRouter();
