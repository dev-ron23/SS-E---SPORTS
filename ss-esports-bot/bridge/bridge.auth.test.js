'use strict';

/**
 * Property-based test for auth isolation
 *
 * Property 4: Auth Isolation — Unauthorized Requests Rejected
 *   Validates: Requirements 1.16, 17.1, 17.2
 *
 * For any POST endpoint on the Bridge Server, a request with a missing,
 * empty, or incorrect Authorization header SHALL always receive HTTP 401.
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

// All POST endpoints exposed by the bridge server
const POST_ENDPOINTS = [
  '/api/cancel-squad',
  '/api/edit-squad',
  '/api/assign-match',
  '/api/start-match',
  '/api/declare-winner',
  '/api/update-score',
  '/api/warn-player',
  '/api/mute-player',
  '/api/unmute-player',
  '/api/broadcast',
  '/api/clear-reg-chat',
  '/api/lock-registration',
  '/api/unlock-registration',
  '/api/update-settings',
];

// ─────────────────────────────────────────────
// Property 4: Auth Isolation — Unauthorized Requests Rejected
// Validates: Requirements 1.16, 17.1, 17.2
// ─────────────────────────────────────────────

describe('Property 4: Auth Isolation — Unauthorized Requests Rejected', () => {
  let httpServer;
  let request;

  before(async () => {
    // Initialize in-memory DB
    db.initDb(':memory:');

    // Start bridge server with null discordClient and guild
    // Auth check happens before any Discord calls, so null is safe here
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
    'property: any invalid auth header on any POST endpoint returns HTTP 401',
    async () => {
      // Generator for invalid auth headers:
      // - empty string (missing header)
      // - 'Bearer wrong-key' (wrong key)
      // - arbitrary strings (random invalid values)
      const invalidAuthArb = fc.oneof(
        fc.constant(''),
        fc.constant('Bearer wrong-key'),
        fc.string()
      );

      await fc.assert(
        fc.asyncProperty(
          invalidAuthArb,
          fc.constantFrom(...POST_ENDPOINTS),
          async (invalidAuth, endpoint) => {
            const req = request.post(endpoint).send({});

            // Only set the Authorization header if the value is non-empty
            // An empty string simulates a missing/absent header
            if (invalidAuth !== '') {
              req.set('Authorization', invalidAuth);
            }

            const response = await req;

            assert.equal(
              response.status,
              401,
              `Expected 401 for endpoint ${endpoint} with auth header "${invalidAuth}", got ${response.status}`
            );
          }
        ),
        { numRuns: 50 }
      );
    }
  );
});
