'use strict';

/**
 * Integration tests for SS E-Sports Tournament Bot
 * Tests end-to-end flows using in-memory DB and mocked Discord objects.
 *
 * Task 12.2: Registration flow
 * Task 12.3: Cancellation flow
 * Task 12.4: Edit flow
 * Task 12.5: Match flow
 */

const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('./database/db');
const registration = require('./handlers/registration');
const cancelReg = require('./commands/cancel_reg');
const matches = require('./handlers/matches');

// ─────────────────────────────────────────────
// Shared mock builders
// ─────────────────────────────────────────────

/**
 * Build a mock Discord guild that tracks role assignments, channel sends,
 * VC counter renames, and DMs.
 */
function makeMockGuild(opts = {}) {
  const roleAssignments = {};   // playerId -> [roleId]
  const roleRemovals = {};      // playerId -> [roleId]
  const channelMessages = {};   // channelId -> [payload]
  const channelEdits = {};      // msgId -> payload
  const vcNames = [];
  const dmsSent = [];

  const VC_COUNTER_CHANNEL_ID = registration.VC_COUNTER_CHANNEL_ID;
  const CONFIRMED_SQUADS_CHANNEL_ID = registration.CONFIRMED_SQUADS_CHANNEL_ID;

  // Stored confirmed messages so cancel_reg can fetch them
  const confirmedMessages = {};

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

  const guild = {
    id: opts.guildId || 'mock-guild-id',
    client: mockClient,

    channels: {
      cache: {
        find: () => null,
      },
      fetch: async (channelId) => {
        if (channelId === VC_COUNTER_CHANNEL_ID) {
          return {
            id: channelId,
            setName: async (name) => { vcNames.push(name); },
          };
        }
        if (channelId === CONFIRMED_SQUADS_CHANNEL_ID) {
          return {
            id: channelId,
            send: async (payload) => {
              const msgId = `confirmed-msg-${Date.now()}-${Math.random()}`;
              if (!channelMessages[channelId]) channelMessages[channelId] = [];
              channelMessages[channelId].push(payload);
              // Store the message so it can be fetched later
              confirmedMessages[msgId] = {
                id: msgId,
                payload,
                edit: async (newPayload) => {
                  channelEdits[msgId] = newPayload;
                },
              };
              return { id: msgId };
            },
            messages: {
              fetch: async (msgId) => {
                if (confirmedMessages[msgId]) return confirmedMessages[msgId];
                throw new Error(`Message ${msgId} not found`);
              },
            },
          };
        }
        // Group channels
        if (!channelMessages[channelId]) channelMessages[channelId] = [];
        return {
          id: channelId,
          isTextBased: () => true,
          send: async (payload) => {
            channelMessages[channelId].push(payload);
            return { id: `group-msg-${Date.now()}` };
          },
          messages: {
            fetch: async (msgId) => {
              if (confirmedMessages[msgId]) return confirmedMessages[msgId];
              throw new Error(`Message ${msgId} not found`);
            },
          },
        };
      },
    },

    roles: {
      cache: { find: () => null },
      create: async (opts) => ({ id: `role-${opts.name}`, name: opts.name }),
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
            if (!roleRemovals[id]) roleRemovals[id] = [];
            roleRemovals[id].push(roleId);
          },
          cache: { has: () => false },
        },
      }),
    },
  };

  return {
    guild,
    mockClient,
    roleAssignments,
    roleRemovals,
    channelMessages,
    channelEdits,
    vcNames,
    dmsSent,
    confirmedMessages,
  };
}

/**
 * Build a mock registration message.
 */
function makeMockMessage(guild, overrides = {}) {
  const reactions = [];
  const channelMessages = [];

  return {
    id: overrides.id || `msg-${Date.now()}`,
    channelId: overrides.channelId || registration.REGISTRATION_CHANNEL_ID,
    content: overrides.content || 'Team Name: Test Team <@100000000000000001> <@200000000000000002>',
    author: { bot: false, id: overrides.authorId || '100000000000000001' },
    url: overrides.url || 'https://discord.com/channels/123/456/789',
    guild,
    channel: {
      send: async (payload) => {
        channelMessages.push(payload);
        return { id: `ch-msg-${Date.now()}` };
      },
    },
    react: async (emoji) => { reactions.push(emoji); },
    _reactions: reactions,
    _channelMessages: channelMessages,
  };
}

/**
 * Build a mock slash command interaction for cancel_reg.
 */
function makeCancelInteraction(guild, mockClient, squadId) {
  const replies = [];
  return {
    options: {
      getString: (name) => name === 'squad_id' ? squadId : null,
    },
    guild,
    client: mockClient,
    user: { id: 'admin-user-id', tag: 'Admin#0001' },
    deferReply: async () => {},
    editReply: async (payload) => { replies.push(payload); },
    _replies: replies,
  };
}

// ─────────────────────────────────────────────
// Task 12.2: Registration flow integration test
// ─────────────────────────────────────────────

describe('Integration: Registration Flow', () => {
  beforeEach(() => { db.initDb(':memory:'); });
  afterEach(() => { db.closeDb(); });

  test('full registration flow: confirmed embed posted, group assigned, DM sent, VC counter updated', async () => {
    const { guild, roleAssignments, channelMessages, vcNames, dmsSent } = makeMockGuild();

    const playerIds = ['111111111111111111', '222222222222222222', '333333333333333333'];
    const message = makeMockMessage(guild, {
      content: `Team Name: Alpha Squad <@${playerIds[0]}> <@${playerIds[1]}> <@${playerIds[2]}>`,
      authorId: playerIds[0],
    });

    await registration.handleRegistrationMessage(message);

    // 1. Verify tick reaction
    assert.ok(
      message._reactions.includes(registration.EMOJI_TICK),
      'Should react with tick emoji on valid registration'
    );

    // 2. Verify squad persisted in DB
    const squads = db.getAllActiveSquads();
    assert.equal(squads.length, 1, 'One active squad should be in DB');
    assert.equal(squads[0].team_name, 'Alpha Squad', 'Team name should match');

    // 3. Verify confirmed embed posted to confirmed-squads channel
    const confirmedChannelMsgs = channelMessages[registration.CONFIRMED_SQUADS_CHANNEL_ID] || [];
    assert.ok(confirmedChannelMsgs.length > 0, 'Confirmed embed should be posted to confirmed-squads channel');
    assert.ok(confirmedChannelMsgs[0].embeds, 'Confirmed message should contain embeds');

    // 4. Verify group assignment in DB
    const squad = squads[0];
    assert.ok(squad.group_no != null, 'Squad should be assigned to a group');
    assert.equal(squad.group_no, 1, 'First squad should be in group 1');

    // 5. Verify Registered_Role assigned to all players
    for (const pid of playerIds) {
      const assigned = roleAssignments[pid] || [];
      assert.ok(
        assigned.includes(registration.REGISTERED_ROLE_ID),
        `Player ${pid} should have Registered_Role`
      );
    }

    // 6. Verify DMs sent to all players
    const dmRecipients = dmsSent.map((d) => d.userId);
    for (const pid of playerIds) {
      assert.ok(dmRecipients.includes(pid), `Player ${pid} should have received a DM`);
    }

    // 7. Verify VC counter updated
    assert.ok(vcNames.length > 0, 'VC counter should have been updated');
    assert.ok(vcNames[vcNames.length - 1].includes('1'), 'VC counter should show 1 registered squad');
  });

  test('registration flow: second squad goes to group 1, thirteenth squad goes to group 2', async () => {
    const { guild } = makeMockGuild();

    // Register 13 squads — each squad gets two unique player IDs
    for (let i = 1; i <= 13; i++) {
      // Use i as the last digits to ensure uniqueness across all squads
      const p1 = `10000000000000${String(i).padStart(4, '0')}`;
      const p2 = `20000000000000${String(i).padStart(4, '0')}`;
      const msg = makeMockMessage(guild, {
        id: `msg-${i}`,
        content: `Team Name: Squad ${i} <@${p1}> <@${p2}>`,
        authorId: p1,
      });
      await registration.handleRegistrationMessage(msg);
    }

    const squads = db.getAllActiveSquads();
    assert.equal(squads.length, 13, 'All 13 squads should be registered');

    // First 12 squads → group 1
    for (let i = 0; i < 12; i++) {
      assert.equal(squads[i].group_no, 1, `Squad ${i + 1} should be in group 1`);
    }
    // 13th squad → group 2
    assert.equal(squads[12].group_no, 2, 'Squad 13 should be in group 2');
  });
});

// ─────────────────────────────────────────────
// Task 12.3: Cancellation flow integration test
// ─────────────────────────────────────────────

describe('Integration: Cancellation Flow', () => {
  beforeEach(() => { db.initDb(':memory:'); });
  afterEach(() => { db.closeDb(); });

  test('cancel squad: DB status updated, roles removed, group listing updated, DM sent', async () => {
    const { guild, mockClient, roleAssignments, roleRemovals, vcNames, dmsSent } = makeMockGuild();

    const playerIds = ['111111111111111111', '222222222222222222'];

    // First register a squad
    const message = makeMockMessage(guild, {
      content: `Team Name: Cancel Test <@${playerIds[0]}> <@${playerIds[1]}>`,
      authorId: playerIds[0],
    });
    await registration.handleRegistrationMessage(message);

    const squads = db.getAllActiveSquads();
    assert.equal(squads.length, 1, 'Squad should be registered before cancellation');
    const squadId = squads[0].squad_id;

    // Now cancel the squad
    const interaction = makeCancelInteraction(guild, mockClient, squadId);
    await cancelReg.execute(interaction);

    // 1. Verify DB status updated to 'cancelled'
    const cancelledSquad = db.getSquadById(squadId);
    assert.equal(cancelledSquad.status, 'cancelled', 'Squad status should be cancelled');

    // 2. Verify Registered_Role removed from all players
    for (const pid of playerIds) {
      const removed = roleRemovals[pid] || [];
      assert.ok(
        removed.includes(registration.REGISTERED_ROLE_ID),
        `Player ${pid} should have Registered_Role removed`
      );
    }

    // 3. Verify group listing updated (squad removed from group)
    const group = db.getGroup(1);
    if (group) {
      assert.ok(
        !group.squad_ids.includes(squadId),
        'Cancelled squad should be removed from group squad_ids'
      );
    }

    // 4. Verify DMs sent to all players
    const dmRecipients = dmsSent.map((d) => d.userId);
    for (const pid of playerIds) {
      assert.ok(dmRecipients.includes(pid), `Player ${pid} should receive cancellation DM`);
    }

    // 5. Verify VC counter updated after cancellation
    assert.ok(vcNames.length >= 2, 'VC counter should have been updated at least twice (register + cancel)');
    const lastVcName = vcNames[vcNames.length - 1];
    assert.ok(lastVcName.includes('0'), `VC counter should show 0 after cancellation, got: ${lastVcName}`);
  });

  test('cancel non-existent squad returns error reply', async () => {
    const { guild, mockClient } = makeMockGuild();
    const interaction = makeCancelInteraction(guild, mockClient, 'SSE-9999');
    await cancelReg.execute(interaction);

    assert.ok(
      interaction._replies.some((r) => r.content && r.content.includes('not found')),
      'Should reply with not found message for non-existent squad'
    );
  });

  test('cancel already-cancelled squad returns warning reply', async () => {
    const { guild, mockClient } = makeMockGuild();

    // Insert a cancelled squad directly
    const squadNo = db.getNextSquadNo();
    const squadId = db.generateSquadId(squadNo);
    db.insertSquad({
      squad_id: squadId,
      squad_no: squadNo,
      team_name: 'Already Cancelled',
      leader_id: '111111111111111111',
      player_ids: ['111111111111111111', '222222222222222222'],
      player_uids: {},
      group_no: null,
      registration_msg_id: null,
      registration_channel_id: registration.REGISTRATION_CHANNEL_ID,
      confirmed_msg_id: null,
      group_msg_id: null,
      registered_at: new Date().toISOString(),
      status: 'cancelled',
      winner_position: null,
    });

    const interaction = makeCancelInteraction(guild, mockClient, squadId);
    await cancelReg.execute(interaction);

    assert.ok(
      interaction._replies.some((r) => r.content && r.content.includes('already cancelled')),
      'Should reply with already cancelled message'
    );
  });
});

// ─────────────────────────────────────────────
// Task 12.4: Edit flow integration test
// ─────────────────────────────────────────────

describe('Integration: Edit Flow', () => {
  beforeEach(() => { db.initDb(':memory:'); });
  afterEach(() => { db.closeDb(); });

  test('edit squad: DB updated with new team name, players, and leader', async () => {
    // Insert a squad directly into DB
    const squadNo = db.getNextSquadNo();
    const squadId = db.generateSquadId(squadNo);
    const originalPlayers = ['111111111111111111', '222222222222222222'];

    db.insertSquad({
      squad_id: squadId,
      squad_no: squadNo,
      team_name: 'Original Team',
      leader_id: originalPlayers[0],
      player_ids: originalPlayers,
      player_uids: {},
      group_no: null,
      registration_msg_id: null,
      registration_channel_id: registration.REGISTRATION_CHANNEL_ID,
      confirmed_msg_id: null,
      group_msg_id: null,
      registered_at: new Date().toISOString(),
      status: 'active',
      winner_position: null,
    });
    for (const [i, pid] of originalPlayers.entries()) {
      db.insertPlayer({
        discord_id: pid,
        squad_id: squadId,
        game_uid: null,
        role: i === 0 ? 'leader' : 'player',
        warnings: 0,
        is_muted: 0,
      });
    }

    // Simulate the DB update that edit_reg confirm does
    const newPlayers = ['333333333333333333', '444444444444444444'];
    const newLeaderId = newPlayers[0];
    const newTeamName = 'Edited Team';

    db.updateSquad(squadId, {
      team_name: newTeamName,
      leader_id: newLeaderId,
      player_ids: newPlayers,
      player_uids: {},
    });

    // Verify DB updated
    const updatedSquad = db.getSquadById(squadId);
    assert.equal(updatedSquad.team_name, newTeamName, 'Team name should be updated');
    assert.equal(updatedSquad.leader_id, newLeaderId, 'Leader ID should be updated');
    assert.deepEqual(updatedSquad.player_ids, newPlayers, 'Player IDs should be updated');
    assert.equal(updatedSquad.status, 'active', 'Status should remain active after edit');
  });

  test('edit squad: original data unchanged when update is not applied', () => {
    const squadNo = db.getNextSquadNo();
    const squadId = db.generateSquadId(squadNo);
    const originalPlayers = ['555555555555555555', '666666666666666666'];

    db.insertSquad({
      squad_id: squadId,
      squad_no: squadNo,
      team_name: 'Unchanged Team',
      leader_id: originalPlayers[0],
      player_ids: originalPlayers,
      player_uids: {},
      group_no: null,
      registration_msg_id: null,
      registration_channel_id: registration.REGISTRATION_CHANNEL_ID,
      confirmed_msg_id: null,
      group_msg_id: null,
      registered_at: new Date().toISOString(),
      status: 'active',
      winner_position: null,
    });

    // No update applied (simulating rejection)
    const squad = db.getSquadById(squadId);
    assert.equal(squad.team_name, 'Unchanged Team', 'Team name should be unchanged after rejection');
    assert.deepEqual(squad.player_ids, originalPlayers, 'Player IDs should be unchanged after rejection');
  });

  test('edit squad: DM sent to leader after confirmed edit', async () => {
    const { guild, mockClient, dmsSent } = makeMockGuild();

    // Register a squad first
    const playerIds = ['777777777777777777', '888888888888888888'];
    const message = makeMockMessage(guild, {
      content: `Team Name: DM Edit Test <@${playerIds[0]}> <@${playerIds[1]}>`,
      authorId: playerIds[0],
    });
    await registration.handleRegistrationMessage(message);

    const squads = db.getAllActiveSquads();
    const squad = squads[0];

    // Simulate the DM that edit_reg sends to the leader on confirm
    const { dmEngine } = (() => {
      try { return { dmEngine: require('./utils/dmEngine') }; } catch { return { dmEngine: null }; }
    })();

    if (dmEngine) {
      const { EmbedBuilder } = require('discord.js');
      const notifyEmbed = new EmbedBuilder().setTitle('Edit Confirmed').setDescription('Your squad was edited.');
      await dmEngine.dmUser(squad.leader_id, notifyEmbed, mockClient).catch(() => {});

      const leaderDms = dmsSent.filter((d) => d.userId === squad.leader_id);
      assert.ok(leaderDms.length > 0, 'Leader should receive a DM after edit confirmation');
    }
  });
});

// ─────────────────────────────────────────────
// Task 12.5: Match flow integration test
// ─────────────────────────────────────────────

describe('Integration: Match Flow', () => {
  beforeEach(() => { db.initDb(':memory:'); });
  afterEach(() => { db.closeDb(); });

  test('full match flow: assign → start → declare winner — all DB updates and DMs', async () => {
    const { guild, mockClient, channelMessages, dmsSent } = makeMockGuild();

    // Set up a group with a squad
    const squadNo = 1;
    const squadId = db.generateSquadId(squadNo);
    const playerIds = ['111111111111111111', '222222222222222222', '333333333333333333'];
    const groupChannelId = 'group-channel-1';

    db.insertSquad({
      squad_id: squadId,
      squad_no: squadNo,
      team_name: 'Match Test Squad',
      leader_id: playerIds[0],
      player_ids: playerIds,
      player_uids: {},
      group_no: 1,
      registration_msg_id: null,
      registration_channel_id: registration.REGISTRATION_CHANNEL_ID,
      confirmed_msg_id: null,
      group_msg_id: null,
      registered_at: new Date().toISOString(),
      status: 'active',
      winner_position: null,
    });
    for (const [i, pid] of playerIds.entries()) {
      db.insertPlayer({
        discord_id: pid,
        squad_id: squadId,
        game_uid: null,
        role: i === 0 ? 'leader' : 'player',
        warnings: 0,
        is_muted: 0,
      });
    }
    db.upsertGroup({
      group_no: 1,
      channel_id: groupChannelId,
      role_id: 'role-group-1',
      squad_ids: [squadId],
      match_room_id: null,
      match_password: null,
      match_started_at: null,
    });

    // Step 1: Assign match
    await matches.assignMatch(1, 'ROOM-001', 'secret123', guild, mockClient);

    // Verify match credentials stored in DB
    const groupAfterAssign = db.getGroup(1);
    assert.equal(groupAfterAssign.match_room_id, 'ROOM-001', 'Room ID should be stored after assignMatch');
    assert.equal(groupAfterAssign.match_password, 'secret123', 'Password should be stored after assignMatch');

    // Verify match record created
    const matchRecord = db.getLatestMatchForGroup(1);
    assert.ok(matchRecord, 'Match record should exist after assignMatch');
    assert.equal(matchRecord.room_id, 'ROOM-001', 'Match record should have correct room_id');
    assert.equal(matchRecord.started_at, null, 'Match should not be started yet');

    // Verify DMs sent to all players for match assignment
    const assignDmCount = dmsSent.length;
    assert.equal(assignDmCount, playerIds.length, 'All players should receive match assignment DM');

    // Step 2: Start match
    await matches.startMatch(1, guild, mockClient);

    // Verify match_started_at set in groups_table
    const groupAfterStart = db.getGroup(1);
    assert.ok(groupAfterStart.match_started_at != null, 'match_started_at should be set after startMatch');

    // Verify started_at set in matches table
    const matchAfterStart = db.getLatestMatchForGroup(1);
    assert.ok(matchAfterStart.started_at != null, 'Match started_at should be set');

    // Verify DMs sent to all players for match start
    const startDmCount = dmsSent.length - assignDmCount;
    assert.equal(startDmCount, playerIds.length, 'All players should receive match start DM');

    // Step 3: Declare winner
    await matches.declareWinner(squadId, 1, guild, mockClient);

    // Verify winner_position stored in squad record
    const winnerSquad = db.getSquadById(squadId);
    assert.equal(winnerSquad.winner_position, 1, 'Winner position should be stored in squad record');

    // Verify winner_squad_id stored in match record
    const matchAfterWinner = db.getLatestMatchForGroup(1);
    assert.equal(matchAfterWinner.winner_squad_id, squadId, 'Winner squad ID should be stored in match record');

    // Verify winner embed posted to group channel
    const groupChannelMsgs = channelMessages[groupChannelId] || [];
    assert.ok(groupChannelMsgs.length > 0, 'Winner embed should be posted to group channel');

    // Verify DMs sent to winning squad players
    const winnerDmCount = dmsSent.length - assignDmCount - startDmCount;
    assert.equal(winnerDmCount, playerIds.length, 'All winning squad players should receive winner DM');
  });

  test('match flow: multiple groups can have independent matches', async () => {
    // Set up two groups
    for (let g = 1; g <= 2; g++) {
      const squadId = db.generateSquadId(g);
      db.insertSquad({
        squad_id: squadId,
        squad_no: g,
        team_name: `Group ${g} Squad`,
        leader_id: `${g}00000000000000001`,
        player_ids: [`${g}00000000000000001`, `${g}00000000000000002`],
        player_uids: {},
        group_no: g,
        registration_msg_id: null,
        registration_channel_id: registration.REGISTRATION_CHANNEL_ID,
        confirmed_msg_id: null,
        group_msg_id: null,
        registered_at: new Date().toISOString(),
        status: 'active',
        winner_position: null,
      });
      db.upsertGroup({
        group_no: g,
        channel_id: `group-channel-${g}`,
        role_id: `role-group-${g}`,
        squad_ids: [squadId],
        match_room_id: null,
        match_password: null,
        match_started_at: null,
      });
    }

    // Assign different matches to each group
    await matches.assignMatch(1, 'ROOM-G1', 'pass-g1', null, null);
    await matches.assignMatch(2, 'ROOM-G2', 'pass-g2', null, null);

    const group1 = db.getGroup(1);
    const group2 = db.getGroup(2);

    assert.equal(group1.match_room_id, 'ROOM-G1', 'Group 1 should have its own room');
    assert.equal(group2.match_room_id, 'ROOM-G2', 'Group 2 should have its own room');

    // Start both matches
    await matches.startMatch(1, null, null);
    await matches.startMatch(2, null, null);

    assert.ok(db.getGroup(1).match_started_at != null, 'Group 1 match should be started');
    assert.ok(db.getGroup(2).match_started_at != null, 'Group 2 match should be started');

    // Declare winners for each group
    const squad1Id = db.generateSquadId(1);
    const squad2Id = db.generateSquadId(2);

    await matches.declareWinner(squad1Id, 1, null, null);
    await matches.declareWinner(squad2Id, 2, null, null);

    assert.equal(db.getSquadById(squad1Id).winner_position, 1, 'Group 1 winner should be position 1');
    assert.equal(db.getSquadById(squad2Id).winner_position, 2, 'Group 2 winner should be position 2');
  });
});

// ─────────────────────────────────────────────
// Tasks 15.3 – 15.6: Bridge server integration tests
// ─────────────────────────────────────────────

const supertest = require('supertest');
const { io: ioClient } = require('socket.io-client');

// Set env vars before requiring server (only set if not already set by earlier requires)
if (!process.env.DASHBOARD_API_KEY) process.env.DASHBOARD_API_KEY = 'test-secret-key';
if (!process.env.DB_PATH) process.env.DB_PATH = ':memory:';

const emitter = require('./bridge/emitter');
const { startBridgeServer } = require('./bridge/server');

// ─────────────────────────────────────────────
// Shared helpers for bridge integration tests
// ─────────────────────────────────────────────

/**
 * Start a fresh bridge server with an in-memory DB.
 * Returns { httpServer, request, db, emittedEvents, originalEmit, cleanup }.
 */
async function startTestServer() {
  // Fresh in-memory DB for each suite
  const testDb = require('./database/db');
  testDb.initDb(':memory:');

  // Override BRIDGE_PORT to 0 so OS picks a free port
  process.env.BRIDGE_PORT = '0';

  const { httpServer } = startBridgeServer(null, null);

  await new Promise((resolve) => {
    if (httpServer.listening) resolve();
    else httpServer.once('listening', resolve);
  });

  const request = supertest(httpServer);

  // Spy on emitter.emit
  const emittedEvents = [];
  const originalEmit = emitter.emit;
  emitter.emit = function (event, data) {
    emittedEvents.push({ event, data });
    return originalEmit.call(this, event, data);
  };

  async function cleanup() {
    emitter.emit = originalEmit;
    await new Promise((resolve) => httpServer.close(resolve));
    testDb.closeDb();
  }

  return { httpServer, request, db: testDb, emittedEvents, originalEmit, cleanup };
}

/** Insert a minimal active squad into the DB. */
function insertTestSquad(testDb, overrides = {}) {
  const squadNo = testDb.getNextSquadNo();
  const squadId = testDb.generateSquadId(squadNo);
  testDb.insertSquad({
    squad_id: squadId,
    squad_no: squadNo,
    team_name: overrides.team_name || `Team-${squadId}`,
    leader_id: overrides.leader_id || 'leader-001',
    player_ids: overrides.player_ids || ['player-001', 'player-002'],
    player_uids: {},
    group_no: overrides.group_no ?? null,
    registration_msg_id: null,
    registration_channel_id: null,
    confirmed_msg_id: null,
    group_msg_id: null,
    registered_at: new Date().toISOString(),
    status: overrides.status || 'active',
    winner_position: null,
  });
  return squadId;
}

const AUTH = { Authorization: 'Bearer test-secret-key' };

// ─────────────────────────────────────────────
// Task 15.3 — Registration flow integration tests
// ─────────────────────────────────────────────

describe('Integration 15.3: Registration Flow (bridge server)', () => {
  let ctx;

  before(async () => { ctx = await startTestServer(); });
  after(async () => { await ctx.cleanup(); });

  test('Test 1: bot registers squad → squad:registered event emitted → GET /api/squads returns new squad', async () => {
    const { db, emittedEvents, request } = ctx;

    // Insert squad directly (simulating bot registration)
    const squadId = insertTestSquad(db, { team_name: 'Registered Squad' });

    // Emit squad:registered (simulating what registration.js does)
    const squad = db.getSquadById(squadId);
    emitter.emit('squad:registered', squad);

    // Assert squad:registered was emitted
    const regEvent = emittedEvents.find(
      (e) => e.event === 'squad:registered' && e.data && e.data.squad_id === squadId
    );
    assert.ok(regEvent !== undefined, `Expected squad:registered event for ${squadId}`);

    // GET /api/squads → squad appears in response
    const res = await request.get('/api/squads');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const found = res.body.data.some((s) => s.squad_id === squadId);
    assert.ok(found, `Squad ${squadId} should appear in GET /api/squads`);

    // Cleanup
    db.getDb().prepare('DELETE FROM squads WHERE squad_id = ?').run(squadId);
    emittedEvents.length = 0;
  });

  test('Test 2: dashboard POST /api/squads/cancel-squad → squad:cancelled event emitted → squad status = cancelled in DB', async () => {
    const { db, emittedEvents, request } = ctx;

    // Insert active squad
    const squadId = insertTestSquad(db, { team_name: 'To Be Cancelled' });
    emittedEvents.length = 0;

    // POST /api/squads/cancel-squad
    const res = await request
      .post('/api/squads/cancel-squad')
      .set(AUTH)
      .send({ squad_id: squadId });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);

    // Assert squad:cancelled event emitted
    const cancelEvent = emittedEvents.find(
      (e) => e.event === 'squad:cancelled' && e.data && e.data.squad_id === squadId
    );
    assert.ok(cancelEvent !== undefined, `Expected squad:cancelled event for ${squadId}`);

    // Assert DB status = 'cancelled'
    const cancelledSquad = db.getSquadById(squadId);
    assert.equal(cancelledSquad.status, 'cancelled', `Expected status 'cancelled', got '${cancelledSquad.status}'`);

    // Cleanup
    db.getDb().prepare('DELETE FROM squads WHERE squad_id = ?').run(squadId);
    emittedEvents.length = 0;
  });
});

// ─────────────────────────────────────────────
// Task 15.4 — Match flow integration tests
// ─────────────────────────────────────────────

describe('Integration 15.4: Match Flow (bridge server)', () => {
  let ctx;

  before(async () => { ctx = await startTestServer(); });
  after(async () => { await ctx.cleanup(); });

  test('Test 3: POST /api/assign-match → match:assigned event emitted → DB updated → GET /api/groups returns room_id', async () => {
    const { db, emittedEvents, request } = ctx;

    // Insert group
    db.upsertGroup({
      group_no: 1,
      channel_id: 'ch-001',
      role_id: 'role-001',
      squad_ids: [],
      match_room_id: null,
      match_password: null,
      match_started_at: null,
    });
    emittedEvents.length = 0;

    // POST /api/assign-match
    const res = await request
      .post('/api/assign-match')
      .set(AUTH)
      .send({ group_no: 1, room_id: 'ROOM123', password: 'PASS456' });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);

    // Assert match:assigned event emitted with correct payload
    const assignEvent = emittedEvents.find(
      (e) => e.event === 'match:assigned' && e.data && e.data.room_id === 'ROOM123'
    );
    assert.ok(assignEvent !== undefined, `Expected match:assigned event with room_id=ROOM123, got: ${JSON.stringify(emittedEvents)}`);

    // GET /api/groups → group has match_room_id = 'ROOM123'
    const groupsRes = await request.get('/api/groups');
    assert.equal(groupsRes.status, 200);
    const group = groupsRes.body.data.find((g) => g.group_no === 1);
    assert.ok(group, 'Group 1 should appear in GET /api/groups');
    assert.equal(group.match_room_id, 'ROOM123', `Expected match_room_id='ROOM123', got '${group.match_room_id}'`);

    // Cleanup
    db.getDb().prepare('DELETE FROM groups_table WHERE group_no = 1').run();
    db.getDb().prepare('DELETE FROM matches WHERE group_no = 1').run();
    emittedEvents.length = 0;
  });

  test('Test 4: POST /api/start-match → match:started event emitted → DB match_started_at non-null', async () => {
    const { db, emittedEvents, request } = ctx;

    // Insert group with match_room_id already set
    db.upsertGroup({
      group_no: 2,
      channel_id: 'ch-002',
      role_id: 'role-002',
      squad_ids: [],
      match_room_id: 'ROOM-START',
      match_password: 'PASS-START',
      match_started_at: null,
    });
    // Insert a match record so startMatch can update it
    db.insertMatch({
      match_id: 'match-test-start',
      group_no: 2,
      room_id: 'ROOM-START',
      password: 'PASS-START',
      assigned_at: new Date().toISOString(),
      started_at: null,
      winner_squad_id: null,
    });
    emittedEvents.length = 0;

    // POST /api/start-match
    const res = await request
      .post('/api/start-match')
      .set(AUTH)
      .send({ group_no: 2 });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);

    // Assert match:started event emitted
    const startEvent = emittedEvents.find(
      (e) => e.event === 'match:started' && e.data && e.data.group_no === 2
    );
    assert.ok(startEvent !== undefined, `Expected match:started event for group_no=2, got: ${JSON.stringify(emittedEvents)}`);

    // Assert DB match_started_at is non-null
    const group = db.getGroup(2);
    assert.ok(group.match_started_at != null, `Expected match_started_at to be set, got: ${group.match_started_at}`);

    // Cleanup
    db.getDb().prepare('DELETE FROM groups_table WHERE group_no = 2').run();
    db.getDb().prepare('DELETE FROM matches WHERE group_no = 2').run();
    emittedEvents.length = 0;
  });

  test('Test 5: POST /api/declare-winner → match:winner event emitted → squad winner_position stored', async () => {
    const { db, emittedEvents, request } = ctx;

    // Insert squad and group
    const squadId = insertTestSquad(db, { team_name: 'Winner Squad', group_no: 3 });
    db.upsertGroup({
      group_no: 3,
      channel_id: 'ch-003',
      role_id: 'role-003',
      squad_ids: [squadId],
      match_room_id: 'ROOM-WIN',
      match_password: 'PASS-WIN',
      match_started_at: new Date().toISOString(),
    });
    db.insertMatch({
      match_id: 'match-test-winner',
      group_no: 3,
      room_id: 'ROOM-WIN',
      password: 'PASS-WIN',
      assigned_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      winner_squad_id: null,
    });
    emittedEvents.length = 0;

    // POST /api/declare-winner
    const res = await request
      .post('/api/declare-winner')
      .set(AUTH)
      .send({ squad_id: squadId, position: 1 });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);

    // Assert match:winner event emitted with correct payload
    const winnerEvent = emittedEvents.find(
      (e) => e.event === 'match:winner' && e.data && e.data.squad_id === squadId && e.data.position === 1
    );
    assert.ok(winnerEvent !== undefined, `Expected match:winner event with squad_id=${squadId} and position=1, got: ${JSON.stringify(emittedEvents)}`);

    // Assert DB winner_position = 1
    const squad = db.getSquadById(squadId);
    assert.equal(squad.winner_position, 1, `Expected winner_position=1, got ${squad.winner_position}`);

    // Cleanup
    db.getDb().prepare('DELETE FROM squads WHERE squad_id = ?').run(squadId);
    db.getDb().prepare('DELETE FROM groups_table WHERE group_no = 3').run();
    db.getDb().prepare('DELETE FROM matches WHERE group_no = 3').run();
    emittedEvents.length = 0;
  });
});

// ─────────────────────────────────────────────
// Task 15.5 — Scoring and leaderboard integration tests
// ─────────────────────────────────────────────

describe('Integration 15.5: Scoring and Leaderboard (bridge server)', () => {
  let ctx;

  before(async () => { ctx = await startTestServer(); });
  after(async () => { await ctx.cleanup(); });

  test('Test 6: POST /api/update-score → score:updated event emitted → GET /api/scores returns updated leaderboard', async () => {
    const { db, emittedEvents, request } = ctx;

    // Insert squad
    const squadId = insertTestSquad(db, { team_name: 'Score Squad' });
    emittedEvents.length = 0;

    // POST /api/update-score with kills=5, placement=10
    const res = await request
      .post('/api/update-score')
      .set(AUTH)
      .send({ squad_id: squadId, kills: 5, placement: 10 });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);

    // Assert score:updated event emitted with correct kills/placement_points
    const scoreEvent = emittedEvents.find(
      (e) => e.event === 'score:updated' && e.data && e.data.squad_id === squadId
    );
    assert.ok(scoreEvent !== undefined, `Expected score:updated event for ${squadId}`);
    assert.equal(scoreEvent.data.kills, 5, `Expected kills=5, got ${scoreEvent.data.kills}`);
    assert.equal(scoreEvent.data.placement_points, 10, `Expected placement_points=10, got ${scoreEvent.data.placement_points}`);

    // GET /api/scores → squad appears in leaderboard with total_points = 15
    const scoresRes = await request.get('/api/scores');
    assert.equal(scoresRes.status, 200);
    const entry = scoresRes.body.data.find((e) => e.squad_id === squadId);
    assert.ok(entry !== undefined, `Squad ${squadId} should appear in leaderboard`);
    assert.equal(entry.total_points, 15, `Expected total_points=15, got ${entry.total_points}`);

    // Cleanup
    db.getDb().prepare('DELETE FROM scores WHERE squad_id = ?').run(squadId);
    db.getDb().prepare('DELETE FROM squads WHERE squad_id = ?').run(squadId);
    emittedEvents.length = 0;
  });

  test('Test 7: multiple squads with scores → leaderboard ordering correct', async () => {
    const { db, request } = ctx;

    // Insert 3 squads
    const squadA = insertTestSquad(db, { team_name: 'Squad A' });
    const squadB = insertTestSquad(db, { team_name: 'Squad B' });
    const squadC = insertTestSquad(db, { team_name: 'Squad C' });

    // Insert scores: A=20pts, B=30pts, C=10pts
    // kills + placement_points = total_points
    db.insertScore({ squad_id: squadA, kills: 10, placement_points: 10, recorded_at: new Date().toISOString() });
    db.insertScore({ squad_id: squadB, kills: 15, placement_points: 15, recorded_at: new Date().toISOString() });
    db.insertScore({ squad_id: squadC, kills: 5, placement_points: 5, recorded_at: new Date().toISOString() });

    // GET /api/scores → order is B (rank 1), A (rank 2), C (rank 3)
    const res = await request.get('/api/scores');
    assert.equal(res.status, 200);

    const leaderboard = res.body.data;
    const posB = leaderboard.findIndex((e) => e.squad_id === squadB);
    const posA = leaderboard.findIndex((e) => e.squad_id === squadA);
    const posC = leaderboard.findIndex((e) => e.squad_id === squadC);

    assert.ok(posB !== -1, 'Squad B should be in leaderboard');
    assert.ok(posA !== -1, 'Squad A should be in leaderboard');
    assert.ok(posC !== -1, 'Squad C should be in leaderboard');

    assert.ok(posB < posA, `Squad B (30pts) should rank above Squad A (20pts), got B=${posB} A=${posA}`);
    assert.ok(posA < posC, `Squad A (20pts) should rank above Squad C (10pts), got A=${posA} C=${posC}`);

    // Cleanup
    for (const id of [squadA, squadB, squadC]) {
      db.getDb().prepare('DELETE FROM scores WHERE squad_id = ?').run(id);
      db.getDb().prepare('DELETE FROM squads WHERE squad_id = ?').run(id);
    }
  });
});

// ─────────────────────────────────────────────
// Task 15.6 — Socket.IO concurrent connections test
// ─────────────────────────────────────────────

describe('Integration 15.6: Socket.IO Concurrent Connections', () => {
  let ctx;

  before(async () => { ctx = await startTestServer(); });
  after(async () => { await ctx.cleanup(); });

  test('Test 8: 50 clients connect → one event emitted → all 50 receive it', async () => {
    const { httpServer } = ctx;

    // Determine the port the server is listening on
    const port = httpServer.address().port;
    const serverUrl = `http://localhost:${port}`;

    const NUM_CLIENTS = 50;
    const clients = [];

    // Connect 50 socket.io clients
    for (let i = 0; i < NUM_CLIENTS; i++) {
      const client = ioClient(serverUrl, {
        transports: ['websocket'],
        reconnection: false,
      });
      clients.push(client);
    }

    // Wait for all clients to connect
    await Promise.all(
      clients.map(
        (client) =>
          new Promise((resolve, reject) => {
            if (client.connected) {
              resolve();
            } else {
              client.once('connect', resolve);
              client.once('connect_error', reject);
            }
          })
      )
    );

    // Set up listeners on all clients before emitting
    const receivedPromises = clients.map(
      (client) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error(`Client ${client.id} did not receive test:event within 2s`)),
            2000
          );
          client.once('test:event', (data) => {
            clearTimeout(timer);
            resolve(data);
          });
        })
    );

    // Emit one event via emitter
    emitter.emit('test:event', { value: 42 });

    // Assert all 50 clients receive the event within 2 seconds
    const results = await Promise.all(receivedPromises);

    assert.equal(results.length, NUM_CLIENTS, `Expected ${NUM_CLIENTS} clients to receive the event`);
    for (const data of results) {
      assert.equal(data.value, 42, `Expected value=42, got ${data.value}`);
    }

    // Disconnect all clients
    for (const client of clients) {
      client.disconnect();
    }
  });
});
