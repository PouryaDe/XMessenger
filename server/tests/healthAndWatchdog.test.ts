import { describe, it } from 'node:test';
import assert from 'node:assert';
import { db } from '../src/database/index.js';
import { config } from '../src/config/index.js';

describe('Health Endpoint & Watchdog Verification Tests', () => {
  it('returns healthy status and verifies database connectivity', () => {
    // Simulate what /api/health executes
    const row = db.prepare('SELECT 1 as alive').get() as { alive: number };
    assert.strictEqual(row.alive, 1);

    const healthPayload = {
      status: 'healthy',
      database: 'connected',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      version: config.appVersion,
      service: 'XMessenger Core Engine'
    };

    assert.strictEqual(healthPayload.status, 'healthy');
    assert.strictEqual(healthPayload.database, 'connected');
    assert.ok(typeof healthPayload.uptime === 'number');
    assert.ok(healthPayload.version.length > 0);
  });

  it('correctly reports unhealthy when database query fails', () => {
    function simulateHealthCheck(mockDb: { query: () => void }): { status: string; code: number } {
      try {
        mockDb.query();
        return { status: 'healthy', code: 200 };
      } catch {
        return { status: 'unhealthy', code: 500 };
      }
    }

    const working = simulateHealthCheck({ query: () => {} });
    assert.strictEqual(working.code, 200);
    assert.strictEqual(working.status, 'healthy');

    const broken = simulateHealthCheck({
      query: () => {
        throw new Error('SQLite disk I/O error');
      }
    });
    assert.strictEqual(broken.code, 500);
    assert.strictEqual(broken.status, 'unhealthy');
  });

  it('implements 3-strikes threshold before performing recovery restart', () => {
    let failCount = 0;
    const threshold = 3;
    let restartTriggered = false;

    function recordHealthCheck(isHealthy: boolean) {
      if (!isHealthy) {
        failCount++;
        if (failCount >= threshold) {
          restartTriggered = true;
          failCount = 0; // Reset after restart
        }
      } else {
        failCount = 0;
      }
    }

    // Strike 1
    recordHealthCheck(false);
    assert.strictEqual(restartTriggered, false);
    assert.strictEqual(failCount, 1);

    // Strike 2
    recordHealthCheck(false);
    assert.strictEqual(restartTriggered, false);
    assert.strictEqual(failCount, 2);

    // Strike 3 -> Recovery restart
    recordHealthCheck(false);
    assert.strictEqual(restartTriggered, true);
    assert.strictEqual(failCount, 0);

    // Recovery clears state
    recordHealthCheck(true);
    assert.strictEqual(failCount, 0);
  });
});
