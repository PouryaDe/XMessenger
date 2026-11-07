import { Router } from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { config } from '../config/index.js';
import { db, getSettingValue, updateSettingValue } from '../database/index.js';
import { authenticate, requireAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import { decryptMessage } from '../utils/crypto.js';
import { isUserOnline } from '../socket/index.js';
import { Server } from 'socket.io';

export function createAdminRouter(io?: Server) {
  const router = Router();

  // Ensure directories exist
  const iconsDir = path.join(config.dataDir, 'uploads', 'icons');
  const tempDir = path.join(config.dataDir, 'uploads', 'temp');
  if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  // Multer for PWA icon upload
  const iconStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, iconsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `pwa-icon-${Date.now()}${ext}`);
    }
  });
  const uploadIcon = multer({
    storage: iconStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Only image files are allowed for PWA icon'));
    }
  });

  // Multer for Database restore file upload
  const dbStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tempDir),
    filename: (_req, _file, cb) => {
      cb(null, `restore-upload-${Date.now()}.db`);
    }
  });
  const uploadDb = multer({
    storage: dbStorage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
  });

  // All endpoints require admin authentication
  router.use(authenticate, requireAdmin);

  // 1. Get all users with conversation meta
  router.get('/users', (req: AuthenticatedRequest, res) => {
    try {
      const users = db.prepare(`
        SELECT id, username, role, status, created_at, last_seen, avatar_url
        FROM users
        WHERE role = 'user'
        ORDER BY last_seen DESC
      `).all() as Array<{
        id: string;
        username: string;
        role: string;
        status: string;
        created_at: string;
        last_seen: string;
        avatar_url?: string;
      }>;

      // Enhance with conversation summary
      const usersWithMeta = users.map(user => {
        // Count unread messages sent by user to admin
        const unreadCount = db.prepare(`
          SELECT COUNT(*) as count
          FROM messages
          WHERE sender_id = ? AND recipient_id = ? AND is_read = 0
        `).get(user.id, req.user!.id) as { count: number };

        // Get last message
        const lastMsgRow = db.prepare(`
          SELECT id, sender_id, recipient_id, ciphertext, iv, auth_tag, created_at, expires_at
          FROM messages
          WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
          ORDER BY created_at DESC
          LIMIT 1
        `).get(user.id, req.user!.id, req.user!.id, user.id) as {
          id: string;
          sender_id: string;
          recipient_id: string;
          ciphertext: string;
          iv: string;
          auth_tag: string;
          created_at: string;
          expires_at: string;
        } | undefined;

        let lastMessage = null;
        if (lastMsgRow) {
          lastMessage = {
            id: lastMsgRow.id,
            senderId: lastMsgRow.sender_id,
            isFromAdmin: lastMsgRow.sender_id === req.user!.id,
            text: decryptMessage(lastMsgRow.ciphertext, lastMsgRow.iv, lastMsgRow.auth_tag),
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
          isOnline: isUserOnline(user.id),
          unreadCount: unreadCount ? unreadCount.count : 0,
          lastMessage
        };
      });

      res.json({ users: usersWithMeta });
    } catch (err) {
      console.error('Error fetching admin users:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch users' });
    }
  });

  // 2. Change user status (approve, ban, or make pending)
  router.patch('/users/:id/status', (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['active', 'pending', 'banned'].includes(status)) {
        return res.status(400).json({ error: 'INVALID_STATUS', message: 'Status must be active, pending, or banned' });
      }

      const result = db.prepare('UPDATE users SET status = ? WHERE id = ? AND role = ?').run(status, id, 'user');

      if (result.changes === 0) {
        return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
      }

      // Notify user in real-time
      if (io) {
        io.to(`user:${id}`).emit('user:status_changed', { status });
      }

      res.json({ success: true, status });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to update user status' });
    }
  });

  // 3. Delete user completely
  router.delete('/users/:id', (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id) as { id: string; role: string } | undefined;

      if (!user || user.role === 'admin') {
        return res.status(400).json({ error: 'CANNOT_DELETE', message: 'Cannot delete admin or non-existent user' });
      }

      // Hard delete messages and user
      db.prepare('DELETE FROM messages WHERE sender_id = ? OR recipient_id = ?').run(id, id);
      db.prepare('DELETE FROM users WHERE id = ?').run(id);

      if (io) {
        io.to(`user:${id}`).emit('user:deleted');
      }

      res.json({ success: true, message: 'User and all conversation history deleted' });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to delete user' });
    }
  });

  // 4. Get System Settings & Branding
  router.get('/settings', (req, res) => {
    const regEnabled = getSettingValue('registration_enabled', 'true') === 'true';
    const requireApproval = getSettingValue('require_approval', 'true') === 'true';
    const defaultTtlSeconds = parseInt(getSettingValue('default_ttl_seconds', '86400'), 10);
    const appName = getSettingValue('app_name', 'XMessenger');
    const pwaShortName = getSettingValue('pwa_short_name', 'XMessenger');
    const pwaIconUrl = getSettingValue('pwa_icon_url', '');
    const adminAvatarUrl = getSettingValue('admin_avatar_url', '');

    res.json({
      registrationEnabled: regEnabled,
      requireApproval,
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
      const { 
        registrationEnabled, 
        requireApproval, 
        defaultTtlSeconds,
        appName,
        pwaShortName
      } = req.body;

      if (typeof registrationEnabled === 'boolean') {
        updateSettingValue('registration_enabled', registrationEnabled ? 'true' : 'false');
      }

      if (typeof requireApproval === 'boolean') {
        updateSettingValue('require_approval', requireApproval ? 'true' : 'false');
      }

      if (typeof defaultTtlSeconds === 'number' && defaultTtlSeconds > 0) {
        updateSettingValue('default_ttl_seconds', defaultTtlSeconds.toString());
      }

      if (typeof appName === 'string' && appName.trim().length > 0) {
        updateSettingValue('app_name', appName.trim());
      }

      if (typeof pwaShortName === 'string' && pwaShortName.trim().length > 0) {
        updateSettingValue('pwa_short_name', pwaShortName.trim());
      }

      res.json({ success: true, message: 'Settings updated successfully' });
    } catch (err) {
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
      const prevIcon = getSettingValue('pwa_icon_url', '');

      // Remove previous icon file if custom
      if (prevIcon && prevIcon.startsWith('/uploads/icons/')) {
        const oldPath = path.join(config.dataDir, prevIcon);
        if (fs.existsSync(oldPath)) {
          try { fs.unlinkSync(oldPath); } catch (_) {}
        }
      }

      updateSettingValue('pwa_icon_url', pwaIconUrl);

      res.json({
        success: true,
        pwaIconUrl,
        message: 'PWA Icon updated successfully'
      });
    } catch (err: any) {
      console.error('Error updating PWA icon:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to update PWA icon' });
    }
  });

  // 7. Reset PWA Icon to default
  router.delete('/pwa-icon', (req, res) => {
    try {
      const prevIcon = getSettingValue('pwa_icon_url', '');
      if (prevIcon && prevIcon.startsWith('/uploads/icons/')) {
        const oldPath = path.join(config.dataDir, prevIcon);
        if (fs.existsSync(oldPath)) {
          try { fs.unlinkSync(oldPath); } catch (_) {}
        }
      }

      updateSettingValue('pwa_icon_url', '');
      res.json({ success: true, message: 'PWA icon reset to default' });
    } catch (err: any) {
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
      const tempBackupPath = path.join(config.dataDir, `backup-temp-${Date.now()}.db`);

      // SQLite native online backup: consistent snapshot without interrupting live readers/writers
      await db.backup(tempBackupPath);

      res.download(tempBackupPath, backupFileName, (err) => {
        if (fs.existsSync(tempBackupPath)) {
          try { fs.unlinkSync(tempBackupPath); } catch (_) {}
        }
        if (err && !res.headersSent) {
          console.error('Download error:', err);
          res.status(500).json({ error: 'DOWNLOAD_FAILED', message: 'Failed to download backup' });
        }
      });
    } catch (err: any) {
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
      let uploadedDb: Database.Database;
      try {
        uploadedDb = new Database(uploadedFilePath, { readonly: true });
      } catch (e: any) {
        throw new Error('The uploaded file is not a valid SQLite database');
      }

      // Check integrity
      const check = uploadedDb.pragma('quick_check') as Array<{ quick_check: string }>;
      if (!check || check[0]?.quick_check !== 'ok') {
        uploadedDb.close();
        throw new Error('Database integrity check failed: file may be corrupted');
      }

      // Check essential tables
      const tables = uploadedDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t: any) => t.name);
      const requiredTables = ['users', 'messages', 'settings'];
      const missing = requiredTables.filter(t => !tables.includes(t));
      if (missing.length > 0) {
        uploadedDb.close();
        throw new Error(`Invalid schema: missing required table(s): ${missing.join(', ')}`);
      }

      // Check admin account exists
      const adminCount = uploadedDb.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number };
      if (!adminCount || adminCount.count === 0) {
        uploadedDb.close();
        throw new Error('The backup does not contain an active admin account');
      }

      // Step B: Online restore into live database using SQLite online backup API
      await uploadedDb.backup(config.dbPath);
      uploadedDb.close();

      // Checkpoint WAL
      db.pragma('wal_checkpoint(TRUNCATE)');

      // Delete the temporary uploaded file
      if (fs.existsSync(uploadedFilePath)) {
        try { fs.unlinkSync(uploadedFilePath); } catch (_) {}
      }

      if (io) {
        io.emit('database:restored');
      }

      res.json({
        success: true,
        message: 'Database restored successfully'
      });
    } catch (err: any) {
      if (fs.existsSync(uploadedFilePath)) {
        try { fs.unlinkSync(uploadedFilePath); } catch (_) {}
      }
      console.error('Database restore error:', err);
      res.status(400).json({ error: 'RESTORE_FAILED', message: err.message || 'Failed to restore database' });
    }
  });

  // 10. Delete entire conversation between admin and a specific user
  router.delete('/conversations/:userId', (req: AuthenticatedRequest, res) => {
    try {
      const { userId } = req.params;
      const adminId = req.user!.id;

      db.prepare(`
        DELETE FROM messages
        WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
      `).run(adminId, userId, userId, adminId);

      if (io) {
        io.to(`user:${userId}`).emit('conversation:cleared', { clearedBy: 'admin' });
        io.to(`user:${adminId}`).emit('conversation:cleared', { userId, clearedBy: 'admin' });
      }

      res.json({ success: true, message: 'Conversation wiped for both sides' });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to clear conversation' });
    }
  });

  return router;
}
