'use strict';

/**
 * Tests for handlers/matches.js
 *
 * Property 26: Match Assignment Persistence   - Validates: Requirements 10.1
 * Property 27: Match Start Timestamp          - Validates: Requirements 11.1
 * Property 28: Winner Declaration Persistence - Validates: Requirements 12.2
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database/db');
const matches = require('./matches');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid squad object for testing.
 * @param {Object} overrides
 * @returns {Object}
 */
function makeSquad(overrides = {}) {
  const squadNo = overrides.squad_no ?? 1;
  return {
    squad_id: overrides.squad_id ?? db.generateSquadId(squadNo),
    squad_no: squadNo,
    team_name: overrides.team_name ?? `Team ${squadNo}`,
    leader_id: overrides.leader_id ?? `${squadNo}00000000000000001`,
    player_ids: overrides.player_ids ?? [
      `${squadNo}00000000000000001`,
      `${squadNo}00000000000000002`,
    ],
    player_uids: overrides.player_uids ?? {},
    group_no: overrides.group_no !== undefined ? overrides.group_no : null,
    registration_msg_id: null,
    registration_channel_id: '1502217324059431064',
    confirmed_msg_id: null,
    group_msg_id: null,
    registered_at: new Date().toISOString(),
    status: overrides.status ?? 'active',
    winner_position: overrides.winner_position !== undefined ? overrides.winner_position : null,
  };
}

/**
 * Build a minimal group record for testing.
 * @param {Object} overrides
 * @returns {Object}
 */
function makeGroup(overrides = {}) {
  const groupNo = overrides.group_no ?? 1;
  return {
    group_no: groupNo,
    channel_id: overrides.channel_id ?? `ch-group-${groupNo}`,
    role_id: overrides.role_id ?? `role-group-${groupNo}`,
    squad_ids: overrides.squad_ids ?? [],
    match_room_id: overrides.match_room_id ?? null,
    match_password: overrides.match_password ?? null,
    match_started_at: overrides.match_started_at ?? null,
  };
}

/**
 * Build a mock Discord guild with a fetchable channel.
 * @param {Object} opts
 * @returns {{ guild, sentMessages }}
 */
function makeMockGuild(opts = {}) {
  const sentMessages = [];
  const channelId = opts.channelId ?? 'ch-group-1';

  const mockChannel = {
    id: channelId,
    isTextBased: () => true,
    send: async (payload) => {
      sentMessages.push(payload);
      return { id: `msg-${Date.now()}` };
    },
  };

  const guild = {
    id: 'mock-guild-id',
    channels: {
      fetch: async (id) => {
        if (id === channelId) return mockChannel;
        return null;
      },
      cache: {
        find: () => null,
      },
    },
    roles: {
      cache: { find: () => null },
    },
    members: {
      fetch: async (id) => ({
        id,
        roles: {
          add: async () => {},
          remove: async () => {},
        },
      }),
    },
  };

  return { guild, sentMessages, mockChannel };
}

/**
 * Build a mock Discord client that silently handles DMs and logging.
 * @returns {Object}
 */
function makeMockClient() {
  return {
    users: {
      fetch: async (id) => ({
        id,
        send: async () => {},
      }),
    },
    channels: {
      fetch: async () => ({
        isTextBased: () => true,
        send: async () => {},
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Property 26: Match Assignment Persistence
// Validates: Requirements 10.1
// ---------------------------------------------------------------------------

describe('Property 26: Match Assignment Persistence', () => {
  /**
   * Validates: Requirements 10.1
   * For any valid group number, invoking assignMatch with a room ID and password
   * SHALL update the group record in the DB with those values.
   */

  beforeEach(() => { db.initDb(':memory:'); });
  afterEach(() => { db.closeDb(); });

  test('assignMatch stores room_id and password in groups_table', async () => {
    // Set up a group in the DB
    db.upsertGroup(makeGroup({ group_no: 1 }));

    await matches.assignMatch(1, 'ROOM-001', 'pass123', null, null);

    const group = db.getGroup(1);
    assert.ok(group, 'Group should exist in DB');
    assert.equal(group.match_room_id, 'ROOM-001', 'match_room_id should be stored');
    assert.equal(group.match_password, 'pass123', 'match_password should be stored');
  });

  test('assignMatch creates a record in the matches table', async () => {
    db.upsertGroup(makeGroup({ group_no: 2 }));

    await matches.assignMatch(2, 'ROOM-XYZ', 'secret99', null, null);

    const match = db.getLatestMatchForGroup(2);
    assert.ok(match, 'A match record should be created');
    assert.equal(match.group_no, 2, 'match.group_no should be 2');
    assert.equal(match.room_id, 'ROOM-XYZ', 'match.room_id should be stored');
    assert.equal(match.password, 'secret99', 'match.password should be stored');
    assert.ok(match.assigned_at, 'match.assigned_at should be set');
    assert.equal(match.started_at, null, 'match.started_at should be null initially');
    assert.equal(match.winner_squad_id, null, 'match.winner_squad_id should be null initially');
  });

  test('assignMatch persists different credentials for different groups', async () => {
    db.upsertGroup(makeGroup({ group_no: 1 }));
    db.upsertGroup(makeGroup({ group_no: 2 }));

    await matches.assignMatch(1, 'ROOM-A', 'passA', null, null);
    await matches.assignMatch(2, 'ROOM-B', 'passB', null, null);

    const group1 = db.getGroup(1);
    const group2 = db.getGroup(2);

    assert.equal(group1.match_room_id, 'ROOM-A', 'Group 1 should have ROOM-A');
    assert.equal(group1.match_password, 'passA', 'Group 1 should have passA');
    assert.equal(group2.match_room_id, 'ROOM-B', 'Group 2 should have ROOM-B');
    assert.equal(group2.match_password, 'passB', 'Group 2 should have passB');
  });

  test('assignMatch overwrites previous credentials when called again', async () => {
    db.upsertGroup(makeGroup({ group_no: 1 }));

    await matches.assignMatch(1, 'OLD-ROOM', 'oldpass', null, null);
    await matches.assignMatch(1, 'NEW-ROOM', 'newpass', null, null);

    const group = db.getGroup(1);
    assert.equal(group.match_room_id, 'NEW-ROOM', 'Room ID should be updated to NEW-ROOM');
    assert.equal(group.match_password, 'newpass', 'Password should be updated to newpass');
  });

  test('property: for any group, assigned room_id and password are retrievable from DB', async () => {
    // Test with multiple groups to verify the property holds universally
    const testCases = [
      { groupNo: 1, roomId: 'ROOM-001', password: 'alpha123' },
      { groupNo: 2, roomId: 'ROOM-002', password: 'beta456' },
      { groupNo: 3, roomId: 'ROOM-003', password: 'gamma789' },
    ];

    for (const tc of testCases) {
      db.upsertGroup(makeGroup({ group_no: tc.groupNo }));
      await matches.assignMatch(tc.groupNo, tc.roomId, tc.password, null, null);

      const group = db.getGroup(tc.groupNo);
      assert.equal(
        group.match_room_id,
        tc.roomId,
        `Group ${tc.groupNo} should have room_id ${tc.roomId}`
      );
      assert.equal(
        group.match_password,
        tc.password,
        `Group ${tc.groupNo} should have password ${tc.password}`
      );
    }
  });

  test('assignMatch sends DM embed to all group players when client is provided', async () => {
    // Set up group with squads
    const squad = makeSquad({ squad_no: 1, group_no: 1 });
    db.insertSquad(squad);
    db.upsertGroup(makeGroup({ group_no: 1, squad_ids: [squad.squad_id] }));

    const dmsSent = [];
    const mockClient = {
      users: {
        fetch: async (id) => ({
          id,
          send: async (payload) => {
            dmsSent.push({ userId: id, payload });
          },
        }),
      },
      channels: {
        fetch: async () => ({
          isTextBased: () => true,
          send: async () => {},
        }),
      },
    };

    await matches.assignMatch(1, 'ROOM-DM', 'dmpass', null, mockClient);

    // All players in the squad should have received a DM
    assert.ok(dmsSent.length > 0, 'DMs should have been sent to group players');
    assert.equal(
      dmsSent.length,
      squad.player_ids.length,
      'DM count should match number of players in the group'
    );
  });
});

// ---------------------------------------------------------------------------
// Property 27: Match Start Timestamp
// Validates: Requirements 11.1
// ---------------------------------------------------------------------------

describe('Property 27: Match Start Timestamp', () => {
  /**
   * Validates: Requirements 11.1
   * For any group with an assigned match, invoking startMatch SHALL record a
   * non-null match_started_at timestamp in the DB for that group.
   */

  beforeEach(() => { db.initDb(':memory:'); });
  afterEach(() => { db.closeDb(); });

  test('startMatch sets match_started_at to a non-null value in groups_table', async () => {
    db.upsertGroup(makeGroup({ group_no: 1 }));

    // Assign a match first
    await matches.assignMatch(1, 'ROOM-001', 'pass123', null, null);

    // Verify it's null before starting
    const groupBefore = db.getGroup(1);
    assert.equal(groupBefore.match_started_at, null, 'match_started_at should be null before start');

    // Start the match
    await matches.startMatch(1, null, null);

    const groupAfter = db.getGroup(1);
    assert.ok(groupAfter.match_started_at !== null, 'match_started_at should be non-null after start');
    assert.ok(
      typeof groupAfter.match_started_at === 'string',
      'match_started_at should be a string (ISO timestamp)'
    );
  });

  test('startMatch records a valid ISO timestamp', async () => {
    db.upsertGroup(makeGroup({ group_no: 1 }));
    await matches.assignMatch(1, 'ROOM-001', 'pass123', null, null);

    const before = Date.now();
    await matches.startMatch(1, null, null);
    const after = Date.now();

    const group = db.getGroup(1);
    const ts = new Date(group.match_started_at).getTime();

    assert.ok(!isNaN(ts), 'match_started_at should be a parseable date');
    assert.ok(ts >= before, 'timestamp should be >= time before call');
    assert.ok(ts <= after, 'timestamp should be <= time after call');
  });

  test('startMatch also updates started_at in the matches table', async () => {
    db.upsertGroup(makeGroup({ group_no: 1 }));
    await matches.assignMatch(1, 'ROOM-001', 'pass123', null, null);

    const matchBefore = db.getLatestMatchForGroup(1);
    assert.equal(matchBefore.started_at, null, 'started_at should be null before start');

    await matches.startMatch(1, null, null);

    const matchAfter = db.getLatestMatchForGroup(1);
    assert.ok(matchAfter.started_at !== null, 'started_at should be non-null after start');
  });

  test('property: for any group, match_started_at is non-null after startMatch', async () => {
    // Test with multiple groups
    const groupNos = [1, 2, 3];

    for (const groupNo of groupNos) {
      db.upsertGroup(makeGroup({ group_no: groupNo }));
      await matches.assignMatch(groupNo, `ROOM-${groupNo}`, `pass${groupNo}`, null, null);
      await matches.startMatch(groupNo, null, null);

      const group = db.getGroup(groupNo);
      assert.ok(
        group.match_started_at !== null,
        `Group ${groupNo} should have non-null match_started_at`
      );
    }
  });

  test('startMatch sends DM to all group players when client is provided', async () => {
    const squad = makeSquad({ squad_no: 1, group_no: 1 });
    db.insertSquad(squad);
    db.upsertGroup(makeGroup({ group_no: 1, squad_ids: [squad.squad_id] }));
    await matches.assignMatch(1, 'ROOM-001', 'pass123', null, null);

    const dmsSent = [];
    const mockClient = {
      users: {
        fetch: async (id) => ({
          id,
          send: async (payload) => {
            dmsSent.push({ userId: id, payload });
          },
        }),
      },
      channels: {
        fetch: async () => ({
          isTextBased: () => true,
          send: async () => {},
        }),
      },
    };

    await matches.startMatch(1, null, mockClient);

    assert.ok(dmsSent.length > 0, 'DMs should have been sent when match starts');
    assert.equal(
      dmsSent.length,
      squad.player_ids.length,
      'DM count should match number of players in the group'
    );
  });
});

// ---------------------------------------------------------------------------
// Property 28: Winner Declaration Persistence
// Validates: Requirements 12.2
// ---------------------------------------------------------------------------

describe('Property 28: Winner Declaration Persistence', () => {
  /**
   * Validates: Requirements 12.2
   * For any valid squad ID and position, invoking declareWinner SHALL update
   * the squad record in the DB with the winner position.
   */

  beforeEach(() => { db.initDb(':memory:'); });
  afterEach(() => { db.closeDb(); });

  test('declareWinner stores winner_position in the squad record', async () => {
    const squad = makeSquad({ squad_no: 1, group_no: 1 });
    db.insertSquad(squad);
    db.upsertGroup(makeGroup({ group_no: 1, squad_ids: [squad.squad_id] }));
    await matches.assignMatch(1, 'ROOM-001', 'pass123', null, null);

    // Verify winner_position is null before declaration
    const squadBefore = db.getSquadById(squad.squad_id);
    assert.equal(squadBefore.winner_position, null, 'winner_position should be null before declaration');

    await matches.declareWinner(squad.squad_id, 1, null, null);

    const squadAfter = db.getSquadById(squad.squad_id);
    assert.equal(squadAfter.winner_position, 1, 'winner_position should be 1 after declaration');
  });

  test('declareWinner stores winner_squad_id in the match record', async () => {
    const squad = makeSquad({ squad_no: 1, group_no: 1 });
    db.insertSquad(squad);
    db.upsertGroup(makeGroup({ group_no: 1, squad_ids: [squad.squad_id] }));
    await matches.assignMatch(1, 'ROOM-001', 'pass123', null, null);

    const matchBefore = db.getLatestMatchForGroup(1);
    assert.equal(matchBefore.winner_squad_id, null, 'winner_squad_id should be null before declaration');

    await matches.declareWinner(squad.squad_id, 1, null, null);

    const matchAfter = db.getLatestMatchForGroup(1);
    assert.equal(
      matchAfter.winner_squad_id,
      squad.squad_id,
      'winner_squad_id should be set to the winning squad ID'
    );
  });

  test('declareWinner persists different positions correctly', async () => {
    const positions = [1, 2, 3, 4];

    for (const position of positions) {
      // Re-init DB for each iteration to avoid conflicts
      db.closeDb();
      db.initDb(':memory:');

      const squad = makeSquad({ squad_no: 1, group_no: 1 });
      db.insertSquad(squad);
      db.upsertGroup(makeGroup({ group_no: 1, squad_ids: [squad.squad_id] }));
      await matches.assignMatch(1, 'ROOM-001', 'pass123', null, null);

      await matches.declareWinner(squad.squad_id, position, null, null);

      const stored = db.getSquadById(squad.squad_id);
      assert.equal(
        stored.winner_position,
        position,
        `winner_position should be ${position}`
      );
    }
  });

  test('property: for any squad and position, winner_position is stored in DB after declareWinner', async () => {
    // Test with multiple squads in different groups
    const testCases = [
      { squadNo: 1, groupNo: 1, position: 1 },
      { squadNo: 13, groupNo: 2, position: 2 },
      { squadNo: 25, groupNo: 3, position: 3 },
    ];

    for (const tc of testCases) {
      const squad = makeSquad({ squad_no: tc.squadNo, group_no: tc.groupNo });
      db.insertSquad(squad);
      db.upsertGroup(makeGroup({ group_no: tc.groupNo, squad_ids: [squad.squad_id] }));
      await matches.assignMatch(tc.groupNo, `ROOM-${tc.groupNo}`, `pass${tc.groupNo}`, null, null);

      await matches.declareWinner(squad.squad_id, tc.position, null, null);

      const stored = db.getSquadById(squad.squad_id);
      assert.equal(
        stored.winner_position,
        tc.position,
        `Squad ${squad.squad_id} should have winner_position = ${tc.position}`
      );
    }
  });

  test('declareWinner posts winner embed to group channel when guild is provided', async () => {
    const squad = makeSquad({ squad_no: 1, group_no: 1 });
    db.insertSquad(squad);
    db.upsertGroup(makeGroup({ group_no: 1, squad_ids: [squad.squad_id], channel_id: 'ch-group-1' }));
    await matches.assignMatch(1, 'ROOM-001', 'pass123', null, null);

    const { guild, sentMessages } = makeMockGuild({ channelId: 'ch-group-1' });

    await matches.declareWinner(squad.squad_id, 1, guild, null);

    assert.ok(sentMessages.length > 0, 'Winner embed should be posted to group channel');
  });

  test('declareWinner sends DM to winning squad players when client is provided', async () => {
    const squad = makeSquad({ squad_no: 1, group_no: 1 });
    db.insertSquad(squad);
    db.upsertGroup(makeGroup({ group_no: 1, squad_ids: [squad.squad_id] }));
    await matches.assignMatch(1, 'ROOM-001', 'pass123', null, null);

    const dmsSent = [];
    const mockClient = {
      users: {
        fetch: async (id) => ({
          id,
          send: async (payload) => {
            dmsSent.push({ userId: id, payload });
          },
        }),
      },
      channels: {
        fetch: async () => ({
          isTextBased: () => true,
          send: async () => {},
        }),
      },
    };

    await matches.declareWinner(squad.squad_id, 1, null, mockClient);

    assert.ok(dmsSent.length > 0, 'DMs should be sent to winning squad players');
    assert.equal(
      dmsSent.length,
      squad.player_ids.length,
      'DM count should match number of players in the winning squad'
    );
  });

  test('declareWinner is a no-op for non-existent squad', async () => {
    // Should not throw, just log an error
    await assert.doesNotReject(
      () => matches.declareWinner('SSE-9999', 1, null, null),
      'declareWinner with non-existent squad should not throw'
    );
  });
});
