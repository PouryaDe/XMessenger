import express, { Router, Response } from 'express';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { db, getSettingValue } from '../database/index.js';
import { authenticate, requireActive, requireAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import { encryptMessage, decryptMessage } from '../utils/crypto.js';
import { deleteAttachmentFromMessageText } from '../utils/fileCleaner.js';
import { dispatchPushForChannelPost, dispatchPushForMessage } from '../services/pushService.js';

export function createChannelRouter(io: Server): Router {
  const router = express.Router();

  // All channel endpoints require authentication and active account status
  router.use(authenticate, requireActive);

  // 1. Get Channel Metadata (Title, Description, Subscribers Count)
  router.get('/meta', (req: AuthenticatedRequest, res: Response) => {
    try {
      const channelTitle = getSettingValue('channel_title', 'کانال اطلاع‌رسانی');
      const channelDescription = getSettingValue('channel_description', 'کانال رسمی اطلاع‌رسانی و اخبار سامانه');

      const isAdmin = req.user?.role === 'admin';
      let subscribersCount: number | undefined;

      if (isAdmin) {
        const subscribersRow = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'active'").get() as { count: number };
        subscribersCount = subscribersRow.count || 1;
      }

      return res.json({
        title: channelTitle,
        description: channelDescription,
        ...(isAdmin ? { subscribersCount } : {})
      });
    } catch (err: any) {
      console.error('[Channel] Error fetching metadata:', err);
      return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
  });

  // 2. Get All Channel Posts (sorted by createdAt ASC for stream rendering)
  router.get('/posts', (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const isAdmin = req.user?.role === 'admin';

      const rows = db.prepare(`
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
      `).all() as Array<{
        id: string;
        admin_id: string;
        ciphertext: string;
        iv: string;
        auth_tag: string;
        created_at: string;
        views_count: number;
        reactions: string | null;
      }>;

      // Fetch user's viewed post IDs to mark hasViewed accurately
      const userViews = new Set<string>();
      const viewRows = db.prepare('SELECT post_id FROM channel_post_views WHERE user_id = ?').all(userId) as Array<{ post_id: string }>;
      viewRows.forEach((v) => userViews.add(v.post_id));

      const posts = rows.map((r) => {
        let text = '';
        try {
          text = decryptMessage(r.ciphertext, r.iv, r.auth_tag);
        } catch (_) {
          text = '[Encrypted message]';
        }

        let reactions = [];
        try {
          reactions = r.reactions ? JSON.parse(r.reactions) : [];
        } catch {
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
    } catch (err: any) {
      console.error('[Channel] Error fetching posts:', err);
      return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
  });

  // 3. Create a New Channel Post (Admin Only)
  router.post('/posts', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'EMPTY_TEXT', message: 'Post content cannot be empty' });
      }

      if (text.length > 50000) {
        return res.status(400).json({ error: 'TEXT_TOO_LONG', message: 'Post exceeds maximum allowed length of 50,000 characters' });
      }

      const postId = uuidv4();
      const adminId = req.user!.id;
      const createdAt = new Date().toISOString();
      const trimmedText = text.trim();

      // Encrypt at rest with AES-256-GCM
      const encrypted = encryptMessage(trimmedText);

      db.prepare(`
        INSERT INTO channel_posts (id, admin_id, ciphertext, iv, auth_tag, created_at, views_count, reactions)
        VALUES (?, ?, ?, ?, ?, ?, 1, '[]')
      `).run(postId, adminId, encrypted.ciphertext, encrypted.iv, encrypted.authTag, createdAt);

      // Record admin's own view immediately
      db.prepare(`
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
      dispatchPushForChannelPost(postId).catch(() => {});

      return res.status(201).json({ success: true, post: postPayload });
    } catch (err: any) {
      console.error('[Channel] Error creating post:', err);
      return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
  });

  // 4. Delete a Channel Post (Admin Only)
  router.delete('/posts/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const row = db.prepare('SELECT id, ciphertext, iv, auth_tag FROM channel_posts WHERE id = ?').get(id) as {
        id: string;
        ciphertext?: string;
        iv?: string;
        auth_tag?: string;
      } | undefined;

      if (!row) {
        return res.status(404).json({ error: 'POST_NOT_FOUND', message: 'Post not found' });
      }

      // Clean up any uploaded file or image attachment from disk
      if (row.ciphertext && row.iv && row.auth_tag) {
        try {
          const decrypted = decryptMessage(row.ciphertext, row.iv, row.auth_tag);
          deleteAttachmentFromMessageText(decrypted);
        } catch (_) {}
      }

      // Defensive hard delete from database (views + post)
      db.prepare('DELETE FROM channel_post_views WHERE post_id = ?').run(id);
      db.prepare('DELETE FROM channel_posts WHERE id = ?').run(id);

      // Broadcast real-time deletion
      io.emit('channel:post_deleted', { postId: id });

      return res.json({ success: true });
    } catch (err: any) {
      console.error('[Channel] Error deleting post:', err);
      return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
  });

  // 5. Record Post View (Increments view count and stores user view timestamp)
  router.post('/posts/:id/view', (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const isAdmin = req.user?.role === 'admin';
      const now = new Date().toISOString();

      const post = db.prepare('SELECT id, views_count FROM channel_posts WHERE id = ?').get(id) as {
        id: string;
        views_count: number;
      } | undefined;

      if (!post) {
        return res.status(404).json({ error: 'POST_NOT_FOUND', message: 'Post not found' });
      }

      // Insert view record (unique per user per post)
      const insertResult = db.prepare(`
        INSERT OR IGNORE INTO channel_post_views (post_id, user_id, viewed_at)
        VALUES (?, ?, ?)
      `).run(id, userId, now);

      let currentViews = post.views_count;

      if (insertResult.changes > 0) {
        // Compute accurate total views directly from channel_post_views to prevent drift
        const countRow = db.prepare('SELECT COUNT(*) as count FROM channel_post_views WHERE post_id = ?').get(id) as { count: number };
        currentViews = countRow.count || 1;
        db.prepare('UPDATE channel_posts SET views_count = ? WHERE id = ?').run(currentViews, id);

        // Emit updated view count to all clients
        io.emit('channel:post_viewed', { postId: id, viewsCount: currentViews, userId });
      }

      return res.json({ success: true, viewsCount: currentViews });
    } catch (err: any) {
      console.error('[Channel] Error recording view:', err);
      return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
  });

  // 6. Get Granular Post Viewers List (Admin Only)
  router.get('/posts/:id/viewers', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const post = db.prepare('SELECT id FROM channel_posts WHERE id = ?').get(id);
      if (!post) {
        return res.status(404).json({ error: 'POST_NOT_FOUND', message: 'Post not found' });
      }

      const viewers = db.prepare(`
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
      `).all(id) as Array<{
        userId: string;
        username: string;
        avatarUrl?: string;
        category?: string;
        viewedAt: string;
      }>;

      return res.json({ viewers });
    } catch (err: any) {
      console.error('[Channel] Error fetching viewers:', err);
      return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
  });

  // 6.5. Get Granular Post Reactions List (Admin Only)
  router.get('/posts/:id/reactions', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const post = db.prepare('SELECT id, reactions FROM channel_posts WHERE id = ?').get(id) as {
        id: string;
        reactions?: string | null;
      } | undefined;

      if (!post) {
        return res.status(404).json({ error: 'POST_NOT_FOUND', message: 'Post not found' });
      }

      let storedReactions: Array<{ userId: string; emoji: string; createdAt: string }> = [];
      try {
        storedReactions = post.reactions ? JSON.parse(post.reactions) : [];
      } catch {
        storedReactions = [];
      }

      if (storedReactions.length === 0) {
        return res.json({ reactions: [] });
      }

      const userIds = storedReactions.map((r) => r.userId);
      const placeholders = userIds.map(() => '?').join(',');
      const users = db.prepare(`
        SELECT id, username, avatar_url as avatarUrl, category
        FROM users
        WHERE id IN (${placeholders})
      `).all(...userIds) as Array<{
        id: string;
        username: string;
        avatarUrl?: string;
        category?: string;
      }>;

      const userMap = new Map(users.map((u) => [u.id, u]));

      const reactions = storedReactions.map((r) => {
        const u = userMap.get(r.userId);
        return {
          userId: r.userId,
          username: u?.username || 'کاربر',
          avatarUrl: u?.avatarUrl,
          category: u?.category,
          emoji: r.emoji,
          createdAt: r.createdAt
        };
      }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return res.json({ reactions });
    } catch (err: any) {
      console.error('[Channel] Error fetching reactions:', err);
      return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
  });

  // 7. Toggle Reaction on Channel Post
  router.post('/posts/:id/react', (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const user = req.user!;
      const rawEmoji = (typeof req.body?.emoji === 'string' && req.body.emoji.trim()) ? req.body.emoji.trim() : '👍';
      const reactionEmoji = ['👍', '❤️'].includes(rawEmoji) ? rawEmoji : '👍';

      const post = db.prepare('SELECT id, reactions FROM channel_posts WHERE id = ?').get(id) as {
        id: string;
        reactions?: string | null;
      } | undefined;

      if (!post) {
        return res.status(404).json({ error: 'POST_NOT_FOUND', message: 'Post not found' });
      }

      let reactions: Array<{ userId: string; username: string; avatarUrl?: string; emoji: string; createdAt: string }> = [];
      try {
        reactions = post.reactions ? JSON.parse(post.reactions) : [];
      } catch {}

      const liveUser = db.prepare('SELECT username, avatar_url FROM users WHERE id = ?').get(user.id) as {
        username: string;
        avatar_url?: string;
      } | undefined;

      const existingIndex = reactions.findIndex((r) => r.userId === user.id && r.emoji === reactionEmoji);
      if (existingIndex !== -1) {
        // Toggle off
        reactions.splice(existingIndex, 1);
      } else {
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
      db.prepare('UPDATE channel_posts SET reactions = ? WHERE id = ?').run(reactionsJson, id);

      // Broadcast reaction update to all clients
      io.emit('channel:post_reaction', { postId: id, reactions });

      return res.json({ success: true, reactions });
    } catch (err: any) {
      console.error('[Channel] Error toggling reaction:', err);
      return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
  });

  // 8. Forward Channel Post to a User Conversation
  router.post('/posts/:id/forward', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { targetUserId } = req.body;
      const user = req.user!;

      const post = db.prepare('SELECT id, ciphertext, iv, auth_tag FROM channel_posts WHERE id = ?').get(id) as {
        id: string;
        ciphertext: string;
        iv: string;
        auth_tag: string;
      } | undefined;

      if (!post) {
        return res.status(404).json({ error: 'POST_NOT_FOUND', message: 'Post not found' });
      }

      const postText = decryptMessage(post.ciphertext, post.iv, post.auth_tag);

      // Determine recipient according to Hub-and-Spoke security model:
      let recipientId: string;
      if (user.role === 'admin') {
        if (!targetUserId) {
          return res.status(400).json({ error: 'MISSING_RECIPIENT', message: 'targetUserId required for admin forward' });
        }
        const recipientCheck = db.prepare('SELECT id, status FROM users WHERE id = ?').get(targetUserId) as { id: string; status: string } | undefined;
        if (!recipientCheck || recipientCheck.status === 'banned') {
          return res.status(400).json({ error: 'RECIPIENT_BANNED', message: 'Recipient is not active' });
        }
        recipientId = targetUserId;
      } else {
        // Regular user forward strictly goes to Admin
        const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get() as { id: string } | undefined;
        if (!admin) {
          return res.status(500).json({ error: 'ADMIN_NOT_FOUND', message: 'Admin account not found' });
        }
        recipientId = admin.id;
      }

      const defaultTtl = parseInt(getSettingValue('default_ttl_seconds', '86400'), 10);
      const nowTime = new Date();
      const expiresAt = new Date(nowTime.getTime() + defaultTtl * 1000).toISOString();
      const createdAt = nowTime.toISOString();
      const messageId = uuidv4();

      const encrypted = encryptMessage(postText);

      // Save into messages table with forward_from = 'channel'
      db.prepare(`
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
      } else {
        io.to('room:admin').emit('message:new', {
          ...messagePayload,
          senderUsername: user.username
        });
        io.to(`user:${user.id}`).emit('message:sent', messagePayload);
      }

      dispatchPushForMessage(user, recipientId, postText).catch(() => {});

      return res.status(201).json({ success: true, message: messagePayload });
    } catch (err: any) {
      console.error('[Channel] Error forwarding post:', err);
      return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
  });

  return router;
}
