import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  getClientIp,
  checkLoginLockout,
  recordFailedLogin,
  recordSuccessfulLogin,
  validateUsernameSecurity,
  resetSecurityStateForTests,
  securityHeadersMiddleware,
  DUMMY_BCRYPT_HASH
} from '../src/middleware/security.js';
import bcrypt from 'bcryptjs';

describe('Security, Anti-Bot & Injection Prevention Tests', () => {
  beforeEach(() => {
    resetSecurityStateForTests();
  });

  describe('1. Username Security & Injection Filter', () => {
    it('rejects classic SQL injection payloads', () => {
      const sqlInjections = [
        "admin' OR '1'='1",
        "admin' --",
        "user; DROP TABLE users;",
        "' UNION SELECT * FROM users --",
        "admin'/*",
        "admin' OR 1=1#"
      ];

      for (const payload of sqlInjections) {
        const result = validateUsernameSecurity(payload);
        assert.strictEqual(result.valid, false, `Expected SQL payload "${payload}" to be rejected`);
      }
    });

    it('rejects XSS and HTML tags', () => {
      const xssPayloads = [
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        '"><svg onload=alert(1)>',
        'admin<iframe src=evil.com>'
      ];

      for (const payload of xssPayloads) {
        const result = validateUsernameSecurity(payload);
        assert.strictEqual(result.valid, false, `Expected XSS payload "${payload}" to be rejected`);
      }
    });

    it('rejects path traversal, null bytes, and control characters', () => {
      const dangerousInputs = [
        '../../etc/passwd',
        '..\\..\\windows\\system32',
        'admin\0',
        'user\nname',
        'user\r\nadmin',
        'admin\tpass',
        'admin%20test',
        'admin;cmd'
      ];

      for (const input of dangerousInputs) {
        const result = validateUsernameSecurity(input);
        assert.strictEqual(result.valid, false, `Expected dangerous input "${input}" to be rejected`);
      }
    });

    it('rejects emails, purely numeric, and out-of-range usernames', () => {
      assert.strictEqual(validateUsernameSecurity('admin@domain.com').valid, false);
      assert.strictEqual(validateUsernameSecurity('1234567').valid, false);
      assert.strictEqual(validateUsernameSecurity('۱۲۳۴۵۶').valid, false);
      assert.strictEqual(validateUsernameSecurity('ab').valid, false); // too short
      assert.strictEqual(validateUsernameSecurity('a'.repeat(33)).valid, false); // too long
    });

    it('accepts clean usernames, English and Persian/Arabic letters, dots, hyphens, and underscores', () => {
      const validUsernames = [
        'admin',
        'john_doe',
        'alice.smith',
        'user-123',
        'پوریا_دهقان',
        'کاربر.سامانه',
        'مشتری-ویژه'
      ];

      for (const username of validUsernames) {
        const result = validateUsernameSecurity(username);
        assert.strictEqual(result.valid, true, `Expected valid username "${username}" to pass validation`);
      }
    });
  });

  describe('2. Anti-Bot Brute Force & Account Lockout Defense', () => {
    it('locks out target account after 5 consecutive failed attempts from an IP', async () => {
      const attackerIp = '198.51.100.42';
      const targetUser = 'admin';

      // Attempts 1 to 4 should NOT lock out
      for (let i = 1; i <= 4; i++) {
        assert.strictEqual(checkLoginLockout(attackerIp, targetUser), null);
        await recordFailedLogin(attackerIp, targetUser);
      }

      // 4 failed attempts recorded, still not locked
      assert.strictEqual(checkLoginLockout(attackerIp, targetUser), null);

      // 5th failed attempt
      await recordFailedLogin(attackerIp, targetUser);

      // Now it must be locked!
      const lockout = checkLoginLockout(attackerIp, targetUser);
      assert.notStrictEqual(lockout, null);
      assert.strictEqual(lockout?.locked, true);
      assert.strictEqual(lockout?.reason, 'ACCOUNT');
      assert.ok(lockout.remainingSeconds > 800 && lockout.remainingSeconds <= 900);
    });

    it('prevents Denial-of-Service against the admin: attacker IP lockout does not lock legitimate admin IP', async () => {
      const attackerIp = '203.0.113.88';
      const legitimateAdminIp = '79.175.133.95';
      const targetUser = 'admin';

      // Attacker tries 5 wrong passwords for admin
      for (let i = 0; i < 5; i++) {
        await recordFailedLogin(attackerIp, targetUser);
      }

      // Attacker IP is locked out
      const attackerCheck = checkLoginLockout(attackerIp, targetUser);
      assert.strictEqual(attackerCheck?.locked, true);

      // Legitimate Admin from their own IP is NOT locked out!
      const adminCheck = checkLoginLockout(legitimateAdminIp, targetUser);
      assert.strictEqual(adminCheck, null, 'Real admin IP must not be locked out by attacker IP attempts');
    });

    it('clears failed attempts counter upon successful login', async () => {
      const ip = '192.168.1.100';
      const user = 'john_doe';

      // 3 failed attempts
      await recordFailedLogin(ip, user);
      await recordFailedLogin(ip, user);
      await recordFailedLogin(ip, user);

      // Legitimate user enters correct password
      recordSuccessfulLogin(ip, user);

      // 2 more failed attempts should not trigger lockout because counter was reset
      await recordFailedLogin(ip, user);
      await recordFailedLogin(ip, user);
      assert.strictEqual(checkLoginLockout(ip, user), null);
    });

    it('locks an entire IP after 15 total failed attempts across various usernames (dictionary spraying attack)', async () => {
      const botIp = '185.220.101.5';

      // Spray across 15 different usernames (1 attempt each)
      for (let i = 1; i <= 14; i++) {
        await recordFailedLogin(botIp, `user_${i}`);
        assert.strictEqual(checkLoginLockout(botIp, `user_${i}`)?.reason, undefined);
      }

      // 15th failed attempt
      await recordFailedLogin(botIp, 'user_15');

      // IP is now locked out across any username
      const ipLock = checkLoginLockout(botIp, 'any_random_user');
      assert.notStrictEqual(ipLock, null);
      assert.strictEqual(ipLock?.locked, true);
      assert.strictEqual(ipLock?.reason, 'IP');
    });
  });

  describe('3. Timing Attack Mitigation & Security Headers', () => {
    it('verifies constant-time DUMMY_BCRYPT_HASH is valid bcrypt format', async () => {
      assert.ok(DUMMY_BCRYPT_HASH.startsWith('$2'));
      const matches = await bcrypt.compare('dummy-mismatched-password', DUMMY_BCRYPT_HASH);
      assert.strictEqual(matches, false);
    });

    it('sets standard defensive HTTP security headers', () => {
      const headers: Record<string, string> = {};
      const mockRes: any = {
        setHeader: (name: string, val: string) => {
          headers[name] = val;
        }
      };
      let nextCalled = false;

      securityHeadersMiddleware({} as any, mockRes, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(headers['X-Content-Type-Options'], 'nosniff');
      assert.strictEqual(headers['X-Frame-Options'], 'SAMEORIGIN');
      assert.strictEqual(headers['X-XSS-Protection'], '1; mode=block');
      assert.strictEqual(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
      assert.ok(headers['Permissions-Policy'].includes('geolocation=()'));
    });

    it('correctly extracts client IP from X-Forwarded-For when behind reverse proxies', () => {
      const reqWithMultipleIps: any = {
        headers: { 'x-forwarded-for': '203.0.113.195, 172.18.0.2' },
        ip: '172.18.0.2',
        socket: { remoteAddress: '172.18.0.2' }
      };
      assert.strictEqual(getClientIp(reqWithMultipleIps), '203.0.113.195');

      const reqWithSingleIp: any = {
        headers: { 'x-real-ip': '198.51.100.7' },
        socket: { remoteAddress: '172.18.0.2' }
      };
      assert.strictEqual(getClientIp(reqWithSingleIp), '198.51.100.7');
    });
  });
});
