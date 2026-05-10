'use strict';

/**
 * Property-based test for non-existent resource rejection
 *
 * Property 6: Non-Existent Resource Rejection
 *   Validates: Requirements 1.15
 *
 * For any POST endpoint that operates on a squad_id or discord_id,
 * a request referencing an ID that does not exist in the DB SHALL
 * always receive HTTP 404.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const supertest = require('supertest');

// Set DASHBOARD_API_KEY before requiring server.js so apiKeyAuth is active
process.env.DASHBOARD_API_KEY = 'test-secret-key';
// Use port 0 so the OS assigns a random available port
process.env.BRIDGE_PORT = '0';
// Use in-memory DB so the test is self-contained (empty — no squads or players)
process.env.DB_PATH = ':memory:';

const db = require('../database/db');
const { startBridgeServer } = require('./server');

// ─────────────────────────────────────────────
// Property 6: Non-Existent Resource Rejection
// Validates: Requirements 1.15
// ─────────────────────────────────────────────

describe('Property 6: Non-Existent Resource Rejection', () => {
  let httpServer;
  let request;

  before(async () => {
    // Initialize in-memory DB (empty — no squads or players inserted)
    db.initDb(':memory:');

    // Start bridge server with null discordClient and guild
    // 404 check happens before any Discord calls, so null is safe here
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

  // Generator for random IDs that won't exist in the empty in-memory DB
  const randomIdArb = fc.string({ minLength: 1, maxLength: 20 });

  test(
    'property: POST /api/squads/cancel-squad with non-existent squad_id returns HTTP 404',
    async () => {
      await fc.assert(
        fc.asyncProperty(randomIdArb, async (randomId) => {
          const response = await request
            .post('/api/squads/cancel-squad')
            .set('Authorization', 'Bearer test-secret-key')
            .send({ squad_id: randomId });

          assert.equal(
            response.status,
            404,
            `Expected 404 for /api/squads/cancel-squad with squad_id="${randomId}", got ${response.status}`
          );
        }),
        { numRuns: 50 }
      );
    }
  );

  test(
    'property: POST /api/squads/edit-squad with non-existent squad_id returns HTTP 404',
    async () => {
      await fc.assert(
        fc.asyncProperty(randomIdArb, async (randomId) => {
          const response = await request
            .post('/api/squads/edit-squad')
            .set('Authorization', 'Bearer test-secret-key')
            .send({ squad_id: randomId, team_name: 'Test' });

          assert.equal(
            response.status,
            404,
            `Expected 404 for /api/squads/edit-squad with squad_id="${randomId}", got ${response.status}`
          );
        }),
        { numRuns: 50 }
      );
    }
  );

  test(
    'property: POST /api/declare-winner with non-existent squad_id returns HTTP 404',
    async () => {
      await fc.assert(
        fc.asyncProperty(randomIdArb, async (randomId) => {
          const response = await request
            .post('/api/declare-winner')
            .set('Authorization', 'Bearer test-secret-key')
            .send({ squad_id: randomId, position: 1 });

          assert.equal(
            response.status,
            404,
            `Expected 404 for /api/declare-winner with squad_id="${randomId}", got ${response.status}`
          );
        }),
        { numRuns: 50 }
      );
    }
  );

  test(
    'property: POST /api/warn-player with non-existent discord_id returns HTTP 404',
    async () => {
      await fc.assert(
        fc.asyncProperty(randomIdArb, async (randomId) => {
          const response = await request
            .post('/api/warn-player')
            .set('Authorization', 'Bearer test-secret-key')
            .send({ discord_id: randomId, reason: 'test' });

          assert.equal(
            response.status,
            404,
            `Expected 404 for /api/warn-player with discord_id="${randomId}", got ${response.status}`
          );
        }),
        { numRuns: 50 }
      );
    }
  );

  test(
    'property: POST /api/mute-player with non-existent discord_id returns HTTP 404',
    async () => {
      await fc.assert(
        fc.asyncProperty(randomIdArb, async (randomId) => {
          const response = await request
            .post('/api/mute-player')
            .set('Authorization', 'Bearer test-secret-key')
            .send({ discord_id: randomId });

          assert.equal(
            response.status,
            404,
            `Expected 404 for /api/mute-player with discord_id="${randomId}", got ${response.status}`
          );
        }),
        { numRuns: 50 }
      );
    }
  );

  test(
    'property: POST /api/unmute-player with non-existent discord_id returns HTTP 404',
    async () => {
      await fc.assert(
        fc.asyncProperty(randomIdArb, async (randomId) => {
          const response = await request
            .post('/api/unmute-player')
            .set('Authorization', 'Bearer test-secret-key')
            .send({ discord_id: randomId });

          assert.equal(
            response.status,
            404,
            `Expected 404 for /api/unmute-player with discord_id="${randomId}", got ${response.status}`
          );
        }),
        { numRuns: 50 }
      );
    }
  );
});
