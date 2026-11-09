"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTtlWorker = startTtlWorker;
exports.stopTtlWorker = stopTtlWorker;
const index_js_1 = require("../database/index.js");
const index_js_2 = require("../config/index.js");
const crypto_js_1 = require("../utils/crypto.js");
const fileCleaner_js_1 = require("../utils/fileCleaner.js");
let cleanupTimer = null;
function startTtlWorker(io) {
    if (cleanupTimer) {
        clearInterval(cleanupTimer);
    }
    console.log(`[TTL Worker] Started. Polling every ${index_js_2.config.ttlCleanupIntervalMs / 1000}s for expired messages.`);
    cleanupTimer = setInterval(() => {
        try {
            const now = new Date().toISOString();
            // 1. Fetch expired messages to notify clients and unlink attached files
            const expiredRows = index_js_1.db.prepare('SELECT id, sender_id, recipient_id, ciphertext, iv, auth_tag FROM messages WHERE expires_at <= ?').all(now);
            if (expiredRows.length > 0) {
                // Clean up attached images/files from disk before deletion
                for (const row of expiredRows) {
                    if (row.ciphertext && row.iv && row.auth_tag) {
                        try {
                            const decrypted = (0, crypto_js_1.decryptMessage)(row.ciphertext, row.iv, row.auth_tag);
                            (0, fileCleaner_js_1.deleteAttachmentFromMessageText)(decrypted);
                        }
                        catch (_) { }
                    }
                }
                const ids = expiredRows.map(r => r.id);
                const placeholders = ids.map(() => '?').join(',');
                // 2. Permanently Hard Delete
                index_js_1.db.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).run(...ids);
                console.log(`[TTL Worker] Cleaned up ${expiredRows.length} expired message(s).`);
                // 3. Notify connected sockets in real-time
                if (io) {
                    for (const row of expiredRows) {
                        io.to(`user:${row.sender_id}`).emit('message:deleted', { messageId: row.id, reason: 'ttl_expired' });
                        io.to(`user:${row.recipient_id}`).emit('message:deleted', { messageId: row.id, reason: 'ttl_expired' });
                    }
                }
            }
        }
        catch (err) {
            console.error('[TTL Worker] Error during message cleanup:', err);
        }
    }, index_js_2.config.ttlCleanupIntervalMs);
}
function stopTtlWorker() {
    if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
    }
}
