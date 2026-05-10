'use strict';

/**
 * Property-based test for squad cancellation consistency
 *
 * Property 7: Squad Cancellation Consistency
 *   Validates: Requirements 1.4, 2.2
 *
 * For any set of active squads, calling POST /api/squads/cancel-squad SHALL:
 *   1. Return HTTP 200
 *   2. Remove the squad from getAllActiveSquads() (or set status to 'cancelled')
 *   3. Emit a 'squad:cancelled' Socket.IO event with the correct squad_id
 */

const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
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
const emitter = require('./emitter');
const { startBridgeServer } = require('./server');

// ─────────────────────────────────────────────
// Property 7: Squad Cancellation Consistency
// Validates: Requirements 1.4, 2.2
// ─────────────────────────────────────────────

describe('Property 7: Squad Cancellation Consistency', () => {
  let httpServer;
  let request;

  // Track emitter.emit calls
  const emittedEvents = [];
  let originalEmit;

  before(async () => {
    // Initialize in-memory DB
    db.initDb(':memory:');

    // Start bridge server with null discordClient and guild
    // Discord calls are skipped when null, so this is safe
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

    // Spy on emitter.emit to capture Socket.IO events
    originalEmit = emitter.emit;
    emitter.emit = function (event, data) {
      emittedEvents.push({ event, data });
      return originalEmit.call(this, event, data);
    };
  });

  after(() => {
    // Restore original emit
    emitter.emit = originalEmit;
    httpServer.close();
    db.closeDb();
  });

  test(
    'property: cancelling active squads returns HTTP 200, removes from active squads, and emits squad:cancelled',
    async () => {
      /**
       * Validates: Requirements 1.4, 2.2
       *
       * For any set of 1-5 randomly generated active squads:
       * - POST /api/squads/cancel-squad returns HTTP 200
       * - The squad is no longer in getAllActiveSquads()
       * - A squad:cancelled event is emitted with the correct squad_id
       */

      // Arbitrary for a single squad_id: 'SSE-' prefix + 4-10 alphanumeric chars
      const squadIdSuffixArb = fc.string({ minLength: 4, maxLength: 10 }).map((s) =>
        // Replace non-alphanumeric chars to keep IDs clean
        s.replace(/[^a-zA-Z0-9]/g, 'x').padEnd(4, '0')
      );

      // Arbitrary for an array of 1-5 unique squad_id suffixes
      const squadIdsArb = fc
        .array(squadIdSuffixArb, { minLength: 1, maxLength: 5 })
        .map((suffixes) => {
          // Deduplicate to avoid constraint violations
          const seen = new Set();
          return suffixes
            .filter((s) => {
              if (seen.has(s)) return false;
              seen.add(s);
              return true;
            })
            .map((suffix) => `SSE-${suffix}`);
        })
        .filter((ids) => ids.length >= 1);

      await fc.assert(
        fc.asyncProperty(squadIdsArb, async (squadIds) => {
          // ── Setup: insert active squads into DB ──────────────────────────
          for (let i = 0; i < squadIds.length; i++) {
            const squadId = squadIds[i];
            db.insertSquad({
              squad_id: squadId,
              squad_no: 1000 + i,
              team_name: `Team-${squadId}`,
              leader_id: `leader-${squadId}`,
              player_ids: [`player1-${squadId}`, `player2-${squadId}`],
              player_uids: {},
              group_no: null,
              registration_msg_id: null,
              registration_channel_id: null,
              confirmed_msg_id: null,
              group_msg_id: null,
              registered_at: new Date().toISOString(),
              status: 'active',
              winner_position: null,
            });
          }

          // ── Exercise: cancel each squad via the API ──────────────────────
          for (const squadId of squadIds) {
            // Reset spy before each cancel call
            emittedEvents.length = 0;

            const response = await request
              .post('/api/squads/cancel-squad')
              .set('Authorization', 'Bearer test-secret-key')
              .send({ squad_id: squadId });

            // Assert 1: HTTP 200
            assert.equal(
              response.status,
              200,
              `Expected HTTP 200 for cancel-squad ${squadId}, got ${response.status}: ${JSON.stringify(response.body)}`
            );

            assert.equal(
              response.body.success,
              true,
              `Expected success: true for cancel-squad ${squadId}, got: ${JSON.stringify(response.body)}`
            );

            // Assert 2: Squad is no longer in getAllActiveSquads()
            const activeSquads = db.getAllActiveSquads();
            const stillActive = activeSquads.some((s) => s.squad_id === squadId);
            assert.equal(
              stillActive,
              false,
              `Expected squad ${squadId} to be removed from active squads after cancellation`
            );

            // Also verify the squad's status is 'cancelled' in the DB
            const cancelledSquad = db.getSquadById(squadId);
            assert.equal(
              cancelledSquad.status,
              'cancelled',
              `Expected squad ${squadId} status to be 'cancelled', got '${cancelledSquad.status}'`
            );

            // Assert 3: squad:cancelled event was emitted with correct squad_id
            const cancelledEvent = emittedEvents.find(
              (e) => e.event === 'squad:cancelled' && e.data && e.data.squad_id === squadId
            );
            assert.ok(
              cancelledEvent !== undefined,
              `Expected 'squad:cancelled' event with squad_id='${squadId}' to be emitted, but got: ${JSON.stringify(emittedEvents)}`
            );
          }

          // ── Teardown: clean up inserted squads ───────────────────────────
          for (const squadId of squadIds) {
            db.getDb().prepare('DELETE FROM squads WHERE squad_id = ?').run(squadId);
          }
        }),
        { numRuns: 100 }
      );
    }
  );
});
