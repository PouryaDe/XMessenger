import { Router } from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { config } from '../config/index.js';
import { db, getSettingValue, updateSettingValue, clearSettingsCache } from '../database/index.js';
import { authenticate, requireAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import { encryptMessage, decryptMessage } from '../utils/crypto.js';
import { deleteAttachmentFromMessageText } from '../utils/fileCleaner.js';
import { isUserOnline, isAnyAdminOnline } from '../socket/index.js';
import { unlockAccount, clearAllLockouts } from '../middleware/security.js';
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
      const ext = path.extname(file.originalname).toLowerCase();
      const cleanExt = ['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(ext) ? ext : '.png';
      cb(null, `pwa-icon-${Date.now()}${cleanExt}`);
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
        SELECT id, username, role, status, created_at, last_seen, avatar_url, category
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
        category?: string | null;
      }>;

      const now = new Date().toISOString();
      const adminId = req.user!.id;

      // 1-query aggregation for all unread message counts (eliminates N+1 query bottleneck)
      const unreadRows = db.prepare(`
        SELECT sender_id, COUNT(*) as count
        FROM messages
        WHERE recipient_id = ? AND is_read = 0 AND expires_at > ?
        GROUP BY sender_id
      `).all(adminId, now) as Array<{ sender_id: string; count: number }>;

      const unreadMap = new Map<string, number>();
      for (const row of unreadRows) {
        unreadMap.set(row.sender_id, row.count);
      }

      // Pre-compiled statement for last message lookup (executed with indexed plan)
      const stmtLastMsg = db.prepare(`
        SELECT id, sender_id, recipient_id, ciphertext, iv, auth_tag, created_at, expires_at
        FROM messages
        WHERE ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))
          AND expires_at > ?
        ORDER BY created_at DESC
        LIMIT 1
      `);

      // Enhance with conversation summary
      const usersWithMeta = users.map(user => {
        const unreadCount = unreadMap.get(user.id) || 0;
        const lastMsgRow = stmtLastMsg.get(user.id, adminId, adminId, user.id, now) as {
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
          category: user.category || null,
          isOnline: isUserOnline(user.id),
          unreadCount,
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
        if (timeA > 0 && timeB === 0) return -1;
        if (timeA === 0 && timeB > 0) return 1;

        const fallbackA = a.created_at ? new Date(a.created_at).getTime() : (a.last_seen ? new Date(a.last_seen).getTime() : 0);
        const fallbackB = b.created_at ? new Date(b.created_at).getTime() : (b.last_seen ? new Date(b.last_seen).getTime() : 0);
        return fallbackB - fallbackA;
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

      // Clean up attachment files from disk before deleting messages
      const msgRows = db.prepare('SELECT ciphertext, iv, auth_tag FROM messages WHERE sender_id = ? OR recipient_id = ?').all(id, id) as Array<{
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

      // Hard delete messages and user
      db.prepare('DELETE FROM messages WHERE sender_id = ? OR recipient_id = ?').run(id, id);
      db.prepare('DELETE FROM users WHERE id = ?').run(id);

      if (io) {
        io.to(`user:${id}`).emit('user:deleted');
        io.to('room:admin').emit('user:deleted', { userId: id });
      }

      res.json({ success: true, message: 'User and all conversation history deleted' });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to delete user' });
    }
  });

  // 3.5. Get encrypted admin notes for user (Admin Only)
  router.get('/users/:id/notes', (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const row = db.prepare('SELECT ciphertext, iv, auth_tag, updated_at FROM admin_user_notes WHERE user_id = ?').get(id) as {
        ciphertext: string;
        iv: string;
        auth_tag: string;
        updated_at: string;
      } | undefined;

      if (!row) {
        return res.json({ notes: '', updatedAt: null });
      }

      const notes = decryptMessage(row.ciphertext, row.iv, row.auth_tag);
      res.json({ notes, updatedAt: row.updated_at });
    } catch (err: any) {
      console.error('Failed to get user notes:', err);
      res.status(500).json({ error: 'FAILED_TO_GET_NOTES', message: 'Could not fetch user notes' });
    }
  });

  // 3.6. Update encrypted admin notes for user (Admin Only)
  router.put('/users/:id/notes', (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
      if (!targetUser) {
        return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
      }

      const text = typeof notes === 'string' ? notes.trim() : '';
      const now = new Date().toISOString();

      if (!text) {
        db.prepare('DELETE FROM admin_user_notes WHERE user_id = ?').run(id);
        return res.json({ success: true, notes: '', updatedAt: null });
      }

      const encrypted = encryptMessage(text);
      db.prepare(`
        INSERT INTO admin_user_notes (user_id, ciphertext, iv, auth_tag, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          ciphertext = excluded.ciphertext,
          iv = excluded.iv,
          auth_tag = excluded.auth_tag,
          updated_at = excluded.updated_at
      `).run(id, encrypted.ciphertext, encrypted.iv, encrypted.authTag, now);

      res.json({ success: true, notes: text, updatedAt: now });
    } catch (err: any) {
      console.error('Failed to update user notes:', err);
      res.status(500).json({ error: 'FAILED_TO_SAVE_NOTES', message: 'Could not save user notes' });
    }
  });

  // 3.7. Update user category (Admin Only)
  router.put('/users/:id/category', (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { category } = req.body;

      const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
      if (!targetUser) {
        return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
      }

      const sanitizedCategory = (typeof category === 'string' && category.trim()) ? category.trim() : null;
      db.prepare('UPDATE users SET category = ? WHERE id = ?').run(sanitizedCategory, id);

      if (io) {
        io.to('room:admin').emit('user:category_updated', { userId: id, category: sanitizedCategory });
      }

      res.json({ success: true, category: sanitizedCategory });
    } catch (err: any) {
      console.error('Failed to update user category:', err);
      res.status(500).json({ error: 'FAILED_TO_UPDATE_CATEGORY', message: 'Could not update user category' });
    }
  });

  // 4. Get System Settings & Branding
  router.get('/settings', (req, res) => {
    const regEnabled = getSettingValue('registration_enabled', 'true') === 'true';
    const requireApproval = getSettingValue('require_approval', 'true') === 'true';
    const systemEnabled = getSettingValue('system_enabled', 'true') === 'true';
    const showAdminPresence = getSettingValue('show_admin_presence', 'true') === 'true';
    const defaultTtlSeconds = parseInt(getSettingValue('default_ttl_seconds', '86400'), 10);
    const appName = getSettingValue('app_name', 'XMessenger');
    const pwaShortName = getSettingValue('pwa_short_name', 'XMessenger');
    const pwaIconUrl = getSettingValue('pwa_icon_url', '');
    const adminAvatarUrl = getSettingValue('admin_avatar_url', '');

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
      const { 
        registrationEnabled, 
        requireApproval, 
        systemEnabled,
        showAdminPresence,
        defaultTtlSeconds,
        appName,
        pwaShortName,
        pwaIconUrl,
        adminAvatarUrl
      } = req.body;

      if (typeof registrationEnabled === 'boolean') {
        updateSettingValue('registration_enabled', registrationEnabled ? 'true' : 'false');
      }

      if (typeof requireApproval === 'boolean') {
        updateSettingValue('require_approval', requireApproval ? 'true' : 'false');
      }

      if (typeof systemEnabled === 'boolean') {
        updateSettingValue('system_enabled', systemEnabled ? 'true' : 'false');
        if (io) {
          io.emit('system:status_changed', { systemEnabled });
        }
      }

      if (typeof showAdminPresence === 'boolean') {
        updateSettingValue('show_admin_presence', showAdminPresence ? 'true' : 'false');
        if (io) {
          if (!showAdminPresence) {
            io.emit('admin:online_status', { isOnline: false, lastSeen: null, showPresence: false });
          } else {
            const adminUser = db.prepare("SELECT last_seen FROM users WHERE role = 'admin'").get() as { last_seen: string } | undefined;
            io.emit('admin:online_status', { isOnline: isAnyAdminOnline(), lastSeen: adminUser?.last_seen, showPresence: true });
          }
        }
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

      if (typeof pwaIconUrl === 'string') {
        updateSettingValue('pwa_icon_url', pwaIconUrl.trim());
      }

      if (typeof adminAvatarUrl === 'string') {
        const trimmed = adminAvatarUrl.trim();
        updateSettingValue('admin_avatar_url', trimmed);
        db.prepare("UPDATE users SET avatar_url = ? WHERE role = 'admin'").run(trimmed || null);
        if (io) {
          io.emit('admin:avatar_changed', { avatarUrl: trimmed || undefined });
        }
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

      // Checkpoint WAL & clear in-memory cache to reload restored settings
      db.pragma('wal_checkpoint(TRUNCATE)');
      clearSettingsCache();

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

      // Clean up attachment files from disk before deleting messages
      const msgRows = db.prepare(`
        SELECT ciphertext, iv, auth_tag FROM messages
        WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
      `).all(adminId, userId, userId, adminId) as Array<{
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

  // 11. Unlock account locked by anti-bot brute force system
  router.post('/unlock-account/:username', (req: AuthenticatedRequest, res) => {
    try {
      const username = String(req.params.username || '');
      if (!username) {
        return res.status(400).json({ error: 'INVALID_INPUT', message: 'Username is required' });
      }
      unlockAccount(username);
      res.json({ success: true, message: `Account '${username}' unlocked successfully` });
    } catch (err: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to unlock account' });
    }
  });

  // 12. Clear all system-wide lockout records
  router.post('/clear-lockouts', (_req: AuthenticatedRequest, res) => {
    try {
      clearAllLockouts();
      res.json({ success: true, message: 'All brute force lockouts have been reset' });
    } catch (err: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to clear lockouts' });
    }
  });

  return router;
}
