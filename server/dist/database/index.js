"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.initDatabase = initDatabase;
exports.getSettingValue = getSettingValue;
exports.updateSettingValue = updateSettingValue;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const fs_1 = __importDefault(require("fs"));
const index_js_1 = require("../config/index.js");
const uuid_1 = require("uuid");
// Ensure data folder exists
if (!fs_1.default.existsSync(index_js_1.config.dataDir)) {
    fs_1.default.mkdirSync(index_js_1.config.dataDir, { recursive: true });
}
exports.db = new better_sqlite3_1.default(index_js_1.config.dbPath);
// Enable WAL mode & foreign keys for high performance and integrity
exports.db.pragma('journal_mode = WAL');
exports.db.pragma('foreign_keys = ON');
function initDatabase() {
    // 1. Users table
    exports.db.exec(`
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
        exports.db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT;');
    }
    catch (_) {
        // Column already exists
    }
    // 2. Messages table
    exports.db.exec(`
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
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_expires_at ON messages(expires_at);
    CREATE INDEX IF NOT EXISTS idx_messages_participants ON messages(sender_id, recipient_id);
  `);
    // 3. Push Subscriptions table
    exports.db.exec(`
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
    exports.db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
    // Seed default settings if not exists
    const getSetting = exports.db.prepare('SELECT value FROM settings WHERE key = ?');
    const setSetting = exports.db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    setSetting.run('registration_enabled', 'true');
    setSetting.run('require_approval', 'true'); // Default requirement from prompt: approval can be enabled
    setSetting.run('default_ttl_seconds', index_js_1.config.defaultTtlSeconds.toString());
    setSetting.run('app_name', 'XMessenger');
    setSetting.run('pwa_short_name', 'XMessenger');
    setSetting.run('pwa_icon_url', '');
    setSetting.run('admin_avatar_url', '');
    // Seed initial Admin if not exists
    const existingAdmin = exports.db.prepare("SELECT id, username FROM users WHERE role = 'admin'").get();
    if (!existingAdmin) {
        const adminId = (0, uuid_1.v4)();
        const defaultAdminUsername = process.env.ADMIN_USERNAME || 'admin';
        const defaultAdminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
        const hashed = hashPasswordSync(defaultAdminPassword);
        const now = new Date().toISOString();
        exports.db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, last_seen)
      VALUES (?, ?, ?, 'admin', 'active', ?, ?)
    `).run(adminId, defaultAdminUsername, hashed, now, now);
        console.log(`[Database] Initial Admin user seeded: "${defaultAdminUsername}" (Password: "${defaultAdminPassword}")`);
    }
}
// Synchronous bcrypt hash for database initialization
const bcryptjs_1 = __importDefault(require("bcryptjs"));
function hashPasswordSync(password) {
    return bcryptjs_1.default.hashSync(password, 12);
}
function getSettingValue(key, defaultValue) {
    const row = exports.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
}
function updateSettingValue(key, value) {
    exports.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
