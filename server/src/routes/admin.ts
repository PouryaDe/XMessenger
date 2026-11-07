import { Router } from 'express';
import { db, getSettingValue, updateSettingValue } from '../database/index.js';
import { authenticate, requireAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import { decryptMessage } from '../utils/crypto.js';
import { Server } from 'socket.io';

export function createAdminRouter(io?: Server) {
  const router = Router();

  // All endpoints require admin authentication
  router.use(authenticate, requireAdmin);

  // 1. Get all users with conversation meta
  router.get('/users', (req: AuthenticatedRequest, res) => {
    try {
      const users = db.prepare(`
        SELECT id, username, role, status, created_at, last_seen
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
          ...user,
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

  // 4. Get System Settings
  router.get('/settings', (req, res) => {
    const regEnabled = getSettingValue('registration_enabled', 'true') === 'true';
    const requireApproval = getSettingValue('require_approval', 'true') === 'true';
    const defaultTtlSeconds = parseInt(getSettingValue('default_ttl_seconds', '86400'), 10);

    res.json({
      registrationEnabled: regEnabled,
      requireApproval,
      defaultTtlSeconds
    });
  });

  // 5. Update System Settings
  router.post('/settings', (req, res) => {
    try {
      const { registrationEnabled, requireApproval, defaultTtlSeconds } = req.body;

      if (typeof registrationEnabled === 'boolean') {
        updateSettingValue('registration_enabled', registrationEnabled ? 'true' : 'false');
      }

      if (typeof requireApproval === 'boolean') {
        updateSettingValue('require_approval', requireApproval ? 'true' : 'false');
      }

      if (typeof defaultTtlSeconds === 'number' && defaultTtlSeconds > 0) {
        updateSettingValue('default_ttl_seconds', defaultTtlSeconds.toString());
      }

      res.json({ success: true, message: 'Settings updated' });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to update settings' });
    }
  });

  // 6. Delete entire conversation between admin and a specific user
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
