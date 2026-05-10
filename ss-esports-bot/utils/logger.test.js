'use strict';

/**
 * Property-based and unit tests for utils/logger.js
 * Tests Property 39: Action Log Completeness
 * Validates: Requirements 21.1, 21.2
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { logAction, terminalLog, LOG_LEVELS, ACTION_LOG_CHANNEL_ID } = require('./logger');
const db = require('../database/db');

// ─────────────────────────────────────────────
// Setup: use in-memory DB for tests
// ─────────────────────────────────────────────

before(() => {
  db.initDb(':memory:');
});

after(() => {
  db.closeDb();
});

// ─────────────────────────────────────────────
// Property 39: Action Log Completeness
// Validates: Requirements 21.1, 21.2
// ─────────────────────────────────────────────

describe('Property 39: Action Log Completeness', () => {
  it('should log action to DB with all required fields', async () => {
    const mockClient = {
      channels: {
        fetch: async () => ({
          isTextBased: () => true,
          send: async () => {},
        }),
      },
    };

    const actorId = '111222333444555666';
    const targetId = '777888999000111222';
    const action = 'REGISTRATION_CONFIRMED';
    const description = 'Squad SSE-0001 confirmed';

    await logAction(
      mockClient,
      action,
      { actorId, targetId, description },
      'Admin#0001'
    );

    const logs = db.getRecentLogs(1);
    assert.ok(logs.length > 0, 'Should have at least one log entry');

    const log = logs[0];
    assert.equal(log.action, action, 'Log should contain action type');
    assert.equal(log.actor_id, actorId, 'Log should contain actor ID');
    assert.equal(log.target_id, targetId, 'Log should contain target ID');
    assert.equal(log.details, description, 'Log should contain description');
    assert.ok(log.timestamp, 'Log should contain timestamp');
  });

  it('should include UTC timestamp in log entry', async () => {
    const mockClient = {
      channels: {
        fetch: async () => ({
          isTextBased: () => true,
          send: async () => {},
        }),
      },
    };

    const before = new Date().toISOString();

    await logAction(
      mockClient,
      'TEST_ACTION',
      { actorId: '123', targetId: '456', description: 'Test' },
      'Mod#0001'
    );

    const after = new Date().toISOString();
    const logs = db.getRecentLogs(1);
    const log = logs[0];

    assert.ok(log.timestamp >= before, 'Timestamp should be >= before time');
    assert.ok(log.timestamp <= after, 'Timestamp should be <= after time');
  });

  it('should handle channel post failure gracefully without crashing', async () => {
    const mockClient = {
      channels: {
        fetch: async () => {
          throw new Error('Channel not found');
        },
      },
    };

    // Should not throw
    await assert.doesNotReject(
      () =>
        logAction(
          mockClient,
          'CHANNEL_FAIL_ACTION',
          { actorId: '111', description: 'Test graceful failure' },
          'Admin'
        ),
      'Should not throw when channel post fails'
    );
  });

  it('should still write to DB even if channel post fails', async () => {
    const mockClient = {
      channels: {
        fetch: async () => {
          throw new Error('Channel not found');
        },
      },
    };

    const countBefore = db.getRecentLogs(100).length;

    await logAction(
      mockClient,
      'DB_ONLY_ACTION',
      { actorId: '222', description: 'DB write test' },
      'Admin'
    );

    const countAfter = db.getRecentLogs(100).length;
    assert.equal(countAfter, countBefore + 1, 'Should have added one log entry to DB');
  });

  it('should handle null targetId gracefully', async () => {
    const mockClient = {
      channels: {
        fetch: async () => ({
          isTextBased: () => true,
          send: async () => {},
        }),
      },
    };

    await assert.doesNotReject(
      () =>
        logAction(
          mockClient,
          'NO_TARGET_ACTION',
          { actorId: '333', targetId: null, description: 'No target' },
          'Admin'
        ),
      'Should handle null targetId'
    );

    const logs = db.getRecentLogs(1);
    assert.equal(logs[0].target_id, null, 'Target ID should be null');
  });

  // Property-based: every logAction call creates a DB entry with correct fields
  it('every logAction creates a complete DB entry (10 random cases)', async () => {
    const mockClient = {
      channels: {
        fetch: async () => ({
          isTextBased: () => true,
          send: async () => {},
        }),
      },
    };

    for (let i = 0; i < 10; i++) {
      const action = `ACTION_${i}`;
      const actorId = String(100000000000000000n + BigInt(i));
      const targetId = String(200000000000000000n + BigInt(i));
      const description = `Description for action ${i}`;

      const countBefore = db.getRecentLogs(100).length;

      await logAction(mockClient, action, { actorId, targetId, description }, `Mod${i}`);

      const logs = db.getRecentLogs(100);
      assert.equal(logs.length, countBefore + 1, `Iteration ${i}: should add one log entry`);

      const log = logs[0]; // most recent
      assert.equal(log.action, action, `Iteration ${i}: action should match`);
      assert.equal(log.actor_id, actorId, `Iteration ${i}: actor_id should match`);
      assert.equal(log.target_id, targetId, `Iteration ${i}: target_id should match`);
      assert.equal(log.details, description, `Iteration ${i}: details should match`);
      assert.ok(log.timestamp, `Iteration ${i}: timestamp should be present`);
    }
  });
});

// ─────────────────────────────────────────────
// Unit tests for terminalLog
// ─────────────────────────────────────────────

describe('terminalLog', () => {
  it('should call console.log for INFO level', () => {
    const original = console.log;
    let called = false;
    console.log = () => { called = true; };
    terminalLog(LOG_LEVELS.INFO, 'Test info message');
    console.log = original;
    assert.equal(called, true, 'Should call console.log for INFO');
  });

  it('should call console.warn for WARN level', () => {
    const original = console.warn;
    let called = false;
    console.warn = () => { called = true; };
    terminalLog(LOG_LEVELS.WARN, 'Test warn message');
    console.warn = original;
    assert.equal(called, true, 'Should call console.warn for WARN');
  });

  it('should call console.error for ERROR level', () => {
    const original = console.error;
    let called = false;
    console.error = () => { called = true; };
    terminalLog(LOG_LEVELS.ERROR, 'Test error message');
    console.error = original;
    assert.equal(called, true, 'Should call console.error for ERROR');
  });

  it('ACTION_LOG_CHANNEL_ID should be the correct channel', () => {
    assert.equal(ACTION_LOG_CHANNEL_ID, '1502222823672774706');
  });
});
