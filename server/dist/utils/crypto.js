"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptMessage = encryptMessage;
exports.decryptMessage = decryptMessage;
exports.hashPassword = hashPassword;
exports.comparePassword = comparePassword;
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const index_js_1 = require("../config/index.js");
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV for AES-GCM
const KEY_BUFFER = Buffer.from(index_js_1.config.encryptionKey, 'hex');
/**
 * Encrypts raw text using AES-256-GCM with a unique IV.
 */
function encryptMessage(plainText) {
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, KEY_BUFFER, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return {
        ciphertext: encrypted,
        iv: iv.toString('hex'),
        authTag
    };
}
/**
 * Decrypts ciphertext using AES-256-GCM, verifying the auth tag.
 */
function decryptMessage(ciphertext, ivHex, authTagHex) {
    try {
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto_1.default.createDecipheriv(ALGORITHM, KEY_BUFFER, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch (error) {
        console.error('Decryption failed or message corrupted:', error);
        return '[Decryption Error: Message compromised or invalid key]';
    }
}
/**
 * Hash a password using bcrypt with salt rounds = 12.
 */
async function hashPassword(password) {
    return bcryptjs_1.default.hash(password, 12);
}
/**
 * Compare password against bcrypt hash.
 */
async function comparePassword(password, hash) {
    return bcryptjs_1.default.compare(password, hash);
}
