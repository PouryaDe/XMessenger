import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

dotenv.config();

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');

// Read app version strictly from the root VERSION file (Single Source of Truth)
const APP_VERSION = (() => {
  const candidates = [
    path.resolve(process.cwd(), 'VERSION'),
    path.resolve(process.cwd(), '../VERSION'),
    path.resolve(__dirname, 'VERSION'),
    path.resolve(__dirname, '../VERSION'),
    path.resolve(__dirname, '../../VERSION'),
    path.resolve(__dirname, '../../../VERSION')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const v = fs.readFileSync(p, 'utf-8').trim();
        if (v) return v;
      } catch {}
    }
  }

  // Fallback 1: Read from client-dist/version.json
  try {
    const vJson = path.resolve(process.cwd(), 'client-dist/version.json');
    if (fs.existsSync(vJson)) {
      const data = JSON.parse(fs.readFileSync(vJson, 'utf-8'));
      if (data.version) return data.version;
    }
  } catch {}

  // Fallback 2: Read from package.json
  try {
    const pkgJson = path.resolve(process.cwd(), 'package.json');
    if (fs.existsSync(pkgJson)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf-8'));
      if (pkg.version) return pkg.version;
    }
  } catch {}

  return '2.2.2';
})();

// Ensure a fallback 32-byte key if none provided in development
const DEFAULT_KEY = process.env.ENCRYPTION_KEY || crypto.createHash('sha256').update(process.env.JWT_SECRET || 'xmessenger-default-secret-key-2026').digest('hex');

export const config = {
  appVersion: APP_VERSION,
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
