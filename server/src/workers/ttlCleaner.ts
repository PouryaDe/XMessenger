import { db } from '../database/index.js';
import { Server } from 'socket.io';
import { config } from '../config/index.js';
import { decryptMessage } from '../utils/crypto.js';
import { deleteAttachmentFromMessageText } from '../utils/fileCleaner.js';

let cleanupTimer: NodeJS.Timeout | null = null;

export function startTtlWorker(io?: Server) {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
  }

  console.log(`[TTL Worker] Started. Polling every ${config.ttlCleanupIntervalMs / 1000}s for expired messages.`);

  cleanupTimer = setInterval(() => {
    try {
      const now = new Date().toISOString();

      // 1. Fetch expired messages to notify clients and unlink attached files
      const expiredRows = db.prepare('SELECT id, sender_id, recipient_id, ciphertext, iv, auth_tag FROM messages WHERE expires_at <= ?').all(now) as Array<{
        id: string;
        sender_id: string;
        recipient_id: string;
        ciphertext?: string;
        iv?: string;
        auth_tag?: string;
      }>;

      if (expiredRows.length > 0) {
        // Clean up attached images/files from disk before deletion
        for (const row of expiredRows) {
          if (row.ciphertext && row.iv && row.auth_tag) {
            try {
              const decrypted = decryptMessage(row.ciphertext, row.iv, row.auth_tag);
              deleteAttachmentFromMessageText(decrypted);
            } catch (_) {}
          }
        }

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
