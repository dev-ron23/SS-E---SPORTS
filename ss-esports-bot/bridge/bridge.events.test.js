'use strict';

/**
 * Property-based test for socket event completeness
 *
 * Property 9: Socket Event Completeness
 *   Validates: Requirements 2.1-2.11
 *
 * For each state-changing operation, the corresponding Socket.IO event SHALL be
 * emitted with the correct payload in the same tick as the DB write.
 *
 * Operations tested:
 *  1. POST /api/squads/cancel-squad  → squad:cancelled   { squad_id }
 *  2. POST /api/squads/edit-squad    → squad:updated     (squad object)
 *  3. POST /api/assign-match         → match:assigned    { group_no, room_id, password }
 *  4. POST /api/start-match          → match:started     { group_no, started_at }
 *  5. POST /api/declare-winner       → match:winner      { squad_id, team_name, position }
 *  6. POST /api/update-score         → score:updated     (score record)
 *  7. POST /api/warn-player          → player:warned     { discord_id, squad_id, warnings }
 *  8. POST /api/mute-player          → player:muted      { discord_id, is_muted: true }
 *  9. POST /api/unmute-player        → player:muted      { discord_id, is_muted: false }
 * 10. POST /api/lock-registration    → registration:status { locked: true }
 * 11. POST /api/unlock-registration  → registration:status { locked: false }
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const supertest = require('supertest');

// Configure environment before requiring any project modules
process.env.DASHBOARD_API_KEY = 'test-secret-key';
process.env.BRIDGE_PORT = '0';
process.env.DB_PATH = ':memory:';

const db = require('../database/db');
const emitter = require('./emitter');
const { startBridgeServer } = require('./server');

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const AUTH = { Authorization: 'Bearer test-secret-key' };

/** Counter used to generate unique IDs within a single test run */
let _counter = 0;
function uid() {
  return `T${Date.now()}${++_counter}`;
}

/**
 * Insert a minimal active squad and its players into the DB.
 * Returns { squadId, discordId } for use in assertions.
 */
function insertTestSquad(overrides = {}) {
  const squadId = overrides.squad_id || `SSE-${uid()}`;
  const discordId = overrides.discord_id || `discord-${uid()}`;
  const squadNo = overrides.squad_no || (_counter + 9000);

  db.insertSquad({
    squad_id: squadId,
    squad_no: squadNo,
    team_name: overrides.team_name || `Team-${squadId}`,
    leader_id: discordId,
    player_ids: [discordId],
    player_uids: {},
    group_no: overrides.group_no ?? null,
    registration_msg_id: null,
    registration_channel_id: null,
    confirmed_msg_id: null,
    group_msg_id: null,
    registered_at: new Date().toISOString(),
    status: 'active',
    winner_position: null,
  });

  db.insertPlayer({
    discord_id: discordId,
    squad_id: squadId,
    game_uid: null,
    role: 'leader',
    warnings: 0,
    is_muted: 0,
  });

  return { squadId, discordId };
}

/**
 * Insert a minimal group into the DB.
 * Returns groupNo.
 */
function insertTestGroup(squadId) {
  const groupNo = _counter + 5000;
  db.upsertGroup({
    group_no: groupNo,
    channel_id: `ch-${uid()}`,   // NOT NULL in schema — use a placeholder
    role_id: `role-${uid()}`,    // NOT NULL in schema — use a placeholder
    squad_ids: squadId ? [squadId] : [],
    match_room_id: null,
    match_password: null,
    match_started_at: null,
  });
  return groupNo;
}

/**
 * Clean up all test data between runs.
 */
function cleanDb() {
  const raw = db.getDb();
  raw.prepare('DELETE FROM scores').run();
  raw.prepare('DELETE FROM matches').run();
  raw.prepare('DELETE FROM players').run();
  raw.prepare('DELETE FROM squads').run();
  raw.prepare('DELETE FROM groups_table').run();
}

// ─────────────────────────────────────────────
// Property 9: Socket Event Completeness
// Validates: Requirements 2.1-2.11
// ─────────────────────────────────────────────

describe('Property 9: Socket Event Completeness', () => {
  let httpServer;
  let request;

  // Spy state
  const emittedEvents = [];
  let originalEmit;

  before(async () => {
    db.initDb(':memory:');

    const result = startBridgeServer(null, null);
    httpServer = result.httpServer;

    await new Promise((resolve) => {
      if (httpServer.listening) resolve();
      else httpServer.once('listening', resolve);
    });

    request = supertest(httpServer);

    // Install spy on emitter.emit
    originalEmit = emitter.emit;
    emitter.emit = function (event, data) {
      emittedEvents.push({ event, data });
      return originalEmit.call(this, event, data);
    };
  });

  after(() => {
    emitter.emit = originalEmit;
    httpServer.close();
    db.closeDb();
  });

  // ─────────────────────────────────────────────
  // Operation definitions
  // Each operation is a function that:
  //   1. Sets up required DB state
  //   2. Calls the API
  //   3. Asserts the correct event was emitted
  //   4. Returns cleanup info
  // ─────────────────────────────────────────────

  /**
   * Build the list of operations to test.
   * Each entry: { name, run: async () => void }
   */
  function buildOperations() {
    return [
      // ── 1. cancel-squad ──────────────────────────────────────────────
      {
        name: 'cancel-squad → squad:cancelled',
        async run() {
          const { squadId } = insertTestSquad();

          const res = await request
            .post('/api/squads/cancel-squad')
            .set(AUTH)
            .send({ squad_id: squadId });

          assert.equal(res.status, 200, `cancel-squad: expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);

          const evt = emittedEvents.find(
            (e) => e.event === 'squad:cancelled' && e.data?.squad_id === squadId
          );
          assert.ok(evt, `Expected squad:cancelled with squad_id=${squadId}, got: ${JSON.stringify(emittedEvents)}`);
        },
      },

      // ── 2. edit-squad ────────────────────────────────────────────────
      {
        name: 'edit-squad → squad:updated',
        async run() {
          const { squadId } = insertTestSquad();
          const newName = `Edited-${uid()}`;

          const res = await request
            .post('/api/squads/edit-squad')
            .set(AUTH)
            .send({ squad_id: squadId, team_name: newName });

          assert.equal(res.status, 200, `edit-squad: expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);

          const evt = emittedEvents.find(
            (e) => e.event === 'squad:updated' && e.data?.squad_id === squadId
          );
          assert.ok(evt, `Expected squad:updated with squad_id=${squadId}, got: ${JSON.stringify(emittedEvents)}`);
          assert.equal(evt.data.team_name, newName, `squad:updated payload should have updated team_name`);
        },
      },

      // ── 3. assign-match ──────────────────────────────────────────────
      {
        name: 'assign-match → match:assigned',
        async run() {
          const { squadId } = insertTestSquad();
          const groupNo = insertTestGroup(squadId);
          const roomId = `room-${uid()}`;
          const password = `pass-${uid()}`;

          const res = await request
            .post('/api/assign-match')
            .set(AUTH)
            .send({ group_no: groupNo, room_id: roomId, password });

          assert.equal(res.status, 200, `assign-match: expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);

          const evt = emittedEvents.find(
            (e) =>
              e.event === 'match:assigned' &&
              e.data?.group_no === groupNo &&
              e.data?.room_id === roomId &&
              e.data?.password === password
          );
          assert.ok(evt, `Expected match:assigned with group_no=${groupNo}, room_id=${roomId}, got: ${JSON.stringify(emittedEvents)}`);
        },
      },

      // ── 4. start-match ───────────────────────────────────────────────
      {
        name: 'start-match → match:started',
        async run() {
          const { squadId } = insertTestSquad();
          const groupNo = insertTestGroup(squadId);

          const res = await request
            .post('/api/start-match')
            .set(AUTH)
            .send({ group_no: groupNo });

          assert.equal(res.status, 200, `start-match: expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);

          const evt = emittedEvents.find(
            (e) => e.event === 'match:started' && e.data?.group_no === groupNo
          );
          assert.ok(evt, `Expected match:started with group_no=${groupNo}, got: ${JSON.stringify(emittedEvents)}`);
          assert.ok(evt.data.started_at, `match:started payload should include started_at`);
        },
      },

      // ── 5. declare-winner ────────────────────────────────────────────
      {
        name: 'declare-winner → match:winner',
        async run() {
          const { squadId } = insertTestSquad();
          const position = 1;

          const res = await request
            .post('/api/declare-winner')
            .set(AUTH)
            .send({ squad_id: squadId, position });

          assert.equal(res.status, 200, `declare-winner: expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);

          const evt = emittedEvents.find(
            (e) =>
              e.event === 'match:winner' &&
              e.data?.squad_id === squadId &&
              e.data?.position === position
          );
          assert.ok(evt, `Expected match:winner with squad_id=${squadId}, got: ${JSON.stringify(emittedEvents)}`);
          assert.ok(evt.data.team_name, `match:winner payload should include team_name`);
        },
      },

      // ── 6. update-score ──────────────────────────────────────────────
      {
        name: 'update-score → score:updated',
        async run() {
          const { squadId } = insertTestSquad();
          const kills = 5;
          const placement = 10;

          const res = await request
            .post('/api/update-score')
            .set(AUTH)
            .send({ squad_id: squadId, kills, placement });

          assert.equal(res.status, 200, `update-score: expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);

          const evt = emittedEvents.find(
            (e) => e.event === 'score:updated' && e.data?.squad_id === squadId
          );
          assert.ok(evt, `Expected score:updated with squad_id=${squadId}, got: ${JSON.stringify(emittedEvents)}`);
          assert.equal(evt.data.kills, kills, `score:updated payload should have correct kills`);
          assert.equal(evt.data.placement_points, placement, `score:updated payload should have correct placement_points`);
        },
      },

      // ── 7. warn-player ───────────────────────────────────────────────
      {
        name: 'warn-player → player:warned',
        async run() {
          const { squadId, discordId } = insertTestSquad();

          const res = await request
            .post('/api/warn-player')
            .set(AUTH)
            .send({ discord_id: discordId, reason: 'test warning' });

          assert.equal(res.status, 200, `warn-player: expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);

          const evt = emittedEvents.find(
            (e) =>
              e.event === 'player:warned' &&
              e.data?.discord_id === discordId &&
              e.data?.squad_id === squadId
          );
          assert.ok(evt, `Expected player:warned with discord_id=${discordId}, got: ${JSON.stringify(emittedEvents)}`);
          assert.equal(typeof evt.data.warnings, 'number', `player:warned payload should include warnings count`);
        },
      },

      // ── 8. mute-player ───────────────────────────────────────────────
      {
        name: 'mute-player → player:muted { is_muted: true }',
        async run() {
          const { discordId } = insertTestSquad();

          const res = await request
            .post('/api/mute-player')
            .set(AUTH)
            .send({ discord_id: discordId });

          assert.equal(res.status, 200, `mute-player: expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);

          const evt = emittedEvents.find(
            (e) =>
              e.event === 'player:muted' &&
              e.data?.discord_id === discordId &&
              e.data?.is_muted === true
          );
          assert.ok(evt, `Expected player:muted { is_muted: true } for discord_id=${discordId}, got: ${JSON.stringify(emittedEvents)}`);
        },
      },

      // ── 9. unmute-player ─────────────────────────────────────────────
      {
        name: 'unmute-player → player:muted { is_muted: false }',
        async run() {
          const { discordId } = insertTestSquad();

          const res = await request
            .post('/api/unmute-player')
            .set(AUTH)
            .send({ discord_id: discordId });

          assert.equal(res.status, 200, `unmute-player: expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);

          const evt = emittedEvents.find(
            (e) =>
              e.event === 'player:muted' &&
              e.data?.discord_id === discordId &&
              e.data?.is_muted === false
          );
          assert.ok(evt, `Expected player:muted { is_muted: false } for discord_id=${discordId}, got: ${JSON.stringify(emittedEvents)}`);
        },
      },

      // ── 10. lock-registration ────────────────────────────────────────
      {
        name: 'lock-registration → registration:status { locked: true }',
        async run() {
          const res = await request
            .post('/api/lock-registration')
            .set(AUTH)
            .send({});

          assert.equal(res.status, 200, `lock-registration: expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);

          const evt = emittedEvents.find(
            (e) => e.event === 'registration:status' && e.data?.locked === true
          );
          assert.ok(evt, `Expected registration:status { locked: true }, got: ${JSON.stringify(emittedEvents)}`);
        },
      },

      // ── 11. unlock-registration ──────────────────────────────────────
      {
        name: 'unlock-registration → registration:status { locked: false }',
        async run() {
          const res = await request
            .post('/api/unlock-registration')
            .set(AUTH)
            .send({});

          assert.equal(res.status, 200, `unlock-registration: expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);

          const evt = emittedEvents.find(
            (e) => e.event === 'registration:status' && e.data?.locked === false
          );
          assert.ok(evt, `Expected registration:status { locked: false }, got: ${JSON.stringify(emittedEvents)}`);
        },
      },
    ];
  }

  test(
    'property: each state-changing operation emits the correct Socket.IO event with the correct payload',
    async () => {
      /**
       * Validates: Requirements 2.1-2.11
       *
       * For each randomly selected state-changing operation:
       * - The API returns HTTP 200
       * - The corresponding Socket.IO event is emitted
       * - The event payload contains the expected fields
       */
      const operations = buildOperations();

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...operations),
          async (operation) => {
            // Reset spy and DB state before each run
            emittedEvents.length = 0;
            cleanDb();

            await operation.run();
          }
        ),
        { numRuns: 50 }
      );
    }
  );
});
