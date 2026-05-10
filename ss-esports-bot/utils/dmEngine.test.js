'use strict';

/**
 * Property-based and unit tests for utils/dmEngine.js
 * Tests Property 38: DM Retry Behavior
 * Validates: Requirements 20.2, 20.3
 */

// Set retry delay to 0 for fast tests
process.env.DM_RETRY_DELAY_MS = '0';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { dmUser, MAX_RETRIES } = require('./dmEngine');

// ─────────────────────────────────────────────
// Property 38: DM Retry Behavior
// Validates: Requirements 20.2, 20.3
// ─────────────────────────────────────────────

describe('Property 38: DM Retry Behavior', () => {
  it('should return true when DM succeeds on first attempt', async () => {
    let callCount = 0;
    const mockClient = {
      users: {
        fetch: async (userId) => ({
          send: async () => {
            callCount++;
          },
        }),
      },
    };

    const result = await dmUser('123456789', {}, mockClient);
    assert.equal(result, true, 'Should return true on success');
    assert.equal(callCount, 1, 'Should only call send once');
  });

  it('should retry exactly MAX_RETRIES times on failure', async () => {
    let fetchCallCount = 0;
    const mockClient = {
      users: {
        fetch: async (userId) => {
          fetchCallCount++;
          return {
            send: async () => {
              throw new Error('Cannot send messages to this user');
            },
          };
        },
      },
    };

    // Capture console.error to verify failure is logged
    const originalError = console.error;
    let errorLogged = false;
    console.error = (...args) => {
      errorLogged = true;
    };

    const result = await dmUser('123456789', {}, mockClient);

    console.error = originalError;

    assert.equal(result, false, 'Should return false after all retries fail');
    assert.equal(fetchCallCount, MAX_RETRIES, `Should attempt exactly ${MAX_RETRIES} times`);
    assert.equal(errorLogged, true, 'Should log failure to terminal');
  });

  it('should succeed if DM works on the 2nd attempt', async () => {
    let callCount = 0;
    const mockClient = {
      users: {
        fetch: async (userId) => ({
          send: async () => {
            callCount++;
            if (callCount < 2) {
              throw new Error('Temporary failure');
            }
          },
        }),
      },
    };

    const result = await dmUser('123456789', {}, mockClient);
    assert.equal(result, true, 'Should return true when succeeds on 2nd attempt');
    assert.equal(callCount, 2, 'Should have called send twice');
  });

  it('should succeed if DM works on the 3rd attempt', async () => {
    let callCount = 0;
    const mockClient = {
      users: {
        fetch: async (userId) => ({
          send: async () => {
            callCount++;
            if (callCount < 3) {
              throw new Error('Temporary failure');
            }
          },
        }),
      },
    };

    const result = await dmUser('123456789', {}, mockClient);
    assert.equal(result, true, 'Should return true when succeeds on 3rd attempt');
    assert.equal(callCount, 3, 'Should have called send 3 times');
  });

  it('should log failure to terminal after all retries exhausted', async () => {
    const mockClient = {
      users: {
        fetch: async () => ({
          send: async () => {
            throw new Error('DMs disabled');
          },
        }),
      },
    };

    const originalError = console.error;
    const loggedMessages = [];
    console.error = (...args) => {
      loggedMessages.push(args.join(' '));
    };

    await dmUser('999888777', {}, mockClient);

    console.error = originalError;

    assert.ok(loggedMessages.length > 0, 'Should have logged at least one error');
    assert.ok(
      loggedMessages.some((msg) => msg.includes('999888777')),
      'Error log should include the user ID'
    );
  });

  // Property-based: retry count is always exactly MAX_RETRIES on total failure
  it('retry count is always MAX_RETRIES on total failure (10 random cases)', async () => {
    for (let i = 0; i < 10; i++) {
      let callCount = 0;
      const mockClient = {
        users: {
          fetch: async () => ({
            send: async () => {
              callCount++;
              throw new Error('Always fails');
            },
          }),
        },
      };

      const originalError = console.error;
      console.error = () => {};

      const result = await dmUser(`user${i}`, {}, mockClient);

      console.error = originalError;

      assert.equal(result, false, `Iteration ${i}: should return false`);
      assert.equal(
        callCount,
        MAX_RETRIES,
        `Iteration ${i}: should attempt exactly ${MAX_RETRIES} times`
      );
    }
  });

  it('MAX_RETRIES constant should be 3', () => {
    assert.equal(MAX_RETRIES, 3, 'MAX_RETRIES should be 3 per spec');
  });
});
