'use strict';

/**
 * Property test for GET endpoint response envelope
 *
 * Property 10: GET Endpoint Response Envelope
 *   Validates: Requirements 14.1, 14.3
 *
 * For every GET endpoint on the Bridge Server, the response SHALL always
 * return HTTP 200 with a JSON body of { success: true, data: <defined and not null> }.
 * GET endpoints do not require auth (apiKeyAuth middleware skips GET requests).
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

// All GET endpoints exposed by the bridge server
const GET_ENDPOINTS = [
  '/api/squads',
  '/api/groups',
  '/api/matches',
  '/api/scores',
  '/api/logs',
  '/api/settings',
];

// ─────────────────────────────────────────────
// Property 10: GET Endpoint Response Envelope
// Validates: Requirements 14.1, 14.3
// ─────────────────────────────────────────────

describe('Property 10: GET Endpoint Response Envelope', () => {
  let httpServer;
  let request;

  before(async () => {
    // Initialize in-memory DB
    db.initDb(':memory:');

    // Start bridge server with null discordClient and guild
    // GET endpoints don't call Discord, so null is safe here
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
    'property: every GET endpoint returns HTTP 200 with { success: true, data: defined and not null }',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...GET_ENDPOINTS),
          async (endpoint) => {
            const response = await request.get(endpoint);

            assert.equal(
              response.status,
              200,
              `Expected HTTP 200 for GET ${endpoint}, got ${response.status}`
            );

            const body = response.body;

            assert.equal(
              body.success,
              true,
              `Expected success: true for GET ${endpoint}, got success: ${body.success}`
            );

            assert.notEqual(
              body.data,
              undefined,
              `Expected data to be defined for GET ${endpoint}`
            );

            assert.notEqual(
              body.data,
              null,
              `Expected data to be non-null for GET ${endpoint}`
            );
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});
