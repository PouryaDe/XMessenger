import { db } from '../database/index.js';
import { Server } from 'socket.io';
import { config } from '../config/index.js';

let cleanupTimer: NodeJS.Timeout | null = null;

export function startTtlWorker(io?: Server) {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
  }

  console.log(`[TTL Worker] Started. Polling every ${config.ttlCleanupIntervalMs / 1000}s for expired messages.`);

  cleanupTimer = setInterval(() => {
    try {
      const now = new Date().toISOString();

      // 1. Fetch expired message IDs to notify clients
      const expiredRows = db.prepare('SELECT id, sender_id, recipient_id FROM messages WHERE expires_at <= ?').all(now) as Array<{
        id: string;
        sender_id: string;
        recipient_id: string;
      }>;

      if (expiredRows.length > 0) {
        const ids = expiredRows.map(r => r.id);
        const placeholders = ids.map(() => '?').join(',');

        // 2. Permanently Hard Delete
        db.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).run(...ids);

        console.log(`[TTL Worker] Cleaned up ${expiredRows.length} expired message(s).`);

        // 3. Notify connected sockets in real-time
        if (io) {
          for (const row of expiredRows) {
            io.to(`user:${row.sender_id}`).emit('message:deleted', { messageId: row.id, reason: 'ttl_expired' });
            io.to(`user:${row.recipient_id}`).emit('message:deleted', { messageId: row.id, reason: 'ttl_expired' });
          }
        }
      }
    } catch (err) {
      console.error('[TTL Worker] Error during message cleanup:', err);
    }
  }, config.ttlCleanupIntervalMs);
}

export function stopTtlWorker() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
