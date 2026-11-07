import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, getSettingValue } from '../database/index.js';
import { hashPassword, comparePassword } from '../utils/crypto.js';
import { generateToken, authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { isAnyAdminOnline } from '../socket/index.js';

export const authRouter = Router();

// Public app information and status
authRouter.get('/meta', (req, res) => {
  const regEnabled = getSettingValue('registration_enabled', 'true') === 'true';
  const requireApproval = getSettingValue('require_approval', 'true') === 'true';
  const defaultTtl = parseInt(getSettingValue('default_ttl_seconds', '86400'), 10);

  res.json({
    registrationEnabled: regEnabled,
    requireApproval,
    defaultTtl
  });
});

// Register new user
authRouter.post('/register', async (req, res) => {
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

// Login
authRouter.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Username and password are required' });
    }

    const trimmedUsername = username.trim().toLowerCase();
    const user = db.prepare('SELECT id, username, password_hash, role, status FROM users WHERE username = ?').get(trimmedUsername) as {
      id: string;
      username: string;
      password_hash: string;
      role: 'admin' | 'user';
      status: 'active' | 'pending' | 'banned';
    } | undefined;

    if (!user) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
    }

    const passwordValid = await comparePassword(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
    }

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
  const user = req.user!;
  const adminUser = db.prepare("SELECT id, username, last_seen FROM users WHERE role = 'admin'").get() as {
    id: string;
    username: string;
    last_seen: string;
  } | undefined;

  res.json({
    user,
    adminInfo: user.role === 'user' && adminUser ? {
      id: adminUser.id,
      username: adminUser.username,
      lastSeen: adminUser.last_seen,
      isOnline: isAnyAdminOnline()
    } : null
  });
});

// Change Password
authRouter.post('/change-password', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Valid new password is required (min 6 characters)' });
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
