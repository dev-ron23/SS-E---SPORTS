'use strict';

/**
 * Property-based tests for the database layer
 *
 * Property 9: Squad Persistence Round-Trip
 *   Validates: Requirements 3.3, 3.4
 *
 * Property 41: Database Uniqueness Constraints
 *   Validates: Requirements 26.4, 26.5
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const db = require('./db');

// ─────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────

/**
 * Build a minimal valid squad object for testing
 * @param {Object} overrides
 * @returns {Object}
 */
function makeSquad(overrides = {}) {
  const squadNo = overrides.squad_no ?? 1;
  return {
    squad_id: overrides.squad_id ?? db.generateSquadId(squadNo),
    squad_no: squadNo,
    team_name: overrides.team_name ?? 'Test Team Alpha',
    leader_id: overrides.leader_id ?? '100000000000000001',
    player_ids: overrides.player_ids ?? ['100000000000000001', '100000000000000002'],
    player_uids: overrides.player_uids ?? { '100000000000000001': '987654321' },
    group_no: overrides.group_no !== undefined ? overrides.group_no : null,
    registration_msg_id: overrides.registration_msg_id ?? '200000000000000001',
    registration_channel_id: overrides.registration_channel_id ?? '1502217324059431064',
    confirmed_msg_id: overrides.confirmed_msg_id !== undefined ? overrides.confirmed_msg_id : null,
    group_msg_id: overrides.group_msg_id !== undefined ? overrides.group_msg_id : null,
    registered_at: overrides.registered_at ?? new Date().toISOString(),
    status: overrides.status ?? 'active',
    winner_position: overrides.winner_position !== undefined ? overrides.winner_position : null,
  };
}

/**
 * Build a minimal valid player object for testing
 * @param {Object} overrides
 * @returns {Object}
 */
function makePlayer(overrides = {}) {
  return {
    discord_id: overrides.discord_id ?? '100000000000000001',
    squad_id: overrides.squad_id ?? 'SSE-0001',
    game_uid: overrides.game_uid !== undefined ? overrides.game_uid : '987654321',
    role: overrides.role ?? 'leader',
    warnings: overrides.warnings ?? 0,
    is_muted: overrides.is_muted ?? 0,
  };
}

// ─────────────────────────────────────────────
// Property 9: Squad Persistence Round-Trip
// Validates: Requirements 3.3, 3.4
// ─────────────────────────────────────────────

describe('Property 9: Squad Persistence Round-Trip', () => {
  beforeEach(() => {
    db.initDb(':memory:');
  });

  afterEach(() => {
    db.closeDb();
  });

  test('inserting a squad and querying by squad_id returns identical data', () => {
    const squad = makeSquad({
      squad_no: 1,
      team_name: 'Phoenix Rising',
      leader_id: '111111111111111111',
      player_ids: ['111111111111111111', '222222222222222222', '333333333333333333'],
      player_uids: { '111111111111111111': '12345678', '222222222222222222': '87654321' },
      registered_at: '2024-01-15T10:30:00.000Z',
      status: 'active',
    });

    db.insertSquad(squad);
    const retrieved = db.getSquadById(squad.squad_id);

    assert.ok(retrieved, 'Squad should be retrievable after insertion');
    assert.equal(retrieved.squad_id, squad.squad_id, 'squad_id must match');
    assert.equal(retrieved.squad_no, squad.squad_no, 'squad_no must match');
    assert.equal(retrieved.team_name, squad.team_name, 'team_name must match');
    assert.equal(retrieved.leader_id, squad.leader_id, 'leader_id must match');
    assert.deepEqual(retrieved.player_ids, squad.player_ids, 'player_ids must match');
    assert.deepEqual(retrieved.player_uids, squad.player_uids, 'player_uids must match');
    assert.equal(retrieved.registered_at, squad.registered_at, 'registered_at must match');
    assert.equal(retrieved.status, squad.status, 'status must match');
    assert.equal(retrieved.winner_position, squad.winner_position, 'winner_position must match');
  });

  test('player records are persisted with correct fields', () => {
    const squad = makeSquad({ squad_no: 1 });
    db.insertSquad(squad);

    const leader = makePlayer({
      discord_id: squad.leader_id,
      squad_id: squad.squad_id,
      game_uid: '12345678',
      role: 'leader',
    });
    const player = makePlayer({
      discord_id: '222222222222222222',
      squad_id: squad.squad_id,
      game_uid: '87654321',
      role: 'player',
    });

    db.insertPlayer(leader);
    db.insertPlayer(player);

    const retrievedLeader = db.getPlayer(leader.discord_id, squad.squad_id);
    const retrievedPlayer = db.getPlayer(player.discord_id, squad.squad_id);

    assert.ok(retrievedLeader, 'Leader player record should be retrievable');
    assert.equal(retrievedLeader.discord_id, leader.discord_id, 'leader discord_id must match');
    assert.equal(retrievedLeader.squad_id, leader.squad_id, 'leader squad_id must match');
    assert.equal(retrievedLeader.game_uid, leader.game_uid, 'leader game_uid must match');
    assert.equal(retrievedLeader.role, 'leader', 'leader role must be "leader"');

    assert.ok(retrievedPlayer, 'Player record should be retrievable');
    assert.equal(retrievedPlayer.discord_id, player.discord_id, 'player discord_id must match');
    assert.equal(retrievedPlayer.role, 'player', 'player role must be "player"');
  });

  test('round-trip preserves JSON-serialized player_ids array with multiple players', () => {
    const playerIds = [
      '100000000000000001',
      '100000000000000002',
      '100000000000000003',
      '100000000000000004',
      '100000000000000005',
    ];
    const squad = makeSquad({ squad_no: 2, player_ids: playerIds });

    db.insertSquad(squad);
    const retrieved = db.getSquadById(squad.squad_id);

    assert.deepEqual(
      retrieved.player_ids,
      playerIds,
      'All 5 player IDs must be preserved in round-trip'
    );
    assert.equal(retrieved.player_ids.length, 5, 'player_ids length must be 5');
  });

  test('round-trip preserves JSON-serialized player_uids object', () => {
    const playerUids = {
      '100000000000000001': '111111111',
      '100000000000000002': '222222222',
      '100000000000000003': '333333333',
    };
    const squad = makeSquad({ squad_no: 3, player_uids: playerUids });

    db.insertSquad(squad);
    const retrieved = db.getSquadById(squad.squad_id);

    assert.deepEqual(
      retrieved.player_uids,
      playerUids,
      'player_uids object must be preserved in round-trip'
    );
  });

  test('round-trip preserves null optional fields', () => {
    const squad = makeSquad({
      squad_no: 4,
      group_no: null,
      confirmed_msg_id: null,
      group_msg_id: null,
      winner_position: null,
    });

    db.insertSquad(squad);
    const retrieved = db.getSquadById(squad.squad_id);

    assert.equal(retrieved.group_no, null, 'group_no should be null');
    assert.equal(retrieved.confirmed_msg_id, null, 'confirmed_msg_id should be null');
    assert.equal(retrieved.group_msg_id, null, 'group_msg_id should be null');
    assert.equal(retrieved.winner_position, null, 'winner_position should be null');
  });

  test('round-trip preserves all status values', () => {
    const statuses = ['active', 'cancelled', 'edited'];

    for (let i = 0; i < statuses.length; i++) {
      const status = statuses[i];
      const squad = makeSquad({ squad_no: i + 10, status });
      db.insertSquad(squad);
      const retrieved = db.getSquadById(squad.squad_id);
      assert.equal(retrieved.status, status, `status "${status}" must be preserved`);
    }
  });

  test('insertSquadWithPlayers atomically inserts squad and all players', () => {
    const squad = makeSquad({ squad_no: 5 });
    const players = [
      makePlayer({ discord_id: squad.leader_id, squad_id: squad.squad_id, role: 'leader' }),
      makePlayer({ discord_id: '200000000000000002', squad_id: squad.squad_id, role: 'player' }),
    ];

    db.insertSquadWithPlayers(squad, players);

    const retrievedSquad = db.getSquadById(squad.squad_id);
    assert.ok(retrievedSquad, 'Squad should exist after atomic insert');

    const retrievedPlayers = db.getSquadPlayers(squad.squad_id);
    assert.equal(retrievedPlayers.length, 2, 'Both players should be persisted');
  });

  test('property: for any squad inserted, querying by squad_id returns exact same data', () => {
    // Test with multiple different squads to verify the property holds universally
    const testCases = [
      {
        squad_no: 1,
        team_name: 'Alpha Squad',
        leader_id: '111111111111111111',
        player_ids: ['111111111111111111', '222222222222222222'],
        player_uids: {},
        status: 'active',
      },
      {
        squad_no: 2,
        team_name: 'Beta Warriors',
        leader_id: '333333333333333333',
        player_ids: ['333333333333333333', '444444444444444444', '555555555555555555'],
        player_uids: { '333333333333333333': '99999999' },
        status: 'active',
      },
      {
        squad_no: 13,
        team_name: 'Gamma Force',
        leader_id: '666666666666666666',
        player_ids: ['666666666666666666', '777777777777777777'],
        player_uids: { '666666666666666666': '11111111', '777777777777777777': '22222222' },
        status: 'cancelled',
      },
    ];

    for (const tc of testCases) {
      const squad = makeSquad(tc);
      db.insertSquad(squad);
      const retrieved = db.getSquadById(squad.squad_id);

      assert.ok(retrieved, `Squad ${squad.squad_id} should be retrievable`);
      assert.equal(retrieved.team_name, tc.team_name, `team_name must match for ${squad.squad_id}`);
      assert.equal(retrieved.leader_id, tc.leader_id, `leader_id must match for ${squad.squad_id}`);
      assert.deepEqual(
        retrieved.player_ids,
        tc.player_ids,
        `player_ids must match for ${squad.squad_id}`
      );
      assert.deepEqual(
        retrieved.player_uids,
        tc.player_uids,
        `player_uids must match for ${squad.squad_id}`
      );
      assert.equal(retrieved.status, tc.status, `status must match for ${squad.squad_id}`);
    }
  });
});

// ─────────────────────────────────────────────
// Property 41: Database Uniqueness Constraints
// Validates: Requirements 26.4, 26.5
// ─────────────────────────────────────────────

describe('Property 41: Database Uniqueness Constraints', () => {
  beforeEach(() => {
    db.initDb(':memory:');
  });

  afterEach(() => {
    db.closeDb();
  });

  test('duplicate squad_id is rejected', () => {
    const squad = makeSquad({ squad_no: 1 });
    db.insertSquad(squad);

    // Attempt to insert a second squad with the same squad_id
    const duplicate = makeSquad({ squad_no: 2, squad_id: squad.squad_id });

    assert.throws(
      () => db.insertSquad(duplicate),
      (err) => {
        // SQLite UNIQUE constraint violation
        return (
          err.message.includes('UNIQUE constraint failed') ||
          err.message.includes('PRIMARY KEY constraint failed')
        );
      },
      'Inserting a duplicate squad_id should throw a constraint error'
    );
  });

  test('duplicate squad_no is rejected', () => {
    const squad1 = makeSquad({ squad_no: 1 });
    db.insertSquad(squad1);

    // Attempt to insert a second squad with the same squad_no but different squad_id
    const squad2 = makeSquad({
      squad_no: 1,
      squad_id: 'SSE-9999', // different ID
      team_name: 'Different Team',
    });

    assert.throws(
      () => db.insertSquad(squad2),
      (err) => {
        return err.message.includes('UNIQUE constraint failed');
      },
      'Inserting a duplicate squad_no should throw a UNIQUE constraint error'
    );
  });

  test('duplicate (discord_id, squad_id) pair in players is rejected', () => {
    const squad = makeSquad({ squad_no: 1 });
    db.insertSquad(squad);

    const player = makePlayer({
      discord_id: '100000000000000001',
      squad_id: squad.squad_id,
      role: 'leader',
    });
    db.insertPlayer(player);

    // Attempt to insert the same player in the same squad again
    assert.throws(
      () => db.insertPlayer(player),
      (err) => {
        return (
          err.message.includes('UNIQUE constraint failed') ||
          err.message.includes('PRIMARY KEY constraint failed')
        );
      },
      'Inserting a duplicate (discord_id, squad_id) should throw a constraint error'
    );
  });

  test('same discord_id can appear in different squads (different squad_id)', () => {
    // This should NOT throw — a player can be in different squads (e.g., after cancellation)
    const squad1 = makeSquad({ squad_no: 1 });
    const squad2 = makeSquad({ squad_no: 2 });
    db.insertSquad(squad1);
    db.insertSquad(squad2);

    const playerId = '100000000000000001';

    db.insertPlayer(makePlayer({ discord_id: playerId, squad_id: squad1.squad_id, role: 'leader' }));
    // Same discord_id but different squad_id — should succeed
    assert.doesNotThrow(
      () =>
        db.insertPlayer(
          makePlayer({ discord_id: playerId, squad_id: squad2.squad_id, role: 'player' })
        ),
      'Same discord_id in a different squad should be allowed'
    );
  });

  test('different discord_ids can be in the same squad', () => {
    const squad = makeSquad({ squad_no: 1 });
    db.insertSquad(squad);

    // Multiple different players in the same squad — should succeed
    assert.doesNotThrow(() => {
      db.insertPlayer(makePlayer({ discord_id: '111111111111111111', squad_id: squad.squad_id, role: 'leader' }));
      db.insertPlayer(makePlayer({ discord_id: '222222222222222222', squad_id: squad.squad_id, role: 'player' }));
      db.insertPlayer(makePlayer({ discord_id: '333333333333333333', squad_id: squad.squad_id, role: 'player' }));
    }, 'Multiple different players in the same squad should be allowed');
  });

  test('property: all squad_id values in squads table are unique', () => {
    // Insert N squads and verify no two have the same squad_id
    const n = 10;
    for (let i = 1; i <= n; i++) {
      db.insertSquad(makeSquad({ squad_no: i }));
    }

    const allSquads = db.getAllSquads();
    const ids = allSquads.map((s) => s.squad_id);
    const uniqueIds = new Set(ids);

    assert.equal(
      uniqueIds.size,
      ids.length,
      'All squad_id values must be unique across all squads'
    );
  });

  test('property: all squad_no values in squads table are unique', () => {
    // Insert N squads and verify no two have the same squad_no
    const n = 10;
    for (let i = 1; i <= n; i++) {
      db.insertSquad(makeSquad({ squad_no: i }));
    }

    const allSquads = db.getAllSquads();
    const nos = allSquads.map((s) => s.squad_no);
    const uniqueNos = new Set(nos);

    assert.equal(
      uniqueNos.size,
      nos.length,
      'All squad_no values must be unique across all squads'
    );
  });

  test('property: all (discord_id, squad_id) pairs in players table are unique', () => {
    // Insert squads and players, then verify no duplicate pairs
    const squad1 = makeSquad({ squad_no: 1 });
    const squad2 = makeSquad({ squad_no: 2 });
    db.insertSquad(squad1);
    db.insertSquad(squad2);

    const playerData = [
      { discord_id: '111111111111111111', squad_id: squad1.squad_id, role: 'leader' },
      { discord_id: '222222222222222222', squad_id: squad1.squad_id, role: 'player' },
      { discord_id: '333333333333333333', squad_id: squad1.squad_id, role: 'player' },
      { discord_id: '111111111111111111', squad_id: squad2.squad_id, role: 'player' }, // same user, different squad
      { discord_id: '444444444444444444', squad_id: squad2.squad_id, role: 'leader' },
    ];

    for (const p of playerData) {
      db.insertPlayer(makePlayer(p));
    }

    // Verify uniqueness by checking all pairs
    const rawDb = db.getDb();
    const allPlayers = rawDb.prepare('SELECT discord_id, squad_id FROM players').all();
    const pairs = allPlayers.map((p) => `${p.discord_id}:${p.squad_id}`);
    const uniquePairs = new Set(pairs);

    assert.equal(
      uniquePairs.size,
      pairs.length,
      'All (discord_id, squad_id) pairs must be unique in the players table'
    );
  });

  test('foreign key constraint: inserting player with non-existent squad_id is rejected', () => {
    // The players table has a FK to squads(squad_id)
    const player = makePlayer({
      discord_id: '100000000000000001',
      squad_id: 'SSE-9999', // does not exist in squads table
    });

    assert.throws(
      () => db.insertPlayer(player),
      (err) => {
        // SQLite FK violation
        return (
          err.message.includes('FOREIGN KEY constraint failed') ||
          err.message.includes('constraint failed')
        );
      },
      'Inserting a player with a non-existent squad_id should throw a FK constraint error'
    );
  });
});
