import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { hashPassword } from '../utils/crypto.js';
import { v4 as uuidv4 } from 'uuid';

// Ensure data folder exists
if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

export const db = new Database(config.dbPath);

// Enable WAL mode & foreign keys for high performance and integrity
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  // 1. Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
      status TEXT NOT NULL CHECK(status IN ('active', 'pending', 'banned')),
      created_at TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      avatar_url TEXT
    );
  `);

  // Ensure avatar_url column exists for existing databases
  try {
    db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT;');
  } catch (_) {
    // Column already exists
  }

  // 2. Messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      reply_to_id TEXT,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_expires_at ON messages(expires_at);
    CREATE INDEX IF NOT EXISTS idx_messages_participants ON messages(sender_id, recipient_id);
  `);

  // Ensure reply_to_id column exists for existing databases
  try {
    db.exec('ALTER TABLE messages ADD COLUMN reply_to_id TEXT;');
  } catch (_) {
    // Column already exists
  }

  // 3. Push Subscriptions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_push_user_id ON push_subscriptions(user_id);
  `);

  // 4. Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Seed default settings if not exists
  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const setSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');

  setSetting.run('registration_enabled', 'true');
  setSetting.run('require_approval', 'true'); // Default requirement from prompt: approval can be enabled
  setSetting.run('default_ttl_seconds', config.defaultTtlSeconds.toString());
  setSetting.run('app_name', 'XMessenger');
  setSetting.run('pwa_short_name', 'XMessenger');
  setSetting.run('pwa_icon_url', '');
  setSetting.run('admin_avatar_url', '');

  // Seed initial Admin if not exists
  const existingAdmin = db.prepare("SELECT id, username FROM users WHERE role = 'admin'").get() as { id: string; username: string } | undefined;

  if (!existingAdmin) {
    const adminId = uuidv4();
    const defaultAdminUsername = process.env.ADMIN_USERNAME || 'admin';
    const defaultAdminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
    const hashed = hashPasswordSync(defaultAdminPassword);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, last_seen)
      VALUES (?, ?, ?, 'admin', 'active', ?, ?)
    `).run(adminId, defaultAdminUsername, hashed, now, now);

    console.log(`[Database] Initial Admin user seeded: "${defaultAdminUsername}" (Password: "${defaultAdminPassword}")`);
  }
}

// Synchronous bcrypt hash for database initialization
import bcrypt from 'bcryptjs';
function hashPasswordSync(password: string): string {
  return bcrypt.hashSync(password, 12);
}

export function getSettingValue(key: string, defaultValue: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : defaultValue;
}

export function updateSettingValue(key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
