'use strict';

/**
 * Tests for handlers/registration.js
 *
 * Property 5:  Duplicate Player Detection       - Validates: Requirements 2.1
 * Property 6:  Invalid Registration Isolation   - Validates: Requirements 2.4
 * Property 7:  Registration Lock Enforcement    - Validates: Requirements 2.5
 * Property 8:  Registered Role Assignment       - Validates: Requirements 3.2
 * Property 11: VC Counter Accuracy              - Validates: Requirements 3.7, 23.1
 * Property 12: Squad ID Format                  - Validates: Requirements 3.8
 * Property 18: Registration Uniqueness          - Validates: Requirements 2.1
 * Property 40: Confirmed Squad Embed Content    - Validates: Requirements 24.1
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database/db');
const reg = require('./registration');
const embedBuilder = require('../utils/embedBuilder');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSquad(overrides = {}) {
  const squadNo = overrides.squad_no ?? 1;
  return {
    squad_id: overrides.squad_id ?? db.generateSquadId(squadNo),
    squad_no: squadNo,
    team_name: overrides.team_name ?? 'Test Team',
    leader_id: overrides.leader_id ?? '100000000000000001',
    player_ids: overrides.player_ids ?? ['100000000000000001', '100000000000000002'],
    player_uids: overrides.player_uids ?? {},
    group_no: null,
    registration_msg_id: overrides.registration_msg_id ?? '200000000000000001',
    registration_channel_id: '1502217324059431064',
    confirmed_msg_id: null,
    group_msg_id: null,
    registered_at: new Date().toISOString(),
    status: overrides.status ?? 'active',
    winner_position: null,
  };
}

function makePlayer(overrides = {}) {
  return {
    discord_id: overrides.discord_id ?? '100000000000000001',
    squad_id: overrides.squad_id ?? 'SSE-0001',
    game_uid: overrides.game_uid ?? null,
    role: overrides.role ?? 'player',
    warnings: 0,
    is_muted: 0,
  };
}

/**
 * Build a minimal mock Discord message object.
 */
function makeMockMessage(overrides = {}) {
  const reactions = [];
  const channelMessages = [];
  const roleAssignments = {};   // playerId -> [roleId]
  const vcNames = [];
  const dmsSent = [];

  const guild = overrides.guild ?? {
    id: '1502217324059431064',
    client: {
      users: {
        fetch: async (id) => ({
          id,
          send: async (payload) => { dmsSent.push({ userId: id, payload }); },
        }),
      },
      channels: {
        fetch: async (id) => {
          if (id === reg.VC_COUNTER_CHANNEL_ID) {
            return {
              setName: async (name) => { vcNames.push(name); },
            };
          }
          if (id === reg.CONFIRMED_SQUADS_CHANNEL_ID) {
            return {
              send: async (payload) => {
                channelMessages.push(payload);
                return { id: '999999999999999999' };
              },
            };
          }
          return null;
        },
      },
    },
    channels: {
      fetch: async (id) => {
        if (id === reg.VC_COUNTER_CHANNEL_ID) {
          return {
            setName: async (name) => { vcNames.push(name); },
          };
        }
        if (id === reg.CONFIRMED_SQUADS_CHANNEL_ID) {
          return {
            send: async (payload) => {
              channelMessages.push(payload);
              return { id: '999999999999999999' };
            },
          };
        }
        return null;
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
        },
      }),
    },
  };

  return {
    id: overrides.id ?? '300000000000000001',
    channelId: overrides.channelId ?? reg.REGISTRATION_CHANNEL_ID,
    content: overrides.content ?? 'Team Name: Test Team <@100000000000000001> <@100000000000000002>',
    author: { bot: false, id: overrides.authorId ?? '100000000000000001' },
    url: overrides.url ?? 'https://discord.com/channels/123/456/789',
    guild,
    channel: {
      send: async (payload) => { channelMessages.push(payload); return { id: '888888888888888888' }; },
    },
    react: async (emoji) => { reactions.push(emoji); },
    // Expose for assertions
    _reactions: reactions,
    _channelMessages: channelMessages,
    _roleAssignments: roleAssignments,
    _vcNames: vcNames,
    _dmsSent: dmsSent,
  };
}

// ---------------------------------------------------------------------------
// Property 12: Squad ID Format
// Validates: Requirements 3.8
// ---------------------------------------------------------------------------

describe('Property 12: Squad ID Format', () => {
  test('squad 1 generates SSE-0001', () => {
    assert.equal(reg.generateSquadId(1), 'SSE-0001');
  });

  test('squad 42 generates SSE-0042', () => {
    assert.equal(reg.generateSquadId(42), 'SSE-0042');
  });

  test('squad 999 generates SSE-0999', () => {
    assert.equal(reg.generateSquadId(999), 'SSE-0999');
  });

  test('squad 1000 generates SSE-1000', () => {
    assert.equal(reg.generateSquadId(1000), 'SSE-1000');
  });

  test('squad 1 through 9999 all match SSE-XXXX format', () => {
    const samples = [1, 2, 10, 99, 100, 999, 1000, 9999];
    for (const n of samples) {
      const id = reg.generateSquadId(n);
      assert.match(id, /^SSE-\d{4}$/, `Squad ${n} should produce SSE-XXXX format`);
    }
  });
});

// ---------------------------------------------------------------------------
// Property 5: Duplicate Player Detection
// Validates: Requirements 2.1
// ---------------------------------------------------------------------------

describe('Property 5: Duplicate Player Detection', () => {
  beforeEach(() => { db.initDb(':memory:'); });
  afterEach(() => { db.closeDb(); });

  test('player already in active squad is detected as duplicate', () => {
    const sharedPlayerId = '111111111111111111';
    const squad = makeSquad({ squad_no: 1, player_ids: [sharedPlayerId, '222222222222222222'] });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: sharedPlayerId, squad_id: squad.squad_id, role: 'leader' }));
    db.insertPlayer(makePlayer({ discord_id: '222222222222222222', squad_id: squad.squad_id, role: 'player' }));

    const result = reg.checkDuplicate([sharedPlayerId, '333333333333333333']);
    assert.ok(result, 'Should detect duplicate');
    assert.equal(result.playerId, sharedPlayerId);
    assert.equal(result.existingSquadId, squad.squad_id);
  });

  test('player not in any active squad returns null', () => {
    const result = reg.checkDuplicate(['999999999999999999', '888888888888888888']);
    assert.equal(result, null, 'No duplicate should be found for unregistered players');
  });

  test('register squad A with player P, then squad B with player P detects duplicate', () => {
    const playerP = '555555555555555555';
    const squadA = makeSquad({ squad_no: 1, player_ids: [playerP, '666666666666666666'] });
    db.insertSquad(squadA);
    db.insertPlayer(makePlayer({ discord_id: playerP, squad_id: squadA.squad_id, role: 'leader' }));
    db.insertPlayer(makePlayer({ discord_id: '666666666666666666', squad_id: squadA.squad_id, role: 'player' }));

    // Attempt to register squad B with player P
    const result = reg.checkDuplicate([playerP, '777777777777777777']);
    assert.ok(result, 'Duplicate should be detected');
    assert.equal(result.playerId, playerP, 'Duplicate player ID should match');
    assert.equal(result.existingSquadId, squadA.squad_id, 'Existing squad ID should match squad A');
  });

  test('cancelled squad membership does not trigger duplicate', () => {
    const playerId = '444444444444444444';
    const cancelledSquad = makeSquad({
      squad_no: 1,
      player_ids: [playerId, '555555555555555555'],
      status: 'cancelled',
    });
    db.insertSquad(cancelledSquad);
    db.insertPlayer(makePlayer({ discord_id: playerId, squad_id: cancelledSquad.squad_id, role: 'leader' }));

    // Player was in a cancelled squad — should NOT be a duplicate
    const result = reg.checkDuplicate([playerId, '666666666666666666']);
    assert.equal(result, null, 'Cancelled squad membership should not count as duplicate');
  });
});

// ---------------------------------------------------------------------------
// Property 18: Registration Uniqueness
// Validates: Requirements 2.1
// ---------------------------------------------------------------------------

describe('Property 18: Registration Uniqueness', () => {
  beforeEach(() => { db.initDb(':memory:'); });
  afterEach(() => { db.closeDb(); });

  test('after multiple registrations, each player appears in at most one active squad', () => {
    // Register 3 squads with distinct players
    const squads = [
      { no: 1, players: ['101', '102', '103'] },
      { no: 2, players: ['201', '202'] },
      { no: 3, players: ['301', '302', '303', '304'] },
    ];

    for (const s of squads) {
      const squad = makeSquad({ squad_no: s.no, player_ids: s.players });
      db.insertSquad(squad);
      s.players.forEach((pid, i) => {
        db.insertPlayer(makePlayer({ discord_id: pid, squad_id: squad.squad_id, role: i === 0 ? 'leader' : 'player' }));
      });
    }

    // Verify each player appears in at most one active squad
    const allPlayers = db.getDb().prepare(
      "SELECT p.discord_id, p.squad_id FROM players p JOIN squads s ON p.squad_id = s.squad_id WHERE s.status = 'active'"
    ).all();

    const playerSquadMap = {};
    for (const row of allPlayers) {
      if (playerSquadMap[row.discord_id]) {
        assert.fail(`Player ${row.discord_id} appears in multiple active squads`);
      }
      playerSquadMap[row.discord_id] = row.squad_id;
    }

    // All good — each player in exactly one active squad
    assert.ok(true, 'Each player appears in at most one active squad');
  });

  test('duplicate detection prevents a player from joining two active squads', () => {
    const sharedPlayer = '999999999999999999';
    const squad1 = makeSquad({ squad_no: 1, player_ids: [sharedPlayer, '888888888888888888'] });
    db.insertSquad(squad1);
    db.insertPlayer(makePlayer({ discord_id: sharedPlayer, squad_id: squad1.squad_id, role: 'leader' }));
    db.insertPlayer(makePlayer({ discord_id: '888888888888888888', squad_id: squad1.squad_id, role: 'player' }));

    // Attempt to add shared player to squad 2
    const dup = reg.checkDuplicate([sharedPlayer, '777777777777777777']);
    assert.ok(dup, 'Duplicate should be detected, preventing double registration');

    // Verify DB still only has one active squad for this player
    const active = db.getActivePlayerSquad(sharedPlayer);
    assert.equal(active.squad_id, squad1.squad_id, 'Player should still only be in squad 1');
  });
});

// ---------------------------------------------------------------------------
// Property 6: Invalid Registration Isolation
// Validates: Requirements 2.4
// ---------------------------------------------------------------------------

describe('Property 6: Invalid Registration Isolation', () => {
  beforeEach(() => { db.initDb(':memory:'); });
  afterEach(() => { db.closeDb(); });

  test('invalid message (no team name) causes no DB writes', async () => {
    const message = makeMockMessage({
      content: '<@100000000000000001> <@100000000000000002>',  // no team name
    });

    await reg.handleRegistrationMessage(message);

    const squads = db.getAllSquads();
    assert.equal(squads.length, 0, 'No squads should be written to DB for invalid registration');
    assert.ok(
      message._reactions.includes(reg.EMOJI_CROSS),
      'Should react with cross emoji for invalid registration'
    );
  });

  test('invalid message (only 1 player) causes no DB writes', async () => {
    const message = makeMockMessage({
      content: 'Team Name: Solo Team <@100000000000000001>',  // only 1 player
    });

    await reg.handleRegistrationMessage(message);

    const squads = db.getAllSquads();
    assert.equal(squads.length, 0, 'No squads should be written to DB for single-player registration');
    assert.ok(
      message._reactions.includes(reg.EMOJI_CROSS),
      'Should react with cross emoji'
    );
  });

  test('invalid message causes no role assignments', async () => {
    const message = makeMockMessage({
      content: 'no team name here just mentions <@100000000000000001>',
    });

    await reg.handleRegistrationMessage(message);

    const roleAssignments = message._roleAssignments;
    assert.equal(
      Object.keys(roleAssignments).length,
      0,
      'No roles should be assigned for invalid registration'
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: Registration Lock Enforcement
// Validates: Requirements 2.5
// ---------------------------------------------------------------------------

describe('Property 7: Registration Lock Enforcement', () => {
  beforeEach(() => { db.initDb(':memory:'); });
  afterEach(() => { db.closeDb(); });

  test('locked registration rejects valid message without processing', async () => {
    db.setSetting('registration_locked', '1');

    const message = makeMockMessage({
      content: 'Team Name: Locked Team <@100000000000000001> <@100000000000000002>',
    });

    await reg.handleRegistrationMessage(message);

    // Should react with cross
    assert.ok(
      message._reactions.includes(reg.EMOJI_CROSS),
      'Should react with cross when locked'
    );

    // No DB writes
    const squads = db.getAllSquads();
    assert.equal(squads.length, 0, 'No squads should be written when registration is locked');
  });

  test('unlocked registration processes normally', async () => {
    db.setSetting('registration_locked', '0');

    const message = makeMockMessage({
      content: 'Team Name: Open Team <@100000000000000001> <@100000000000000002>',
    });

    await reg.handleRegistrationMessage(message);

    // Should react with tick
    assert.ok(
      message._reactions.includes(reg.EMOJI_TICK),
      'Should react with tick when unlocked and valid'
    );

    const squads = db.getAllSquads();
    assert.equal(squads.length, 1, 'Squad should be written when registration is unlocked');
  });

  test('registration_locked=1 rejects even with valid format', async () => {
    db.setSetting('registration_locked', '1');

    const message = makeMockMessage({
      content: 'Team: Champions <@111111111111111111> <@222222222222222222> <@333333333333333333>',
    });

    await reg.handleRegistrationMessage(message);

    assert.ok(message._reactions.includes(reg.EMOJI_CROSS), 'Should be rejected with cross');
    assert.equal(db.getAllSquads().length, 0, 'No squad should be created');
  });
});

// ---------------------------------------------------------------------------
// Property 8: Registered Role Assignment
// Validates: Requirements 3.2
// ---------------------------------------------------------------------------

describe('Property 8: Registered Role Assignment', () => {
  beforeEach(() => { db.initDb(':memory:'); });
  afterEach(() => { db.closeDb(); });

  test('all players in a confirmed registration receive the Registered_Role', async () => {
    const playerIds = ['111111111111111111', '222222222222222222', '333333333333333333'];
    const message = makeMockMessage({
      content: `Team Name: Role Test Team <@${playerIds[0]}> <@${playerIds[1]}> <@${playerIds[2]}>`,
    });

    await reg.handleRegistrationMessage(message);

    // Verify each player got the registered role
    for (const pid of playerIds) {
      const assignedRoles = message._roleAssignments[pid] ?? [];
      assert.ok(
        assignedRoles.includes(reg.REGISTERED_ROLE_ID),
        `Player ${pid} should have been assigned Registered_Role`
      );
    }
  });

  test('confirmRegistration assigns role to all players', async () => {
    const playerIds = ['444444444444444444', '555555555555555555'];
    const parsed = {
      valid: true,
      teamName: 'Direct Confirm Team',
      players: playerIds,
      uids: {},
    };

    const message = makeMockMessage({ content: 'dummy' });
    await reg.confirmRegistration(message, parsed, message.guild);

    for (const pid of playerIds) {
      const assignedRoles = message._roleAssignments[pid] ?? [];
      assert.ok(
        assignedRoles.includes(reg.REGISTERED_ROLE_ID),
        `Player ${pid} should have Registered_Role after confirmRegistration`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Property 11: VC Counter Accuracy
// Validates: Requirements 3.7, 23.1
// ---------------------------------------------------------------------------

describe('Property 11: VC Counter Accuracy', () => {
  beforeEach(() => { db.initDb(':memory:'); });
  afterEach(() => { db.closeDb(); });

  test('VC counter reflects number of active squads after registrations', async () => {
    const vcNames = [];
    const guild = {
      id: 'test-guild',
      client: {
        users: { fetch: async (id) => ({ id, send: async () => {} }) },
        channels: { fetch: async () => null },
      },
      channels: {
        fetch: async (id) => {
          if (id === reg.VC_COUNTER_CHANNEL_ID) {
            return { setName: async (name) => { vcNames.push(name); } };
          }
          if (id === reg.CONFIRMED_SQUADS_CHANNEL_ID) {
            return { send: async () => ({ id: '999' }) };
          }
          return null;
        },
      },
      members: {
        fetch: async (id) => ({ id, roles: { add: async () => {} } }),
      },
    };

    // Register 3 squads
    for (let i = 0; i < 3; i++) {
      const p1 = `${100 + i}00000000000000001`;
      const p2 = `${100 + i}00000000000000002`;
      const msg = {
        id: `msg${i}`,
        channelId: reg.REGISTRATION_CHANNEL_ID,
        content: `Team Name: Squad ${i} <@${p1}> <@${p2}>`,
        author: { bot: false, id: p1 },
        url: `https://discord.com/channels/1/2/${i}`,
        guild,
        channel: { send: async () => ({ id: '888' }) },
        react: async () => {},
        _reactions: [],
        _channelMessages: [],
        _roleAssignments: {},
        _vcNames: vcNames,
        _dmsSent: [],
      };
      await reg.handleRegistrationMessage(msg);
    }

    // After 3 registrations, VC counter should show 3
    const lastVcName = vcNames[vcNames.length - 1];
    assert.ok(lastVcName, 'VC counter should have been updated');
    assert.ok(lastVcName.includes('3'), `VC counter should show 3, got: ${lastVcName}`);

    // Cancel one squad
    const squads = db.getAllActiveSquads();
    db.updateSquadStatus(squads[0].squad_id, 'cancelled');

    // Update VC counter manually
    await reg.updateVcCounter(guild);

    const updatedVcName = vcNames[vcNames.length - 1];
    assert.ok(updatedVcName.includes('2'), `VC counter should show 2 after cancellation, got: ${updatedVcName}`);
  });

  test('updateVcCounter sets channel name with active squad count', async () => {
    // Insert 5 active squads directly
    for (let i = 1; i <= 5; i++) {
      db.insertSquad(makeSquad({ squad_no: i, player_ids: [`${i}00000000000000001`, `${i}00000000000000002`] }));
    }

    const vcNames = [];
    const guild = {
      channels: {
        fetch: async (id) => {
          if (id === reg.VC_COUNTER_CHANNEL_ID) {
            return { setName: async (name) => { vcNames.push(name); } };
          }
          return null;
        },
      },
    };

    await reg.updateVcCounter(guild);

    assert.equal(vcNames.length, 1, 'setName should be called once');
    assert.ok(vcNames[0].includes('5'), `VC counter should show 5, got: ${vcNames[0]}`);
  });
});

// ---------------------------------------------------------------------------
// Property 40: Confirmed Squad Embed Content
// Validates: Requirements 24.1
// ---------------------------------------------------------------------------

describe('Property 40: Confirmed Squad Embed Content', () => {
  test('buildRegistrationConfirmedEmbed contains squad ID, team name, leader mention, player mentions, jump URL', () => {
    const squad = {
      squad_id: 'SSE-0007',
      squad_no: 7,
      team_name: 'Embed Test Team',
      leader_id: '111111111111111111',
      player_ids: ['111111111111111111', '222222222222222222', '333333333333333333'],
      player_uids: {},
    };
    const jumpUrl = 'https://discord.com/channels/123/456/789';

    const embed = embedBuilder.buildRegistrationConfirmedEmbed(squad, jumpUrl);
    const data = embed.toJSON();

    // Check title
    assert.ok(data.title, 'Embed should have a title');

    // Check fields contain squad ID
    const allFieldValues = data.fields.map((f) => f.value).join(' ');
    const allFieldNames = data.fields.map((f) => f.name).join(' ');
    const allText = allFieldValues + ' ' + allFieldNames + ' ' + (data.description || '');

    assert.ok(
      allText.includes('SSE-0007'),
      'Embed should contain squad ID SSE-0007'
    );
    assert.ok(
      allText.includes('Embed Test Team'),
      'Embed should contain team name'
    );
    assert.ok(
      allText.includes('<@111111111111111111>'),
      'Embed should contain leader mention'
    );
    assert.ok(
      allText.includes('<@222222222222222222>'),
      'Embed should contain player 2 mention'
    );
    assert.ok(
      allText.includes('<@333333333333333333>'),
      'Embed should contain player 3 mention'
    );
    assert.ok(
      allText.includes(jumpUrl),
      'Embed should contain jump URL'
    );
  });

  test('confirmed embed is posted to confirmed squads channel on valid registration', async () => {
    db.initDb(':memory:');
    try {
      const channelMessages = [];
      const message = makeMockMessage({
        content: 'Team Name: Embed Channel Test <@100000000000000001> <@200000000000000002>',
      });
      // Override channel send to capture
      message.guild.channels.fetch = async (id) => {
        if (id === reg.CONFIRMED_SQUADS_CHANNEL_ID) {
          return {
            send: async (payload) => {
              channelMessages.push(payload);
              return { id: '999999999999999999' };
            },
          };
        }
        if (id === reg.VC_COUNTER_CHANNEL_ID) {
          return { setName: async () => {} };
        }
        return null;
      };

      await reg.handleRegistrationMessage(message);

      assert.ok(channelMessages.length > 0, 'Confirmed embed should be posted to confirmed squads channel');
      const sentEmbed = channelMessages[0].embeds?.[0];
      assert.ok(sentEmbed, 'Embed should be present in the sent message');
    } finally {
      db.closeDb();
    }
  });
});

// ---------------------------------------------------------------------------
// Integration: handleRegistrationMessage full flow
// ---------------------------------------------------------------------------

describe('handleRegistrationMessage integration', () => {
  beforeEach(() => { db.initDb(':memory:'); });
  afterEach(() => { db.closeDb(); });

  test('valid registration reacts with tick and persists squad', async () => {
    const message = makeMockMessage({
      content: 'Team Name: Integration Team <@100000000000000001> <@200000000000000002>',
    });

    await reg.handleRegistrationMessage(message);

    assert.ok(message._reactions.includes(reg.EMOJI_TICK), 'Should react with tick');
    const squads = db.getAllActiveSquads();
    assert.equal(squads.length, 1, 'One squad should be persisted');
    assert.equal(squads[0].team_name, 'Integration Team');
  });

  test('duplicate registration reacts with cross and sends duplicate embed', async () => {
    const sharedPlayer = '111111111111111111';
    // Pre-register squad with shared player
    const squad = makeSquad({ squad_no: 1, player_ids: [sharedPlayer, '222222222222222222'] });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: sharedPlayer, squad_id: squad.squad_id, role: 'leader' }));
    db.insertPlayer(makePlayer({ discord_id: '222222222222222222', squad_id: squad.squad_id, role: 'player' }));

    const message = makeMockMessage({
      content: `Team Name: Duplicate Team <@${sharedPlayer}> <@333333333333333333>`,
    });

    await reg.handleRegistrationMessage(message);

    assert.ok(message._reactions.includes(reg.EMOJI_CROSS), 'Should react with cross for duplicate');
    // Should have sent a duplicate embed to the channel
    assert.ok(message._channelMessages.length > 0, 'Should send duplicate embed to channel');
  });

  test('message in wrong channel is ignored', async () => {
    const message = makeMockMessage({
      channelId: '9999999999999999999',  // wrong channel
      content: 'Team Name: Wrong Channel <@100000000000000001> <@200000000000000002>',
    });

    await reg.handleRegistrationMessage(message);

    assert.equal(message._reactions.length, 0, 'Should not react to messages in wrong channel');
    assert.equal(db.getAllSquads().length, 0, 'Should not process messages in wrong channel');
  });

  test('bot messages are ignored', async () => {
    const message = makeMockMessage({
      content: 'Team Name: Bot Team <@100000000000000001> <@200000000000000002>',
    });
    message.author.bot = true;

    await reg.handleRegistrationMessage(message);

    assert.equal(message._reactions.length, 0, 'Should not react to bot messages');
    assert.equal(db.getAllSquads().length, 0, 'Should not process bot messages');
  });
});
