'use strict';

/**
 * Property-based test for squad edit persistence
 *
 * Property 8: Squad Edit Persistence
 *   Validates: Requirements 1.5, 2.3
 *
 * For any squad, calling POST /api/squads/edit-squad with random valid update fields SHALL:
 *   1. Return HTTP 200 with { success: true, data: updatedSquad }
 *   2. The DB record reflects exactly the provided updates (other fields unchanged)
 *   3. A 'squad:updated' Socket.IO event was emitted with the updated squad object
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
const emitter = require('./emitter');
const { startBridgeServer } = require('./server');

// ─────────────────────────────────────────────
// Property 8: Squad Edit Persistence
// Validates: Requirements 1.5, 2.3
// ─────────────────────────────────────────────

describe('Property 8: Squad Edit Persistence', () => {
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
    'property: editing a squad returns HTTP 200, persists updates to DB, and emits squad:updated',
    async () => {
      /**
       * Validates: Requirements 1.5, 2.3
       *
       * For any randomly generated squad with random valid update fields:
       * - POST /api/squads/edit-squad returns HTTP 200 with { success: true, data: updatedSquad }
       * - The DB record reflects exactly the provided updates (other fields unchanged)
       * - A squad:updated event is emitted with the updated squad object
       */

      // Arbitrary for a squad suffix (4-10 alphanumeric chars)
      const squadIdSuffixArb = fc
        .string({ minLength: 4, maxLength: 10 })
        .map((s) => s.replace(/[^a-zA-Z0-9]/g, 'x').padEnd(4, '0'));

      // Arbitrary for a full squad_id
      const squadIdArb = squadIdSuffixArb.map((suffix) => `SSE-${suffix}`);

      // Arbitrary for team_name and leader_id
      const nameArb = fc.string({ minLength: 1, maxLength: 20 });
      const leaderArb = fc.string({ minLength: 1, maxLength: 20 });
      const playerIdsArb = fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
        minLength: 1,
        maxLength: 5,
      });

      // Arbitrary for update fields — at least one must be present
      // Use fc.record with requiredKeys to ensure at least one field is present
      const updatesArb = fc
        .record(
          {
            team_name: nameArb,
            leader_id: leaderArb,
            player_ids: playerIdsArb,
          },
          { requiredKeys: [] }
        )
        .filter(
          (updates) =>
            updates.team_name !== undefined ||
            updates.leader_id !== undefined ||
            updates.player_ids !== undefined
        );

      await fc.assert(
        fc.asyncProperty(squadIdArb, updatesArb, async (squadId, updates) => {
          // ── Setup: insert a squad into DB ────────────────────────────────
          const originalSquad = {
            squad_id: squadId,
            squad_no: 2000,
            team_name: `OriginalTeam-${squadId}`,
            leader_id: `original-leader-${squadId}`,
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
          };
          db.insertSquad(originalSquad);

          // Reset spy before each edit call
          emittedEvents.length = 0;

          // ── Exercise: call POST /api/squads/edit-squad ───────────────────
          const response = await request
            .post('/api/squads/edit-squad')
            .set('Authorization', 'Bearer test-secret-key')
            .send({ squad_id: squadId, ...updates });

          // ── Assert 1: HTTP 200 with { success: true, data: updatedSquad } ─
          assert.equal(
            response.status,
            200,
            `Expected HTTP 200 for edit-squad ${squadId}, got ${response.status}: ${JSON.stringify(response.body)}`
          );
          assert.equal(
            response.body.success,
            true,
            `Expected success: true for edit-squad ${squadId}, got: ${JSON.stringify(response.body)}`
          );
          assert.ok(
            response.body.data !== undefined && response.body.data !== null,
            `Expected response.body.data to be defined, got: ${JSON.stringify(response.body)}`
          );

          // ── Assert 2: DB record reflects exactly the provided updates ────
          const dbSquad = db.getSquadById(squadId);
          assert.ok(dbSquad !== null, `Expected squad ${squadId} to exist in DB after edit`);

          if (updates.team_name !== undefined) {
            assert.equal(
              dbSquad.team_name,
              updates.team_name,
              `Expected team_name to be '${updates.team_name}', got '${dbSquad.team_name}'`
            );
          } else {
            // Unchanged field should remain as original
            assert.equal(
              dbSquad.team_name,
              originalSquad.team_name,
              `Expected team_name to remain '${originalSquad.team_name}', got '${dbSquad.team_name}'`
            );
          }

          if (updates.leader_id !== undefined) {
            assert.equal(
              dbSquad.leader_id,
              updates.leader_id,
              `Expected leader_id to be '${updates.leader_id}', got '${dbSquad.leader_id}'`
            );
          } else {
            assert.equal(
              dbSquad.leader_id,
              originalSquad.leader_id,
              `Expected leader_id to remain '${originalSquad.leader_id}', got '${dbSquad.leader_id}'`
            );
          }

          if (updates.player_ids !== undefined) {
            assert.deepEqual(
              dbSquad.player_ids,
              updates.player_ids,
              `Expected player_ids to be ${JSON.stringify(updates.player_ids)}, got ${JSON.stringify(dbSquad.player_ids)}`
            );
          } else {
            assert.deepEqual(
              dbSquad.player_ids,
              originalSquad.player_ids,
              `Expected player_ids to remain ${JSON.stringify(originalSquad.player_ids)}, got ${JSON.stringify(dbSquad.player_ids)}`
            );
          }

          // Non-updated fields should remain unchanged
          assert.equal(
            dbSquad.squad_id,
            squadId,
            `Expected squad_id to remain '${squadId}', got '${dbSquad.squad_id}'`
          );
          assert.equal(
            dbSquad.status,
            'active',
            `Expected status to remain 'active', got '${dbSquad.status}'`
          );

          // ── Assert 3: squad:updated event was emitted with updated squad ─
          const updatedEvent = emittedEvents.find(
            (e) => e.event === 'squad:updated' && e.data && e.data.squad_id === squadId
          );
          assert.ok(
            updatedEvent !== undefined,
            `Expected 'squad:updated' event with squad_id='${squadId}' to be emitted, but got: ${JSON.stringify(emittedEvents)}`
          );

          // The emitted data should match the DB record
          const emittedSquad = updatedEvent.data;
          if (updates.team_name !== undefined) {
            assert.equal(
              emittedSquad.team_name,
              updates.team_name,
              `Expected emitted squad team_name to be '${updates.team_name}', got '${emittedSquad.team_name}'`
            );
          }
          if (updates.leader_id !== undefined) {
            assert.equal(
              emittedSquad.leader_id,
              updates.leader_id,
              `Expected emitted squad leader_id to be '${updates.leader_id}', got '${emittedSquad.leader_id}'`
            );
          }
          if (updates.player_ids !== undefined) {
            assert.deepEqual(
              emittedSquad.player_ids,
              updates.player_ids,
              `Expected emitted squad player_ids to be ${JSON.stringify(updates.player_ids)}, got ${JSON.stringify(emittedSquad.player_ids)}`
            );
          }

          // ── Teardown: clean up inserted squad ────────────────────────────
          db.getDb().prepare('DELETE FROM squads WHERE squad_id = ?').run(squadId);
        }),
        { numRuns: 100 }
      );
    }
  );
});
