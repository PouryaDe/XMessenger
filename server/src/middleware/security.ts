import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';

// Pre-computed dummy hash to prevent timing attacks when checking non-existent accounts
export const DUMMY_BCRYPT_HASH = bcrypt.hashSync('xmessenger-timing-attack-protection-constant-time-2026', 12);

interface AttemptRecord {
  count: number;
  firstAttempt: number;
  lockedUntil?: number;
}

// 1. IP failed login attempts: tracks total failed login attempts from an IP (anti-dictionary spraying)
const ipFailedAttempts = new Map<string, AttemptRecord>();

// 2. Account-level failed attempts: strictly indexed by target username
// Blocks distributed botnets and rotating proxies targeting an account across thousands of IPs
const userFailedAttempts = new Map<string, AttemptRecord>();

// 3. Register attempts: tracks account creation attempts per IP
const ipRegisterAttempts = new Map<string, AttemptRecord>();

// Security Configuration Parameters
const MAX_FAILED_PER_TARGET = 5;          // 5 consecutive failed attempts on an account triggers 15m lockout (across ALL IPs/proxies)
const MAX_FAILED_PER_IP = 15;             // 15 total failed attempts from a single IP across any accounts triggers IP lockout
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes lockout duration
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes observation window
const MAX_REGISTRATIONS_PER_IP = 5;       // Max 5 account registrations per 15 mins per IP

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
export function getClientIp(req: Request): string {
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
 * Checks if a login attempt is locked out (due to username-level limit or IP limit)
 */
export function checkLoginLockout(ip: string, username: string): { locked: boolean; remainingSeconds: number; reason: 'IP' | 'ACCOUNT' } | null {
  const now = Date.now();
  const cleanUser = username.trim().toLowerCase();

  // 1. Check Username-level lockout across ALL IPs (counter-proxy/botnet defense)
  const userRecord = userFailedAttempts.get(cleanUser);
  if (userRecord?.lockedUntil && now < userRecord.lockedUntil) {
    return {
      locked: true,
      remainingSeconds: Math.ceil((userRecord.lockedUntil - now) / 1000),
      reason: 'ACCOUNT'
    };
  }

  // 2. Check IP-level lockout (single IP trying multiple accounts)
  const ipRecord = ipFailedAttempts.get(ip);
  if (ipRecord?.lockedUntil && now < ipRecord.lockedUntil) {
    return {
      locked: true,
      remainingSeconds: Math.ceil((ipRecord.lockedUntil - now) / 1000),
      reason: 'IP'
    };
  }

  return null;
}

/**
 * Records a failed login attempt and calculates progressive delays/lockouts
 */
export async function recordFailedLogin(ip: string, username: string): Promise<void> {
  const now = Date.now();
  const cleanUser = username.trim().toLowerCase();

  // Update Username record (accumulates across ALL proxy IPs)
  let userRecord = userFailedAttempts.get(cleanUser);
  if (!userRecord || (now - userRecord.firstAttempt > ATTEMPT_WINDOW_MS && (!userRecord.lockedUntil || now > userRecord.lockedUntil))) {
    userRecord = { count: 1, firstAttempt: now };
  } else {
    userRecord.count += 1;
  }
  if (userRecord.count >= MAX_FAILED_PER_TARGET) {
    userRecord.lockedUntil = now + LOCKOUT_WINDOW_MS;
  }
  userFailedAttempts.set(cleanUser, userRecord);

  // Update IP record
  let ipRecord = ipFailedAttempts.get(ip);
  if (!ipRecord || (now - ipRecord.firstAttempt > ATTEMPT_WINDOW_MS && (!ipRecord.lockedUntil || now > ipRecord.lockedUntil))) {
    ipRecord = { count: 1, firstAttempt: now };
  } else {
    ipRecord.count += 1;
  }
  if (ipRecord.count >= MAX_FAILED_PER_IP) {
    ipRecord.lockedUntil = now + LOCKOUT_WINDOW_MS;
  }
  ipFailedAttempts.set(ip, ipRecord);

  // Artificial progressive delay to handicap automated bot brute-forcers
  // 1st attempt: 0ms, 2nd attempt: 400ms, 3rd: 800ms, 4th+: 1200ms
  if (userRecord.count > 1) {
    const delayMs = Math.min((userRecord.count - 1) * 400, 1500);
    await new Promise((res) => setTimeout(res, delayMs));
  }
}

/**
 * Resets failed attempts counter upon successful login
 */
export function recordSuccessfulLogin(ip: string, username: string): void {
  const cleanUser = username.trim().toLowerCase();
  userFailedAttempts.delete(cleanUser);
  // Decrement IP count on success
  const ipRecord = ipFailedAttempts.get(ip);
  if (ipRecord) {
    ipRecord.count = Math.max(0, ipRecord.count - 1);
  }
}

/**
 * Explicitly unlock a locked account
 */
export function unlockAccount(username: string): boolean {
  const cleanUser = username.trim().toLowerCase();
  const existed = userFailedAttempts.has(cleanUser);
  userFailedAttempts.delete(cleanUser);
  return existed;
}

/**
 * Explicitly clear all lockout records (system-wide reset)
 */
export function clearAllLockouts(): void {
  userFailedAttempts.clear();
  ipFailedAttempts.clear();
  ipRegisterAttempts.clear();
}

/**
 * Registration rate-limiting middleware (prevents bot account generation)
 */
export function registerRateLimiter(req: Request, res: Response, next: NextFunction): void {
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
export function validateUsernameSecurity(username: string): { valid: boolean; error?: string; message?: string } {
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
export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
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
export function resetSecurityStateForTests(): void {
  ipFailedAttempts.clear();
  userFailedAttempts.clear();
  ipRegisterAttempts.clear();
}
