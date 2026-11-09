"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
dotenv_1.default.config();
const DATA_DIR = process.env.DATA_DIR || path_1.default.resolve(process.cwd(), 'data');
// Read app version strictly from the root VERSION file (Single Source of Truth)
const APP_VERSION = (() => {
    const candidates = [
        path_1.default.resolve(process.cwd(), 'VERSION'),
        path_1.default.resolve(process.cwd(), '../VERSION'),
        path_1.default.resolve(__dirname, 'VERSION'),
        path_1.default.resolve(__dirname, '../VERSION'),
        path_1.default.resolve(__dirname, '../../VERSION'),
        path_1.default.resolve(__dirname, '../../../VERSION')
    ];
    for (const p of candidates) {
        if (fs_1.default.existsSync(p))
            return fs_1.default.readFileSync(p, 'utf-8').trim();
    }
    throw new Error('VERSION file not found. Ensure VERSION file exists at project root.');
})();
// Ensure a fallback 32-byte key if none provided in development
const DEFAULT_KEY = process.env.ENCRYPTION_KEY || crypto_1.default.createHash('sha256').update(process.env.JWT_SECRET || 'xmessenger-default-secret-key-2026').digest('hex');
exports.config = {
    appVersion: APP_VERSION,
    port: parseInt(process.env.PORT || '3001', 10),
    jwtSecret: process.env.JWT_SECRET || 'xmessenger-jwt-super-secret-key-change-in-prod-2026',
    encryptionKey: DEFAULT_KEY.substring(0, 64), // 32 bytes hex = 64 characters
    dataDir: DATA_DIR,
    dbPath: process.env.DB_PATH || path_1.default.join(DATA_DIR, 'xmessenger.db'),
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
    isProduction: process.env.NODE_ENV === 'production',
    defaultTtlSeconds: parseInt(process.env.DEFAULT_TTL_SECONDS || '86400', 10), // 24 hours
    ttlCleanupIntervalMs: parseInt(process.env.TTL_CLEANUP_INTERVAL_MS || '10000', 10) // 10 seconds check
};
