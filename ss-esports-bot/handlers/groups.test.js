'use strict';

/**
 * Tests for handlers/groups.js
 *
 * Property 13: Group Assignment Formula        - Validates: Requirements 4.1
 * Property 14: Group Role Assignment           - Validates: Requirements 4.4
 * Property 15: Group Persistence               - Validates: Requirements 4.6
 * Property 16: Group Capacity Invariant        - Validates: Requirements 4.7
 * Property 17: Group Membership Uniqueness     - Validates: Requirements 4.8
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database/db');
const groups = require('./groups');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    group_no: overrides.group_no ?? null,
    registration_msg_id: null,
    registration_channel_id: '1502217324059431064',
    confirmed_msg_id: null,
    group_msg_id: null,
    registered_at: new Date().toISOString(),
    status: overrides.status ?? 'active',
    winner_position: null,
  };
}

/**
 * Build a mock Discord guild that tracks role assignments and channel creation.
 * @param {Object} opts
 * @returns {{ guild, roleAssignments, roleRevocations, createdChannels, createdRoles }}
 */
function makeMockGuild(opts = {}) {
  const roleAssignments = {};   // playerId -> [roleId]
  const roleRevocations = {};   // playerId -> [roleId]
  const createdChannels = [];
  const createdRoles = [];
  const channelMessages = [];

  // Pre-existing channels and roles (optional)
  const existingChannels = opts.existingChannels ?? [];
  const existingRoles = opts.existingRoles ?? [];

  const guild = {
    id: 'mock-guild-id',
    channels: {
      cache: {
        find: (fn) => existingChannels.find(fn) ?? null,
      },
      fetch: async (id) => {
        const found = existingChannels.find((c) => c.id === id);
        return found ?? null;
      },
      create: async (options) => {
        const ch = {
          id: `ch-${options.name}-${Date.now()}`,
          name: options.name,
          parentId: options.parent ?? null,
          messages: {
            fetch: async () => { throw new Error('Message not found'); },
          },
          send: async (payload) => {
            channelMessages.push({ channelName: options.name, payload });
            return { id: `msg-${Date.now()}` };
          },
        };
        createdChannels.push(ch);
        existingChannels.push(ch);
        return ch;
      },
    },
    roles: {
      cache: {
        find: (fn) => existingRoles.find(fn) ?? null,
      },
      create: async (options) => {
        const role = {
          id: `role-${options.name}-${Date.now()}`,
          name: options.name,
        };
        createdRoles.push(role);
        existingRoles.push(role);
        return role;
      },
    },
    members: {
      fetch: async (id) => ({
        id,
        roles: {
          add: async (roleId) => {
            if (!roleAssignments[id]) roleAssignments[id] = [];
            roleAssignments[id].push(roleId);
          },
          remove: async (roleId) => {
            if (!roleRevocations[id]) roleRevocations[id] = [];
            roleRevocations[id].push(roleId);
          },
        },
      }),
    },
  };

  return { guild, roleAssignments, roleRevocations, createdChannels, createdRoles, channelMessages };
}

// ---------------------------------------------------------------------------
// Property 13: Group Assignment Formula
// Validates: Requirements 4.1
// ---------------------------------------------------------------------------

describe('Property 13: Group Assignment Formula', () => {
  /**
   * Validates: Requirements 4.1
   * For any squad number N, the assigned group number SHALL be Math.ceil(N / 12).
   */

  test('squad numbers 1-12 are assigned to group 1', () => {
    for (let n = 1; n <= 12; n++) {
      const expected = 1;
      const actual = Math.ceil(n / 12);
      assert.equal(actual, expected, `Squad ${n} should be in group 1`);
    }
  });

  test('squad numbers 13-24 are assigned to group 2', () => {
    for (let n = 13; n <= 24; n++) {
      const expected = 2;
      const actual = Math.ceil(n / 12);
      assert.equal(actual, expected, `Squad ${n} should be in group 2`);
    }
  });

  test('squad numbers 25-36 are assigned to group 3', () => {
    for (let n = 25; n <= 36; n++) {
      const expected = 3;
      const actual = Math.ceil(n / 12);
      assert.equal(actual, expected, `Squad ${n} should be in group 3`);
    }
  });

  test('boundary values: squad 12 → group 1, squad 13 → group 2', () => {
    assert.equal(Math.ceil(12 / 12), 1, 'Squad 12 should be in group 1');
    assert.equal(Math.ceil(13 / 12), 2, 'Squad 13 should be in group 2');
  });

  test('boundary values: squad 24 → group 2, squad 25 → group 3', () => {
    assert.equal(Math.ceil(24 / 12), 2, 'Squad 24 should be in group 2');
    assert.equal(Math.ceil(25 / 12), 3, 'Squad 25 should be in group 3');
  });

  test('assignSquadToGroup uses Math.ceil(squad_no / 12) formula', async () => {
    db.initDb(':memory:');
    try {
      const testCases = [
        { squadNo: 1, expectedGroup: 1 },
        { squadNo: 12, expectedGroup: 1 },
        { squadNo: 13, expectedGroup: 2 },
        { squadNo: 24, expectedGroup: 2 },
        { squadNo: 25, expectedGroup: 3 },
      ];

      for (const tc of testCases) {
        const { guild } = makeMockGuild();
        const squad = makeSquad({ squad_no: tc.squadNo });
        db.insertSquad(squad);

        const groupNo = await groups.assignSquadToGroup(squad, guild);
        assert.equal(
          groupNo,
          tc.expectedGroup,
          `Squad ${tc.squadNo} should be assigned to group ${tc.expectedGroup}, got ${groupNo}`
        );

        // Clean up for next iteration
        db.closeDb();
        db.initDb(':memory:');
      }
    } finally {
      db.closeDb();
    }
  });
});

// ---------------------------------------------------------------------------
// Property 14: Group Role Assignment
// Validates: Requirements 4.4
// ---------------------------------------------------------------------------

describe('Property 14: Group Role Assignment', () => {
  /**
   * Validates: Requirements 4.4
   * For any squad assigned to a group, all player IDs in the squad SHALL be
   * assigned the group role corresponding to that group number.
   */

  beforeEach(() => { db.initDb(':memory:'); });
  afterEach(() => { db.closeDb(); });

  test('all players in a squad receive the group role after assignment', async () => {
    const playerIds = ['111111111111111111', '222222222222222222', '333333333333333333'];
    const squad = makeSquad({ squad_no: 1, player_ids: playerIds });
    db.insertSquad(squad);

    const { guild, roleAssignments, createdRoles } = makeMockGuild();

    await groups.assignSquadToGroup(squad, guild);

    // A role should have been created
    assert.ok(createdRoles.length > 0, 'A group role should have been created');
    const groupRole = createdRoles[0];

    // All players should have the group role
    for (const pid of playerIds) {
      const assigned = roleAssignments[pid] ?? [];
      assert.ok(
        assigned.includes(groupRole.id),
        `Player ${pid} should have been assigned group role ${groupRole.id}`
      );
    }
  });

  test('squad with 2 players — both receive group role', async () => {
    const playerIds = ['444444444444444444', '555555555555555555'];
    const squad = makeSquad({ squad_no: 5, player_ids: playerIds });
    db.insertSquad(squad);

    const { guild, roleAssignments, createdRoles } = makeMockGuild();

    await groups.assignSquadToGroup(squad, guild);

    const groupRole = createdRoles[0];
    assert.ok(groupRole, 'Group role should be created');

    for (const pid of playerIds) {
      const assigned = roleAssignments[pid] ?? [];
      assert.ok(
        assigned.includes(groupRole.id),
        `Player ${pid} should have group role`
      );
    }
  });

  test('assignGroupRole assigns role to all specified players', async () => {
    const playerIds = ['666666666666666666', '777777777777777777'];
    const { guild, roleAssignments } = makeMockGuild();
    const roleId = 'test-role-id-123';

    // Manually add the role to the guild's role cache
    guild.roles.cache.find = (fn) => {
      const mockRole = { id: roleId, name: 'Group 1' };
      return fn(mockRole) ? mockRole : null;
    };

    await groups.assignGroupRole(guild, playerIds, roleId);

    for (const pid of playerIds) {
      const assigned = roleAssignments[pid] ?? [];
      assert.ok(
        assigned.includes(roleId),
        `Player ${pid} should have been assigned role ${roleId}`
      );
    }
  });

  test('group role name follows "Group {groupNo}" pattern', async () => {
    const squad = makeSquad({ squad_no: 7 });
    db.insertSquad(squad);

    const { guild, createdRoles } = makeMockGuild();

    await groups.assignSquadToGroup(squad, guild);

    const groupRole = createdRoles.find((r) => r.name === 'Group 1');
    assert.ok(groupRole, 'Role should be named "Group 1" for squad_no 7 (group 1)');
  });

  test('group role name for group 2 is "Group 2"', async () => {
    const squad = makeSquad({ squad_no: 13 }); // group 2
    db.insertSquad(squad);

    const { guild, createdRoles } = makeMockGuild();

    await groups.assignSquadToGroup(squad, guild);

    const groupRole = createdRoles.find((r) => r.name === 'Group 2');
    assert.ok(groupRole, 'Role should be named "Group 2" for squad_no 13 (group 2)');
  });
});

// ---------------------------------------------------------------------------
// Property 15: Group Persistence
// Validates: Requirements 4.6
// ---------------------------------------------------------------------------

describe('Property 15: Group Persistence', () => {
  /**
   * Validates: Requirements 4.6
   * For any squad assigned to a group, querying the DB for the squad ID SHALL
   * return a record with the correct group number.
   */

  beforeEach(() => { db.initDb(':memory:'); });
  afterEach(() => { db.closeDb(); });

  test('squad record has correct group_no after assignment', async () => {
    const squad = makeSquad({ squad_no: 1 });
    db.insertSquad(squad);

    const { guild } = makeMockGuild();
    await groups.assignSquadToGroup(squad, guild);

    const stored = db.getSquadById(squad.squad_id);
    assert.ok(stored, 'Squad should exist in DB');
    assert.equal(stored.group_no, 1, 'Squad should have group_no = 1');
  });

  test('squad 13 is persisted with group_no = 2', async () => {
    const squad = makeSquad({ squad_no: 13 });
    db.insertSquad(squad);

    const { guild } = makeMockGuild();
    await groups.assignSquadToGroup(squad, guild);

    const stored = db.getSquadById(squad.squad_id);
    assert.equal(stored.group_no, 2, 'Squad 13 should have group_no = 2');
  });

  test('group record is created in DB with correct channel_id and role_id', async () => {
    const squad = makeSquad({ squad_no: 5 });
    db.insertSquad(squad);

    const { guild, createdChannels, createdRoles } = makeMockGuild();
    await groups.assignSquadToGroup(squad, guild);

    const group = db.getGroup(1);
    assert.ok(group, 'Group record should exist in DB');
    assert.equal(group.group_no, 1, 'Group number should be 1');
    assert.ok(group.channel_id, 'Group should have a channel_id');
    assert.ok(group.role_id, 'Group should have a role_id');

    // Verify the IDs match what was created
    if (createdChannels.length > 0) {
      assert.equal(group.channel_id, createdChannels[0].id, 'channel_id should match created channel');
    }
    if (createdRoles.length > 0) {
      assert.equal(group.role_id, createdRoles[0].id, 'role_id should match created role');
    }
  });

  test('group record contains the squad_id after assignment', async () => {
    const squad = makeSquad({ squad_no: 3 });
    db.insertSquad(squad);

    const { guild } = makeMockGuild();
    await groups.assignSquadToGroup(squad, guild);

    const group = db.getGroup(1);
    assert.ok(group, 'Group record should exist');
    assert.ok(
      group.squad_ids.includes(squad.squad_id),
      `Group should contain squad ${squad.squad_id}`
    );
  });

  test('multiple squads in same group are all persisted', async () => {
    const squads = [
      makeSquad({ squad_no: 1 }),
      makeSquad({ squad_no: 2 }),
      makeSquad({ squad_no: 3 }),
    ];

    for (const s of squads) {
      db.insertSquad(s);
    }

    const { guild } = makeMockGuild();

    for (const s of squads) {
      await groups.assignSquadToGroup(s, guild);
    }

    const group = db.getGroup(1);
    assert.ok(group, 'Group 1 should exist');
    assert.equal(group.squad_ids.length, 3, 'Group 1 should have 3 squads');

    for (const s of squads) {
      const stored = db.getSquadById(s.squad_id);
      assert.equal(stored.group_no, 1, `Squad ${s.squad_id} should have group_no = 1`);
    }
  });
});

// ---------------------------------------------------------------------------
// Property 16: Group Capacity Invariant
// Validates: Requirements 4.7
// ---------------------------------------------------------------------------

describe('Property 16: Group Capacity Invariant', () => {
  /**
   * Validates: Requirements 4.7
   * No group SHALL ever contain more than 12 active squads.
   * Test: Register 25 squads → verify group 1 has 12, group 2 has 12, group 3 has 1
   */

  beforeEach(() => { db.initDb(':memory:'); });
  afterEach(() => { db.closeDb(); });

  test('25 squads: group 1 has 12, group 2 has 12, group 3 has 1', async () => {
    const { guild } = makeMockGuild();

    // Register 25 squads
    for (let i = 1; i <= 25; i++) {
      const squad = makeSquad({
        squad_no: i,
        player_ids: [`${i}00000000000000001`, `${i}00000000000000002`],
      });
      db.insertSquad(squad);
      await groups.assignSquadToGroup(squad, guild);
    }

    const group1 = db.getGroup(1);
    const group2 = db.getGroup(2);
    const group3 = db.getGroup(3);

    assert.ok(group1, 'Group 1 should exist');
    assert.ok(group2, 'Group 2 should exist');
    assert.ok(group3, 'Group 3 should exist');

    assert.equal(group1.squad_ids.length, 12, 'Group 1 should have exactly 12 squads');
    assert.equal(group2.squad_ids.length, 12, 'Group 2 should have exactly 12 squads');
    assert.equal(group3.squad_ids.length, 1, 'Group 3 should have exactly 1 squad');
  });

  test('12 squads all go to group 1', async () => {
    const { guild } = makeMockGuild();

    for (let i = 1; i <= 12; i++) {
      const squad = makeSquad({
        squad_no: i,
        player_ids: [`${i}00000000000000001`, `${i}00000000000000002`],
      });
      db.insertSquad(squad);
      await groups.assignSquadToGroup(squad, guild);
    }

    const group1 = db.getGroup(1);
    assert.equal(group1.squad_ids.length, 12, 'Group 1 should have 12 squads');

    // Group 2 should not exist
    const group2 = db.getGroup(2);
    assert.equal(group2, null, 'Group 2 should not exist with only 12 squads');
  });

  test('squad 13 creates group 2', async () => {
    const { guild } = makeMockGuild();

    for (let i = 1; i <= 13; i++) {
      const squad = makeSquad({
        squad_no: i,
        player_ids: [`${i}00000000000000001`, `${i}00000000000000002`],
      });
      db.insertSquad(squad);
      await groups.assignSquadToGroup(squad, guild);
    }

    const group1 = db.getGroup(1);
    const group2 = db.getGroup(2);

    assert.equal(group1.squad_ids.length, 12, 'Group 1 should have 12 squads');
    assert.ok(group2, 'Group 2 should exist after squad 13');
    assert.equal(group2.squad_ids.length, 1, 'Group 2 should have 1 squad');
  });

  test('no group ever exceeds 12 squads across 36 registrations', async () => {
    const { guild } = makeMockGuild();

    for (let i = 1; i <= 36; i++) {
      const squad = makeSquad({
        squad_no: i,
        player_ids: [`${i}00000000000000001`, `${i}00000000000000002`],
      });
      db.insertSquad(squad);
      await groups.assignSquadToGroup(squad, guild);
    }

    const allGroups = db.getAllGroups();
    for (const group of allGroups) {
      assert.ok(
        group.squad_ids.length <= 12,
        `Group ${group.group_no} has ${group.squad_ids.length} squads, exceeds 12`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Property 17: Group Membership Uniqueness
// Validates: Requirements 4.8
// ---------------------------------------------------------------------------

describe('Property 17: Group Membership Uniqueness', () => {
  /**
   * Validates: Requirements 4.8
   * For any active squad in the DB, that squad SHALL belong to exactly one group.
   */

  beforeEach(() => { db.initDb(':memory:'); });
  afterEach(() => { db.closeDb(); });

  test('each active squad belongs to exactly one group after registration', async () => {
    const { guild } = makeMockGuild();

    // Register 15 squads (spans 2 groups)
    for (let i = 1; i <= 15; i++) {
      const squad = makeSquad({
        squad_no: i,
        player_ids: [`${i}00000000000000001`, `${i}00000000000000002`],
      });
      db.insertSquad(squad);
      await groups.assignSquadToGroup(squad, guild);
    }

    // Verify each active squad has exactly one group_no
    const activeSquads = db.getAllActiveSquads();
    for (const squad of activeSquads) {
      assert.ok(
        squad.group_no != null,
        `Squad ${squad.squad_id} should have a group_no assigned`
      );
    }

    // Verify no squad appears in multiple groups
    const allGroups = db.getAllGroups();
    const squadGroupMap = {};
    for (const group of allGroups) {
      for (const squadId of group.squad_ids) {
        if (squadGroupMap[squadId] !== undefined) {
          assert.fail(
            `Squad ${squadId} appears in both group ${squadGroupMap[squadId]} and group ${group.group_no}`
          );
        }
        squadGroupMap[squadId] = group.group_no;
      }
    }

    assert.ok(true, 'Each squad belongs to exactly one group');
  });

  test('squad group_no matches the group it appears in', async () => {
    const { guild } = makeMockGuild();

    for (let i = 1; i <= 5; i++) {
      const squad = makeSquad({
        squad_no: i,
        player_ids: [`${i}00000000000000001`, `${i}00000000000000002`],
      });
      db.insertSquad(squad);
      await groups.assignSquadToGroup(squad, guild);
    }

    const activeSquads = db.getAllActiveSquads();
    for (const squad of activeSquads) {
      const group = db.getGroup(squad.group_no);
      assert.ok(group, `Group ${squad.group_no} should exist for squad ${squad.squad_id}`);
      assert.ok(
        group.squad_ids.includes(squad.squad_id),
        `Squad ${squad.squad_id} should appear in group ${squad.group_no}'s squad_ids`
      );
    }
  });

  test('after removing a squad, it no longer appears in any group', async () => {
    const { guild } = makeMockGuild();

    const squad = makeSquad({ squad_no: 1 });
    db.insertSquad(squad);
    await groups.assignSquadToGroup(squad, guild);

    // Verify it's in group 1
    let group = db.getGroup(1);
    assert.ok(group.squad_ids.includes(squad.squad_id), 'Squad should be in group 1');

    // Remove squad from group
    await groups.removeSquadFromGroup(squad.squad_id, guild);

    // Verify it's no longer in any group
    group = db.getGroup(1);
    assert.ok(
      !group.squad_ids.includes(squad.squad_id),
      'Squad should no longer be in group 1 after removal'
    );

    // Verify squad's group_no is cleared
    const updatedSquad = db.getSquadById(squad.squad_id);
    assert.equal(updatedSquad.group_no, null, 'Squad group_no should be null after removal');
  });
});

// ---------------------------------------------------------------------------
// Additional: removeSquadFromGroup behavior
// ---------------------------------------------------------------------------

describe('removeSquadFromGroup', () => {
  beforeEach(() => { db.initDb(':memory:'); });
  afterEach(() => { db.closeDb(); });

  test('revokes group role from all squad players on removal', async () => {
    const playerIds = ['111111111111111111', '222222222222222222'];
    const squad = makeSquad({ squad_no: 1, player_ids: playerIds });
    db.insertSquad(squad);

    const { guild, roleRevocations, createdRoles } = makeMockGuild();

    // First assign to group
    await groups.assignSquadToGroup(squad, guild);
    const groupRole = createdRoles[0];
    assert.ok(groupRole, 'Group role should have been created');

    // Now remove from group
    await groups.removeSquadFromGroup(squad.squad_id, guild);

    // Verify role was revoked from all players
    for (const pid of playerIds) {
      const revoked = roleRevocations[pid] ?? [];
      assert.ok(
        revoked.includes(groupRole.id),
        `Player ${pid} should have had group role revoked`
      );
    }
  });

  test('squad with no group_no is a no-op', async () => {
    const squad = makeSquad({ squad_no: 1, group_no: null });
    db.insertSquad(squad);

    const { guild, roleRevocations } = makeMockGuild();

    // Should not throw
    await groups.removeSquadFromGroup(squad.squad_id, guild);

    // No revocations should have happened
    assert.equal(Object.keys(roleRevocations).length, 0, 'No role revocations for squad with no group');
  });
});

// ---------------------------------------------------------------------------
// Additional: getOrCreateGroupChannel behavior
// ---------------------------------------------------------------------------

describe('getOrCreateGroupChannel', () => {
  beforeEach(() => { db.initDb(':memory:'); });
  afterEach(() => { db.closeDb(); });

  test('creates channel named "group-{groupNo}"', async () => {
    const { guild, createdChannels } = makeMockGuild();

    await groups.getOrCreateGroupChannel(1, guild);

    assert.ok(createdChannels.length > 0, 'A channel should have been created');
    assert.equal(createdChannels[0].name, 'group-1', 'Channel should be named "group-1"');
  });

  test('creates role named "Group {groupNo}"', async () => {
    const { guild, createdRoles } = makeMockGuild();

    await groups.getOrCreateGroupChannel(3, guild);

    assert.ok(createdRoles.length > 0, 'A role should have been created');
    assert.equal(createdRoles[0].name, 'Group 3', 'Role should be named "Group 3"');
  });

  test('reuses existing channel and role if they already exist', async () => {
    const existingChannel = {
      id: 'existing-channel-id',
      name: 'group-2',
      parentId: groups.GROUP_CATEGORY_ID,
      messages: { fetch: async () => { throw new Error('not found'); } },
      send: async () => ({ id: 'msg-id' }),
    };
    const existingRole = {
      id: 'existing-role-id',
      name: 'Group 2',
    };

    const { guild, createdChannels, createdRoles } = makeMockGuild({
      existingChannels: [existingChannel],
      existingRoles: [existingRole],
    });

    const result = await groups.getOrCreateGroupChannel(2, guild);

    assert.equal(result.channel.id, existingChannel.id, 'Should reuse existing channel');
    assert.equal(result.role.id, existingRole.id, 'Should reuse existing role');
    assert.equal(createdChannels.length, 0, 'Should not create a new channel');
    assert.equal(createdRoles.length, 0, 'Should not create a new role');
  });

  test('returns null channel and role when guild is null', async () => {
    const result = await groups.getOrCreateGroupChannel(1, null);
    assert.equal(result.channel, null, 'Channel should be null when guild is null');
    assert.equal(result.role, null, 'Role should be null when guild is null');
  });
});
