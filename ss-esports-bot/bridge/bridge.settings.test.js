'use strict';

/**
 * Property-based test for settings validation
 *
 * Property 11: Settings Validation — max_slots
 *   Validates: Requirements 16.3, 16.4
 *
 * For any POST /api/update-settings request with a non-positive-integer
 * max_slots value (negative integers, zero, non-integer floats, non-numeric
 * strings), the Bridge Server SHALL always return HTTP 400 with
 * { success: false, error: string }.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const supertest = require('supertest');

// Set DASHBOARD_API_KEY before requiring server.js so apiKeyAuth is active
process.env.DASHBOARD_API_KEY = 'test-secret-key';
// Use port 0 so the OS assigns a random available port
process.env.BRIDGE_PORT = '0';
// Use in-memory DB so the test is self-contained
process.env.DB_PATH = ':memory:';

const db = require('../database/db');
const { startBridgeServer } = require('./server');

// ─────────────────────────────────────────────
// Property 11: Settings Validation — max_slots
// Validates: Requirements 16.3, 16.4
// ─────────────────────────────────────────────

describe('Property 11: Settings Validation — max_slots', () => {
  let httpServer;
  let request;

  before(async () => {
    // Initialize in-memory DB
    db.initDb(':memory:');

    // Start bridge server with null discordClient and guild
    // Auth check and validation happen before any Discord calls, so null is safe here
    const result = startBridgeServer(null, null);
    httpServer = result.httpServer;

    // Wait for the server to start listening
    await new Promise((resolve) => {
      if (httpServer.listening) {
        resolve();
      } else {
        httpServer.once('listening', resolve);
      }
    });

    request = supertest(httpServer);
  });

  after(() => {
    httpServer.close();
    db.closeDb();
  });

  test(
    'property: non-positive-integer max_slots values always return HTTP 400',
    async () => {
      // Generators for invalid max_slots values:
      // - Negative integers
      // - Zero
      // - Non-integer floats (between 0.1 and 1000, excluding whole numbers)
      // - Non-numeric strings (NaN when parsed, or empty/whitespace)
      const invalidMaxSlotsArb = fc.oneof(
        fc.integer({ max: -1 }),
        fc.constant(0),
        fc
          .float({ min: Math.fround(0.1), max: Math.fround(1000), noNaN: true })
          .filter((n) => !Number.isInteger(n)),
        fc.string().filter((s) => isNaN(Number(s)) || s.trim() === '')
      );

      await fc.assert(
        fc.asyncProperty(invalidMaxSlotsArb, async (invalidValue) => {
          const response = await request
            .post('/api/update-settings')
            .set('Authorization', 'Bearer test-secret-key')
            .send({ max_slots: invalidValue });

          assert.equal(
            response.status,
            400,
            `Expected 400 for max_slots=${JSON.stringify(invalidValue)}, got ${response.status}`
          );
          assert.equal(
            response.body.success,
            false,
            `Expected success=false for max_slots=${JSON.stringify(invalidValue)}`
          );
          assert.equal(
            typeof response.body.error,
            'string',
            `Expected error to be a string for max_slots=${JSON.stringify(invalidValue)}`
          );
        }),
        { numRuns: 100 }
      );
    }
  );
});
