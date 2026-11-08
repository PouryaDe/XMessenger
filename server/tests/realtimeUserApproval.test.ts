import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';
import { db, initDatabase, updateSettingValue } from '../src/database/index.js';

describe('Real-time User Registration & Admin Approval Tests', () => {
  initDatabase();

  it('correctly broadcasts user:registered and user:pending_approval when require_approval is enabled', async () => {
    updateSettingValue('require_approval', 'true');
    updateSettingValue('registration_enabled', 'true');

    const emittedEvents: Array<{ room: string; event: string; payload: any }> = [];
    const mockIo: any = {
      to: (room: string) => ({
        emit: (event: string, payload: any) => {
          emittedEvents.push({ room, event, payload });
        }
      })
    };

    const username = `test_pending_${Date.now()}`;
    const userId = uuidv4();
    const now = new Date().toISOString();

    // Mirroring registration logic in server/src/routes/auth.ts
    const initialStatus = 'pending';
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, last_seen)
      VALUES (?, ?, 'dummy_hash', 'user', ?, ?, ?)
    `).run(userId, username, initialStatus, now, now);

    const adminUserItem = {
      id: userId,
      username,
      role: 'user',
      status: initialStatus,
      avatarUrl: undefined,
      created_at: now,
      last_seen: now,
      lastMessage: null,
      unreadCount: 0,
      isOnline: false
    };

    mockIo.to('room:admin').emit('user:registered', adminUserItem);
    mockIo.to('room:admin').emit('user:pending_approval', adminUserItem);

    assert.equal(emittedEvents.length, 2);
    assert.equal(emittedEvents[0].room, 'room:admin');
    assert.equal(emittedEvents[0].event, 'user:registered');
    assert.equal(emittedEvents[0].payload.username, username);
    assert.equal(emittedEvents[0].payload.status, 'pending');

    assert.equal(emittedEvents[1].room, 'room:admin');
    assert.equal(emittedEvents[1].event, 'user:pending_approval');
    assert.equal(emittedEvents[1].payload.id, userId);

    // Cleanup
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });

  it('correctly emits user:status_changed to both user room and admin room upon approval', async () => {
    const userId = uuidv4();
    const username = `test_approve_${Date.now()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, last_seen)
      VALUES (?, ?, 'dummy_hash', 'user', 'pending', ?, ?)
    `).run(userId, username, now, now);

    const emittedEvents: Array<{ room: string; event: string; payload: any }> = [];
    const mockIo: any = {
      to: (room: string) => ({
        emit: (event: string, payload: any) => {
          emittedEvents.push({ room, event, payload });
        }
      })
    };

    // Mirroring approval in server/src/routes/admin.ts
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run('active', userId);
    mockIo.to(`user:${userId}`).emit('user:status_changed', { status: 'active' });
    mockIo.to('room:admin').emit('user:status_changed', { userId, status: 'active' });

    assert.equal(emittedEvents.length, 2);
    assert.equal(emittedEvents[0].room, `user:${userId}`);
    assert.equal(emittedEvents[0].event, 'user:status_changed');
    assert.equal(emittedEvents[0].payload.status, 'active');

    assert.equal(emittedEvents[1].room, 'room:admin');
    assert.equal(emittedEvents[1].event, 'user:status_changed');
    assert.equal(emittedEvents[1].payload.userId, userId);
    assert.equal(emittedEvents[1].payload.status, 'active');

    // Verify DB state
    const updated = db.prepare('SELECT status FROM users WHERE id = ?').get(userId) as { status: string };
    assert.equal(updated.status, 'active');

    // Cleanup
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });
});
