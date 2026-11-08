import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Unit logic for isSameDay
function isSameDay(d1: Date | string, d2: Date | string): boolean {
  try {
    const date1 = typeof d1 === 'string' ? new Date(d1) : d1;
    const date2 = typeof d2 === 'string' ? new Date(d2) : d2;
    if (isNaN(date1.getTime()) || isNaN(date2.getTime())) return false;
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  } catch {
    return false;
  }
}

// Unit logic for chatStore haveMessagesChanged
function haveMessagesChanged(prev: any[], next: any[]): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    const p = prev[i];
    const n = next[i];
    if (
      !p || !n ||
      p.id !== n.id ||
      p.text !== n.text ||
      p.isRead !== n.isRead ||
      p.expiresAt !== n.expiresAt
    ) {
      return true;
    }
  }
  return false;
}

describe('Date Separator & Chat Scroll Diffing Tests', () => {
  it('correctly identifies identical calendar days', () => {
    const time1 = '2026-11-04T08:30:00.000Z';
    const time2 = '2026-11-04T18:45:00.000Z';
    assert.strictEqual(isSameDay(time1, time2), true);
  });

  it('correctly distinguishes different calendar days', () => {
    const time1 = '2026-11-04T12:00:00.000Z';
    const time2 = '2026-11-05T12:00:00.000Z';
    assert.strictEqual(isSameDay(time1, time2), false);
  });

  it('handles invalid or malformed dates gracefully without throwing', () => {
    assert.strictEqual(isSameDay('invalid-date', '2026-11-04T12:00:00Z'), false);
    assert.strictEqual(isSameDay('', ''), false);
    assert.strictEqual(isSameDay(new Date('invalid'), new Date()), false);
  });

  it('detects no change for identical message lists (prevents periodic scroll bounce)', () => {
    const listA = [
      { id: '1', text: 'Hello', isRead: true, expiresAt: '2026-11-08T12:00:00Z' },
      { id: '2', text: 'World', isRead: false, expiresAt: '2026-11-08T12:05:00Z' }
    ];
    const listB = [
      { id: '1', text: 'Hello', isRead: true, expiresAt: '2026-11-08T12:00:00Z' },
      { id: '2', text: 'World', isRead: false, expiresAt: '2026-11-08T12:05:00Z' }
    ];

    assert.strictEqual(haveMessagesChanged(listA, listB), false);
  });

  it('detects changes when a new message arrives, is read, or deleted', () => {
    const base = [
      { id: '1', text: 'Hello', isRead: false, expiresAt: '2026-11-08T12:00:00Z' }
    ];

    // Read status changed
    const markedRead = [
      { id: '1', text: 'Hello', isRead: true, expiresAt: '2026-11-08T12:00:00Z' }
    ];
    assert.strictEqual(haveMessagesChanged(base, markedRead), true);

    // New message added
    const withNewMsg = [
      { id: '1', text: 'Hello', isRead: false, expiresAt: '2026-11-08T12:00:00Z' },
      { id: '2', text: 'New', isRead: false, expiresAt: '2026-11-08T12:10:00Z' }
    ];
    assert.strictEqual(haveMessagesChanged(base, withNewMsg), true);

    // Message deleted (empty)
    assert.strictEqual(haveMessagesChanged(base, []), true);
  });
});
