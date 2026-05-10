'use strict';

/**
 * Property-based test for invalid parameter rejection
 *
 * Property 5: Invalid Parameter Rejection
 *   Validates: Requirements 1.14
 *
 * For any POST endpoint on the Bridge Server, a request with missing or
 * incomplete required fields SHALL always receive HTTP 400 with
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
// Endpoint definitions: required fields and invalid body generators
// ─────────────────────────────────────────────

/**
 * For each endpoint, define:
 *   - path: the POST path
 *   - requiredFields: list of required field names
 *   - invalidBodyArb: fast-check arbitrary that generates bodies missing >= 1 required field
 */
const ENDPOINT_SPECS = [
  {
    path: '/api/squads/cancel-squad',
    requiredFields: ['squad_id'],
    // Missing squad_id: empty body or body with unrelated fields
    invalidBodyArb: fc.oneof(
      fc.constant({}),
      fc.record({ other: fc.string() })
    ),
  },
  {
    path: '/api/squads/edit-squad',
    requiredFields: ['squad_id', 'at least one of (team_name, leader_id, player_ids)'],
    // Missing squad_id entirely, OR has squad_id but no update fields
    invalidBodyArb: fc.oneof(
      fc.constant({}),
      fc.record({ other: fc.string() }),
      // Has squad_id but no update fields
      fc.record({ squad_id: fc.string({ minLength: 1 }) })
    ),
  },
  {
    path: '/api/assign-match',
    requiredFields: ['group_no', 'room_id', 'password'],
    // Missing one or more of the three required fields
    invalidBodyArb: fc.oneof(
      fc.constant({}),
      // Missing room_id and password
      fc.record({ group_no: fc.integer({ min: 1, max: 10 }) }),
      // Missing password
      fc.record({ group_no: fc.integer({ min: 1, max: 10 }), room_id: fc.string({ minLength: 1 }) }),
      // Missing group_no
      fc.record({ room_id: fc.string({ minLength: 1 }), password: fc.string({ minLength: 1 }) }),
      // Missing room_id
      fc.record({ group_no: fc.integer({ min: 1, max: 10 }), password: fc.string({ minLength: 1 }) })
    ),
  },
  {
    path: '/api/start-match',
    requiredFields: ['group_no'],
    // Missing group_no
    invalidBodyArb: fc.oneof(
      fc.constant({}),
      fc.record({ other: fc.string() })
    ),
  },
  {
    path: '/api/declare-winner',
    requiredFields: ['squad_id', 'position'],
    // Missing one or both required fields
    invalidBodyArb: fc.oneof(
      fc.constant({}),
      // Missing position
      fc.record({ squad_id: fc.string({ minLength: 1 }) }),
      // Missing squad_id
      fc.record({ position: fc.integer({ min: 1, max: 20 }) })
    ),
  },
  {
    path: '/api/update-score',
    requiredFields: ['squad_id', 'kills', 'placement'],
    // Missing one or more required fields
    invalidBodyArb: fc.oneof(
      fc.constant({}),
      // Missing kills and placement
      fc.record({ squad_id: fc.string({ minLength: 1 }) }),
      // Missing placement
      fc.record({ squad_id: fc.string({ minLength: 1 }), kills: fc.nat() }),
      // Missing squad_id
      fc.record({ kills: fc.nat(), placement: fc.nat() }),
      // Missing kills
      fc.record({ squad_id: fc.string({ minLength: 1 }), placement: fc.nat() })
    ),
  },
  {
    path: '/api/warn-player',
    requiredFields: ['discord_id', 'reason'],
    // Missing one or both required fields
    invalidBodyArb: fc.oneof(
      fc.constant({}),
      // Missing reason
      fc.record({ discord_id: fc.string({ minLength: 1 }) }),
      // Missing discord_id
      fc.record({ reason: fc.string({ minLength: 1 }) })
    ),
  },
  {
    path: '/api/mute-player',
    requiredFields: ['discord_id'],
    // Missing discord_id
    invalidBodyArb: fc.oneof(
      fc.constant({}),
      fc.record({ other: fc.string() })
    ),
  },
  {
    path: '/api/unmute-player',
    requiredFields: ['discord_id'],
    // Missing discord_id
    invalidBodyArb: fc.oneof(
      fc.constant({}),
      fc.record({ other: fc.string() })
    ),
  },
  {
    path: '/api/broadcast',
    requiredFields: ['message (non-empty string)'],
    // Missing message, empty message, or non-string message
    invalidBodyArb: fc.oneof(
      fc.constant({}),
      fc.constant({ message: '' }),
      fc.constant({ message: '   ' }),
      fc.record({ other: fc.string() })
    ),
  },
];

// ─────────────────────────────────────────────
// Property 5: Invalid Parameter Rejection
// Validates: Requirements 1.14
// ─────────────────────────────────────────────

describe('Property 5: Invalid Parameter Rejection', () => {
  let httpServer;
  let request;

  before(async () => {
    // Initialize in-memory DB
    db.initDb(':memory:');

    // Start bridge server with null discordClient and guild
    // Param validation happens before any Discord calls, so null is safe here
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

  // Run one property test per endpoint
  for (const spec of ENDPOINT_SPECS) {
    const { path, invalidBodyArb } = spec;

    test(
      `property: missing required fields on ${path} returns HTTP 400 with { success: false, error: string }`,
      async () => {
        await fc.assert(
          fc.asyncProperty(invalidBodyArb, async (invalidBody) => {
            const response = await request
              .post(path)
              .set('Authorization', 'Bearer test-secret-key')
              .send(invalidBody);

            assert.equal(
              response.status,
              400,
              `Expected 400 for ${path} with body ${JSON.stringify(invalidBody)}, got ${response.status}`
            );
            assert.equal(
              response.body.success,
              false,
              `Expected success=false for ${path} with body ${JSON.stringify(invalidBody)}`
            );
            assert.equal(
              typeof response.body.error,
              'string',
              `Expected error to be a string for ${path} with body ${JSON.stringify(invalidBody)}`
            );
            assert.ok(
              response.body.error.length > 0,
              `Expected non-empty error string for ${path} with body ${JSON.stringify(invalidBody)}`
            );
          }),
          { numRuns: 50 }
        );
      }
    );
  }

  // Also test /api/update-settings: no required fields, but max_slots must be positive integer if provided
  test(
    'property: /api/update-settings with non-positive-integer max_slots returns HTTP 400',
    async () => {
      // Generate invalid max_slots values: negative ints, zero, floats, non-numeric strings
      const invalidMaxSlotsArb = fc.oneof(
        fc.integer({ max: 0 }),                          // zero or negative
        fc.float({ min: Math.fround(0.1), max: Math.fround(1000), noNaN: true }).filter(n => !Number.isInteger(n)), // non-integer float
        fc.constant('abc'),                              // non-numeric string
        fc.constant(-1),
        fc.constant(0)
      );

      await fc.assert(
        fc.asyncProperty(invalidMaxSlotsArb, async (invalidMaxSlots) => {
          const response = await request
            .post('/api/update-settings')
            .set('Authorization', 'Bearer test-secret-key')
            .send({ max_slots: invalidMaxSlots });

          assert.equal(
            response.status,
            400,
            `Expected 400 for /api/update-settings with max_slots=${JSON.stringify(invalidMaxSlots)}, got ${response.status}`
          );
          assert.equal(
            response.body.success,
            false,
            `Expected success=false for /api/update-settings with max_slots=${JSON.stringify(invalidMaxSlots)}`
          );
          assert.equal(
            typeof response.body.error,
            'string',
            `Expected error to be a string for /api/update-settings with max_slots=${JSON.stringify(invalidMaxSlots)}`
          );
        }),
        { numRuns: 50 }
      );
    }
  );
});
