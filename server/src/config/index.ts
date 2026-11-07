import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

dotenv.config();

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');

// Ensure a fallback 32-byte key if none provided in development
const DEFAULT_KEY = process.env.ENCRYPTION_KEY || crypto.createHash('sha256').update(process.env.JWT_SECRET || 'xmessenger-default-secret-key-2026').digest('hex');

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'xmessenger-jwt-super-secret-key-change-in-prod-2026',
  encryptionKey: DEFAULT_KEY.substring(0, 64), // 32 bytes hex = 64 characters
  dataDir: DATA_DIR,
  dbPath: process.env.DB_PATH || path.join(DATA_DIR, 'xmessenger.db'),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  isProduction: process.env.NODE_ENV === 'production',
  defaultTtlSeconds: parseInt(process.env.DEFAULT_TTL_SECONDS || '86400', 10), // 24 hours
  ttlCleanupIntervalMs: parseInt(process.env.TTL_CLEANUP_INTERVAL_MS || '10000', 10) // 10 seconds check
};
