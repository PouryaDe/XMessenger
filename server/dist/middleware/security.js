"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DUMMY_BCRYPT_HASH = void 0;
exports.getClientIp = getClientIp;
exports.checkLoginLockout = checkLoginLockout;
exports.recordFailedLogin = recordFailedLogin;
exports.recordSuccessfulLogin = recordSuccessfulLogin;
exports.registerRateLimiter = registerRateLimiter;
exports.validateUsernameSecurity = validateUsernameSecurity;
exports.securityHeadersMiddleware = securityHeadersMiddleware;
exports.resetSecurityStateForTests = resetSecurityStateForTests;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
// Pre-computed dummy hash to prevent timing attacks when checking non-existent accounts
exports.DUMMY_BCRYPT_HASH = bcryptjs_1.default.hashSync('xmessenger-timing-attack-protection-constant-time-2026', 12);
// 1. IP failed login attempts: tracks total failed login attempts from an IP
const ipFailedAttempts = new Map();
// 2. Target failed attempts: tracks failed attempts per (IP + ':' + username) pair
// Isolates attackers so a malicious IP cannot lock out legitimate users or the real admin
const userFailedAttempts = new Map();
// 3. Register attempts: tracks account creation attempts per IP
const ipRegisterAttempts = new Map();
// Security Configuration Parameters
const MAX_FAILED_PER_TARGET = 5; // 5 consecutive failed attempts on an account from an IP triggers 15m lockout
const MAX_FAILED_PER_IP = 15; // 15 total failed attempts from an IP across any accounts triggers IP lockout
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes lockout duration
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes observation window
const MAX_REGISTRATIONS_PER_IP = 5; // Max 5 account registrations per 15 mins per IP
// Periodically clean up expired records every 5 minutes to prevent memory leaks
const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of ipFailedAttempts.entries()) {
        if (now - record.firstAttempt > ATTEMPT_WINDOW_MS && (!record.lockedUntil || now > record.lockedUntil)) {
            ipFailedAttempts.delete(key);
        }
    }
    for (const [key, record] of userFailedAttempts.entries()) {
        if (now - record.firstAttempt > ATTEMPT_WINDOW_MS && (!record.lockedUntil || now > record.lockedUntil)) {
            userFailedAttempts.delete(key);
        }
    }
    for (const [key, record] of ipRegisterAttempts.entries()) {
        if (now - record.firstAttempt > ATTEMPT_WINDOW_MS && (!record.lockedUntil || now > record.lockedUntil)) {
            ipRegisterAttempts.delete(key);
        }
    }
}, 5 * 60 * 1000);
// Prevent cleanup interval from blocking process termination during test suites
if (cleanupTimer.unref) {
    cleanupTimer.unref();
}
/**
 * Extracts real client IP safely, accounting for reverse proxies (Nginx / Cloudflare / Docker bridge)
 */
function getClientIp(req) {
    const xForwarded = req.headers['x-forwarded-for'];
    if (typeof xForwarded === 'string') {
        return xForwarded.split(',')[0].trim();
    }
    if (Array.isArray(xForwarded) && xForwarded.length > 0) {
        return xForwarded[0].trim();
    }
    const xRealIp = req.headers['x-real-ip'];
    if (typeof xRealIp === 'string') {
        return xRealIp.trim();
    }
    return req.ip || req.socket.remoteAddress || '127.0.0.1';
}
/**
 * Checks if a login attempt is locked out (due to IP limit or target account limit)
 */
function checkLoginLockout(ip, username) {
    const now = Date.now();
    const cleanUser = username.trim().toLowerCase();
    const targetKey = `${ip}:${cleanUser}`;
    // 1. Check IP-level lockout
    const ipRecord = ipFailedAttempts.get(ip);
    if (ipRecord?.lockedUntil && now < ipRecord.lockedUntil) {
        return {
            locked: true,
            remainingSeconds: Math.ceil((ipRecord.lockedUntil - now) / 1000),
            reason: 'IP'
        };
    }
    // 2. Check Target account lockout from this IP
    const targetRecord = userFailedAttempts.get(targetKey);
    if (targetRecord?.lockedUntil && now < targetRecord.lockedUntil) {
        return {
            locked: true,
            remainingSeconds: Math.ceil((targetRecord.lockedUntil - now) / 1000),
            reason: 'ACCOUNT'
        };
    }
    return null;
}
/**
 * Records a failed login attempt and calculates progressive delays/lockouts
 */
async function recordFailedLogin(ip, username) {
    const now = Date.now();
    const cleanUser = username.trim().toLowerCase();
    const targetKey = `${ip}:${cleanUser}`;
    // Update target account record
    let targetRecord = userFailedAttempts.get(targetKey);
    if (!targetRecord || (now - targetRecord.firstAttempt > ATTEMPT_WINDOW_MS && (!targetRecord.lockedUntil || now > targetRecord.lockedUntil))) {
        targetRecord = { count: 1, firstAttempt: now };
    }
    else {
        targetRecord.count += 1;
    }
    if (targetRecord.count >= MAX_FAILED_PER_TARGET) {
        targetRecord.lockedUntil = now + LOCKOUT_WINDOW_MS;
    }
    userFailedAttempts.set(targetKey, targetRecord);
    // Update IP record
    let ipRecord = ipFailedAttempts.get(ip);
    if (!ipRecord || (now - ipRecord.firstAttempt > ATTEMPT_WINDOW_MS && (!ipRecord.lockedUntil || now > ipRecord.lockedUntil))) {
        ipRecord = { count: 1, firstAttempt: now };
    }
    else {
        ipRecord.count += 1;
    }
    if (ipRecord.count >= MAX_FAILED_PER_IP) {
        ipRecord.lockedUntil = now + LOCKOUT_WINDOW_MS;
    }
    ipFailedAttempts.set(ip, ipRecord);
    // Artificial progressive delay to handicap automated bot brute-forcers
    // 1st attempt: 0ms, 2nd attempt: 400ms, 3rd: 800ms, 4th+: 1200ms
    if (targetRecord.count > 1) {
        const delayMs = Math.min((targetRecord.count - 1) * 400, 1500);
        await new Promise((res) => setTimeout(res, delayMs));
    }
}
/**
 * Resets failed attempts counter upon successful login
 */
function recordSuccessfulLogin(ip, username) {
    const cleanUser = username.trim().toLowerCase();
    userFailedAttempts.delete(`${ip}:${cleanUser}`);
    // Decrement IP count on success
    const ipRecord = ipFailedAttempts.get(ip);
    if (ipRecord) {
        ipRecord.count = Math.max(0, ipRecord.count - 1);
    }
}
/**
 * Registration rate-limiting middleware (prevents bot account generation)
 */
function registerRateLimiter(req, res, next) {
    const ip = getClientIp(req);
    const now = Date.now();
    let record = ipRegisterAttempts.get(ip);
    if (!record || now - record.firstAttempt > ATTEMPT_WINDOW_MS) {
        record = { count: 1, firstAttempt: now };
        ipRegisterAttempts.set(ip, record);
        return next();
    }
    record.count += 1;
    if (record.count > MAX_REGISTRATIONS_PER_IP) {
        const retryAfter = Math.ceil((record.firstAttempt + ATTEMPT_WINDOW_MS - now) / 1000);
        res.setHeader('Retry-After', retryAfter.toString());
        res.status(429).json({
            error: 'TOO_MANY_ATTEMPTS',
            message: 'Too many registration attempts from this IP. Please wait before creating more accounts.',
            retryAfter
        });
        return;
    }
    next();
}
/**
 * Validates usernames against injection, control characters, and illegal patterns
 */
function validateUsernameSecurity(username) {
    if (typeof username !== 'string') {
        return { valid: false, error: 'INVALID_INPUT', message: 'Username is required' };
    }
    const trimmed = username.trim().toLowerCase();
    // Length check
    if (trimmed.length < 3 || trimmed.length > 32) {
        return { valid: false, error: 'INVALID_USERNAME', message: 'Username must be between 3 and 32 characters' };
    }
    // Reject email format
    if (trimmed.includes('@') || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return { valid: false, error: 'USERNAME_EMAIL_NOT_ALLOWED', message: 'Username cannot be an email format' };
    }
    // Reject all numeric
    if (/^[\d\u0660-\u0669\u06F0-\u06F9]+$/.test(trimmed)) {
        return { valid: false, error: 'USERNAME_ALL_NUMERIC', message: 'Username cannot be all numbers' };
    }
    // Strict character whitelist: English letters, Persian/Arabic letters, digits, underscore, dot, hyphen
    // Rejects HTML tags, SQL quotes (', ", ;, --), path traversal (/ \), null bytes
    const allowedPattern = /^[a-zA-Z0-9_\-\.\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]+$/;
    if (!allowedPattern.test(trimmed)) {
        return {
            valid: false,
            error: 'INVALID_CHARACTERS',
            message: 'Username contains invalid characters. Only letters, numbers, dot, underscore and hyphen are allowed.'
        };
    }
    return { valid: true };
}
/**
 * Standard Security Headers Middleware
 */
function securityHeadersMiddleware(_req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
    next();
}
/**
 * Helper to clear in-memory rate limiting state (primarily for automated test suites)
 */
function resetSecurityStateForTests() {
    ipFailedAttempts.clear();
    userFailedAttempts.clear();
    ipRegisterAttempts.clear();
}
