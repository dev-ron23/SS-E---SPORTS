'use strict';

/**
 * Tests for handlers/moderation.js
 *
 * Property 31: Mute Flag Persistence              - Validates: Requirements 15.2, 15.6
 * Property 32: Warning Accumulation & Auto-Removal - Validates: Requirements 16.1, 16.4
 * Property 33: Group Removal Persistence          - Validates: Requirements 17.2
 * Property 34: AutoMod Spam Detection             - Validates: Requirements 19.1
 * Property 35: AutoMod Mention Spam Detection     - Validates: Requirements 19.2
 * Property 36: AutoMod Caps Spam Detection        - Validates: Requirements 19.3
 * Property 37: AutoMod Repeated Registration      - Validates: Requirements 19.4
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database/db');
const mod = require('./moderation');

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
    registration_channel_id: mod.REGISTRATION_CHANNEL_ID,
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
    warnings: overrides.warnings ?? 0,
    is_muted: overrides.is_muted ?? 0,
  };
}

/**
 * Build a minimal mock Discord guild.
 * Tracks timeouts applied and roles removed.
 */
function makeMockGuild(opts = {}) {
  const timeouts = {};    // userId -> durationMs
  const roleRemovals = {}; // userId -> [roleId]

  const guild = {
    id: 'mock-guild-id',
    members: {
      fetch: async (id) => ({
        id,
        timeout: async (duration) => {
          timeouts[id] = duration;
        },
        roles: {
          remove: async (roleId) => {
            if (!roleRemovals[id]) roleRemovals[id] = [];
            roleRemovals[id].push(roleId);
          },
        },
      }),
    },
    channels: {
      fetch: async () => null,
    },
  };

  return { guild, timeouts, roleRemovals };
}

/**
 * Build a minimal mock Discord client (no live connection).
 * Captures DMs sent and log channel posts.
 */
function makeMockClient() {
  const dmsSent = {};   // userId -> [embed]
  const logPosts = [];

  const client = {
    users: {
      fetch: async (id) => ({
        id,
        send: async (payload) => {
          if (!dmsSent[id]) dmsSent[id] = [];
          dmsSent[id].push(payload);
        },
      }),
    },
    channels: {
      fetch: async () => ({
        isTextBased: () => true,
        send: async (payload) => {
          logPosts.push(payload);
          return { id: 'log-msg-id' };
        },
      }),
    },
  };

  return { client, dmsSent, logPosts };
}

/**
 * Build a mock Discord message for AutoMod tests.
 */
function makeMockMessage(overrides = {}) {
  const reactions = [];
  const deleted = { value: false };

  return {
    id: overrides.id ?? 'msg-001',
    channelId: overrides.channelId ?? mod.REGISTRATION_CHANNEL_ID,
    content: overrides.content ?? '',
    author: {
      bot: overrides.bot ?? false,
      id: overrides.authorId ?? '100000000000000001',
    },
    guild: overrides.guild ?? makeMockGuild().guild,
    mentions: overrides.mentions ?? null,
    react: async (emoji) => { reactions.push(emoji); },
    delete: async () => { deleted.value = true; },
    // Expose for assertions
    _reactions: reactions,
    _deleted: deleted,
  };
}

// ---------------------------------------------------------------------------
// Property 31: Mute Flag Persistence
// Validates: Requirements 15.2, 15.6
// ---------------------------------------------------------------------------

describe('Property 31: Mute Flag Persistence', () => {
  /**
   * Validates: Requirements 15.2, 15.6
   * Muting a player SHALL set is_muted=1 in the DB.
   * Unmuting a player SHALL set is_muted=0 in the DB.
   */

  beforeEach(() => {
    db.initDb(':memory:');
    mod._resetSpamTracker();
  });
  afterEach(() => { db.closeDb(); });

  test('mutePlayer sets is_muted=1 in DB', async () => {
    const userId = '111111111111111111';
    const squadId = 'SSE-0001';

    const squad = makeSquad({ squad_no: 1, player_ids: [userId, '222222222222222222'] });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId, role: 'leader' }));

    const { guild } = makeMockGuild();
    await mod.mutePlayer(userId, guild, 'TestMod');

    const player = db.getPlayer(userId, squadId);
    assert.equal(player.is_muted, 1, 'is_muted should be 1 after mutePlayer');
  });

  test('unmutePlayer sets is_muted=0 in DB after mute', async () => {
    const userId = '111111111111111111';
    const squadId = 'SSE-0001';

    const squad = makeSquad({ squad_no: 1, player_ids: [userId, '222222222222222222'] });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId, role: 'leader', is_muted: 1 }));

    const { guild } = makeMockGuild();
    await mod.unmutePlayer(userId, guild, 'TestMod');

    const player = db.getPlayer(userId, squadId);
    assert.equal(player.is_muted, 0, 'is_muted should be 0 after unmutePlayer');
  });

  test('mute then unmute round-trip: is_muted goes 0 → 1 → 0', async () => {
    const userId = '333333333333333333';
    const squadId = 'SSE-0002';

    const squad = makeSquad({ squad_no: 2, player_ids: [userId, '444444444444444444'] });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId, role: 'leader' }));

    const { guild } = makeMockGuild();

    // Initial state
    let player = db.getPlayer(userId, squadId);
    assert.equal(player.is_muted, 0, 'Initial is_muted should be 0');

    // Mute
    await mod.mutePlayer(userId, guild, 'TestMod');
    player = db.getPlayer(userId, squadId);
    assert.equal(player.is_muted, 1, 'is_muted should be 1 after mute');

    // Unmute
    await mod.unmutePlayer(userId, guild, 'TestMod');
    player = db.getPlayer(userId, squadId);
    assert.equal(player.is_muted, 0, 'is_muted should be 0 after unmute');
  });

  test('mutePlayer applies Discord timeout with correct duration', async () => {
    const userId = '555555555555555555';
    const squadId = 'SSE-0003';

    const squad = makeSquad({ squad_no: 3, player_ids: [userId, '666666666666666666'] });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId }));

    const { guild, timeouts } = makeMockGuild();
    await mod.mutePlayer(userId, guild, 'TestMod');

    assert.equal(
      timeouts[userId],
      mod.MUTE_DURATION_MS,
      `Discord timeout should be ${mod.MUTE_DURATION_MS}ms`
    );
  });

  test('unmutePlayer removes Discord timeout (sets to null)', async () => {
    const userId = '777777777777777777';
    const squadId = 'SSE-0004';

    const squad = makeSquad({ squad_no: 4, player_ids: [userId, '888888888888888888'] });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId, is_muted: 1 }));

    const { guild, timeouts } = makeMockGuild();
    await mod.unmutePlayer(userId, guild, 'TestMod');

    assert.equal(timeouts[userId], null, 'Discord timeout should be set to null on unmute');
  });

  test('mutePlayer with no active squad does not throw', async () => {
    const userId = '999999999999999999';
    const { guild } = makeMockGuild();

    // No squad in DB — should not throw
    await assert.doesNotReject(
      () => mod.mutePlayer(userId, guild, 'TestMod'),
      'mutePlayer should not throw when player has no active squad'
    );
  });
});

// ---------------------------------------------------------------------------
// Property 32: Warning Accumulation and Auto-Removal
// Validates: Requirements 16.1, 16.4
// ---------------------------------------------------------------------------

describe('Property 32: Warning Accumulation and Auto-Removal', () => {
  /**
   * Validates: Requirements 16.1, 16.4
   * Each call to warnPlayer SHALL increment the warnings count by 1.
   * When warnings reach 3, the player SHALL be auto-removed from their group.
   */

  beforeEach(() => {
    db.initDb(':memory:');
    mod._resetSpamTracker();
  });
  afterEach(() => { db.closeDb(); });

  test('warnPlayer increments warnings count by 1 each call', async () => {
    const userId = '111111111111111111';
    const squadId = 'SSE-0001';

    const squad = makeSquad({ squad_no: 1, player_ids: [userId, '222222222222222222'] });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId, role: 'leader' }));

    const { guild } = makeMockGuild();

    await mod.warnPlayer(userId, 'Test reason 1', guild, 'TestMod');
    let player = db.getPlayer(userId, squadId);
    assert.equal(player.warnings, 1, 'warnings should be 1 after first warn');

    await mod.warnPlayer(userId, 'Test reason 2', guild, 'TestMod');
    player = db.getPlayer(userId, squadId);
    assert.equal(player.warnings, 2, 'warnings should be 2 after second warn');
  });

  test('3rd warning triggers auto-removal from group', async () => {
    const userId = '333333333333333333';
    const squadId = 'SSE-0002';
    const groupNo = 1;

    // Set up squad with a group assignment
    const squad = makeSquad({
      squad_no: 2,
      squad_id: squadId,
      player_ids: [userId, '444444444444444444'],
      group_no: groupNo,
    });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId, role: 'leader' }));

    // Create the group record so removeFromGroup can find it
    db.upsertGroup({
      group_no: groupNo,
      channel_id: 'ch-group-1',
      role_id: 'role-group-1',
      squad_ids: [squadId],
    });

    const { guild } = makeMockGuild();

    // Warn twice — no auto-removal yet
    await mod.warnPlayer(userId, 'Reason 1', guild, 'TestMod');
    await mod.warnPlayer(userId, 'Reason 2', guild, 'TestMod');

    let squadRecord = db.getSquadById(squadId);
    assert.equal(squadRecord.group_no, groupNo, 'Squad should still be in group after 2 warnings');

    // 3rd warning — triggers auto-removal
    await mod.warnPlayer(userId, 'Reason 3', guild, 'TestMod');

    squadRecord = db.getSquadById(squadId);
    assert.equal(squadRecord.group_no, null, 'Squad group_no should be null after 3rd warning auto-removal');
  });

  test('warnings count reaches 3 on 3rd call', async () => {
    const userId = '555555555555555555';
    const squadId = 'SSE-0003';

    const squad = makeSquad({ squad_no: 3, squad_id: squadId, player_ids: [userId, '666666666666666666'] });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId }));

    const { guild } = makeMockGuild();

    for (let i = 1; i <= 3; i++) {
      await mod.warnPlayer(userId, `Reason ${i}`, guild, 'TestMod');
    }

    const player = db.getPlayer(userId, squadId);
    assert.equal(player.warnings, 3, 'warnings should be 3 after three calls');
  });

  test('warnPlayer returns null for player not in any active squad', async () => {
    const { guild } = makeMockGuild();
    const result = await mod.warnPlayer('999999999999999999', 'reason', guild, 'TestMod');
    assert.equal(result, null, 'Should return null for unknown player');
  });

  test('auto-removal does not trigger before 3rd warning', async () => {
    const userId = '777777777777777777';
    const squadId = 'SSE-0004';
    const groupNo = 1;

    const squad = makeSquad({
      squad_no: 4,
      squad_id: squadId,
      player_ids: [userId, '888888888888888888'],
      group_no: groupNo,
    });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId }));
    db.upsertGroup({
      group_no: groupNo,
      channel_id: 'ch-group-1',
      role_id: 'role-group-1',
      squad_ids: [squadId],
    });

    const { guild } = makeMockGuild();

    // Only 2 warnings
    await mod.warnPlayer(userId, 'Reason 1', guild, 'TestMod');
    await mod.warnPlayer(userId, 'Reason 2', guild, 'TestMod');

    const squadRecord = db.getSquadById(squadId);
    assert.equal(squadRecord.group_no, groupNo, 'Squad should remain in group after only 2 warnings');
  });
});

// ---------------------------------------------------------------------------
// Property 33: Group Removal Persistence
// Validates: Requirements 17.2
// ---------------------------------------------------------------------------

describe('Property 33: Group Removal Persistence', () => {
  /**
   * Validates: Requirements 17.2
   * After removeFromGroup is called, the player's squad SHALL have group_no=null in the DB.
   */

  beforeEach(() => {
    db.initDb(':memory:');
    mod._resetSpamTracker();
  });
  afterEach(() => { db.closeDb(); });

  test('removeFromGroup sets squad group_no to null in DB', async () => {
    const userId = '111111111111111111';
    const squadId = 'SSE-0001';
    const groupNo = 1;

    const squad = makeSquad({
      squad_no: 1,
      squad_id: squadId,
      player_ids: [userId, '222222222222222222'],
      group_no: groupNo,
    });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId, role: 'leader' }));
    db.upsertGroup({
      group_no: groupNo,
      channel_id: 'ch-group-1',
      role_id: 'role-group-1',
      squad_ids: [squadId],
    });

    const { guild } = makeMockGuild();
    await mod.removeFromGroup(userId, groupNo, guild, 'TestMod');

    const squadRecord = db.getSquadById(squadId);
    assert.equal(squadRecord.group_no, null, 'Squad group_no should be null after removeFromGroup');
  });

  test('removeFromGroup removes squad from group squad_ids list', async () => {
    const userId = '333333333333333333';
    const squadId = 'SSE-0002';
    const groupNo = 2;

    const squad = makeSquad({
      squad_no: 2,
      squad_id: squadId,
      player_ids: [userId, '444444444444444444'],
      group_no: groupNo,
    });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId }));
    db.upsertGroup({
      group_no: groupNo,
      channel_id: 'ch-group-2',
      role_id: 'role-group-2',
      squad_ids: [squadId, 'SSE-0099'],
    });

    const { guild } = makeMockGuild();
    await mod.removeFromGroup(userId, groupNo, guild, 'TestMod');

    const group = db.getGroup(groupNo);
    assert.ok(group, 'Group should still exist');
    assert.ok(
      !group.squad_ids.includes(squadId),
      `Squad ${squadId} should no longer be in group ${groupNo}'s squad_ids`
    );
    // Other squad should remain
    assert.ok(group.squad_ids.includes('SSE-0099'), 'Other squad should remain in group');
  });

  test('removeFromGroup revokes group role from the player', async () => {
    const userId = '555555555555555555';
    const squadId = 'SSE-0003';
    const groupNo = 1;
    const roleId = 'role-group-1';

    const squad = makeSquad({
      squad_no: 3,
      squad_id: squadId,
      player_ids: [userId, '666666666666666666'],
      group_no: groupNo,
    });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId }));
    db.upsertGroup({
      group_no: groupNo,
      channel_id: 'ch-group-1',
      role_id: roleId,
      squad_ids: [squadId],
    });

    const { guild, roleRemovals } = makeMockGuild();
    await mod.removeFromGroup(userId, groupNo, guild, 'TestMod');

    const revoked = roleRemovals[userId] ?? [];
    assert.ok(
      revoked.includes(roleId),
      `Player ${userId} should have had group role ${roleId} revoked`
    );
  });

  test('removeFromGroup for player not in any squad is a no-op (no throw)', async () => {
    const { guild } = makeMockGuild();
    db.upsertGroup({
      group_no: 1,
      channel_id: 'ch-group-1',
      role_id: 'role-group-1',
      squad_ids: [],
    });

    await assert.doesNotReject(
      () => mod.removeFromGroup('999999999999999999', 1, guild, 'TestMod'),
      'removeFromGroup should not throw for unknown player'
    );
  });
});

// ---------------------------------------------------------------------------
// Property 34: AutoMod Spam Detection
// Validates: Requirements 19.1
// ---------------------------------------------------------------------------

describe('Property 34: AutoMod Spam Detection', () => {
  /**
   * Validates: Requirements 19.1
   * Sending SPAM_THRESHOLD (5) messages within SPAM_WINDOW_MS (3s) SHALL
   * result in the user being auto-muted and receiving a warning.
   */

  beforeEach(() => {
    db.initDb(':memory:');
    mod._resetSpamTracker();
  });
  afterEach(() => { db.closeDb(); });

  test('5 rapid messages trigger auto-mute and warning', async () => {
    const userId = '111111111111111111';
    const squadId = 'SSE-0001';

    const squad = makeSquad({ squad_no: 1, player_ids: [userId, '222222222222222222'] });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId }));

    const { guild, timeouts } = makeMockGuild();

    // Send SPAM_THRESHOLD messages — all within the spam window
    let spamDetected = false;
    for (let i = 0; i < mod.SPAM_THRESHOLD; i++) {
      const msg = makeMockMessage({ authorId: userId, guild });
      const result = await mod._checkSpam(msg, userId, guild, 'AutoMod');
      if (result) spamDetected = true;
    }

    assert.ok(spamDetected, 'Spam should be detected after SPAM_THRESHOLD messages');

    // Discord timeout should have been applied
    assert.equal(
      timeouts[userId],
      mod.MUTE_DURATION_MS,
      'Player should be timed out for MUTE_DURATION_MS'
    );

    // DB mute flag should be set
    const player = db.getPlayer(userId, squadId);
    assert.equal(player.is_muted, 1, 'is_muted should be 1 after spam auto-mute');
  });

  test('fewer than SPAM_THRESHOLD messages do not trigger spam detection', async () => {
    const userId = '333333333333333333';
    const { guild } = makeMockGuild();

    // Send SPAM_THRESHOLD - 1 messages
    let spamDetected = false;
    for (let i = 0; i < mod.SPAM_THRESHOLD - 1; i++) {
      const msg = makeMockMessage({ authorId: userId, guild });
      const result = await mod._checkSpam(msg, userId, guild, 'AutoMod');
      if (result) spamDetected = true;
    }

    assert.ok(!spamDetected, 'Spam should NOT be detected with fewer than SPAM_THRESHOLD messages');
  });

  test('spam detection increments warning count', async () => {
    const userId = '444444444444444444';
    const squadId = 'SSE-0002';

    const squad = makeSquad({ squad_no: 2, player_ids: [userId, '555555555555555555'] });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId }));

    const { guild } = makeMockGuild();

    for (let i = 0; i < mod.SPAM_THRESHOLD; i++) {
      const msg = makeMockMessage({ authorId: userId, guild });
      await mod._checkSpam(msg, userId, guild, 'AutoMod');
    }

    const player = db.getPlayer(userId, squadId);
    assert.ok(player.warnings >= 1, 'Warning count should be incremented after spam detection');
  });

  test('handleAutoMod detects spam across 5 messages', async () => {
    const userId = '666666666666666666';
    const squadId = 'SSE-0003';

    const squad = makeSquad({ squad_no: 3, player_ids: [userId, '777777777777777777'] });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId }));

    const { guild, timeouts } = makeMockGuild();

    for (let i = 0; i < mod.SPAM_THRESHOLD; i++) {
      const msg = makeMockMessage({ authorId: userId, guild, content: `message ${i}` });
      await mod.handleAutoMod(msg);
    }

    // At least one timeout should have been applied
    assert.equal(
      timeouts[userId],
      mod.MUTE_DURATION_MS,
      'handleAutoMod should apply timeout after SPAM_THRESHOLD messages'
    );
  });

  test('_resetSpamTracker clears state between tests', async () => {
    const userId = '888888888888888888';
    const { guild } = makeMockGuild();

    // Send 4 messages (just under threshold)
    for (let i = 0; i < mod.SPAM_THRESHOLD - 1; i++) {
      const msg = makeMockMessage({ authorId: userId, guild });
      await mod._checkSpam(msg, userId, guild, 'AutoMod');
    }

    // Reset tracker
    mod._resetSpamTracker();

    // Now send SPAM_THRESHOLD - 1 more — should NOT trigger (tracker was reset)
    let spamDetected = false;
    for (let i = 0; i < mod.SPAM_THRESHOLD - 1; i++) {
      const msg = makeMockMessage({ authorId: userId, guild });
      const result = await mod._checkSpam(msg, userId, guild, 'AutoMod');
      if (result) spamDetected = true;
    }

    assert.ok(!spamDetected, 'Spam should not be detected after tracker reset');
  });
});

// ---------------------------------------------------------------------------
// Property 35: AutoMod Mention Spam Detection
// Validates: Requirements 19.2
// ---------------------------------------------------------------------------

describe('Property 35: AutoMod Mention Spam Detection', () => {
  /**
   * Validates: Requirements 19.2
   * A message with MENTION_THRESHOLD (3) or more user mentions SHALL be
   * deleted and the author SHALL receive a warning.
   */

  beforeEach(() => {
    db.initDb(':memory:');
    mod._resetSpamTracker();
  });
  afterEach(() => { db.closeDb(); });

  test('_countMentions counts <@ID> patterns correctly', () => {
    assert.equal(mod._countMentions('<@111> <@222> <@333>'), 3);
    assert.equal(mod._countMentions('<@!111> <@!222>'), 2);
    assert.equal(mod._countMentions('no mentions here'), 0);
    assert.equal(mod._countMentions('<@111>'), 1);
  });

  test('message with exactly MENTION_THRESHOLD mentions is deleted and warned', async () => {
    const userId = '111111111111111111';
    const squadId = 'SSE-0001';

    const squad = makeSquad({ squad_no: 1, player_ids: [userId, '222222222222222222'] });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId }));

    const { guild } = makeMockGuild();

    // Build content with exactly MENTION_THRESHOLD mentions
    const mentions = Array.from({ length: mod.MENTION_THRESHOLD }, (_, i) => `<@${i + 1}00000000000000001>`).join(' ');
    const msg = makeMockMessage({ authorId: userId, guild, content: mentions });

    const result = await mod._checkMentionSpam(msg, userId, guild, 'AutoMod');

    assert.ok(result, 'Mention spam should be detected');
    assert.ok(msg._deleted.value, 'Message should be deleted');

    const player = db.getPlayer(userId, squadId);
    assert.ok(player.warnings >= 1, 'Warning should be incremented');
  });

  test('message with more than MENTION_THRESHOLD mentions is deleted', async () => {
    const userId = '333333333333333333';
    const squadId = 'SSE-0002';

    const squad = makeSquad({ squad_no: 2, player_ids: [userId, '444444444444444444'] });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId }));

    const { guild } = makeMockGuild();

    // 5 mentions — well above threshold
    const content = '<@100> <@200> <@300> <@400> <@500>';
    const msg = makeMockMessage({ authorId: userId, guild, content });

    const result = await mod._checkMentionSpam(msg, userId, guild, 'AutoMod');

    assert.ok(result, 'Mention spam should be detected with 5 mentions');
    assert.ok(msg._deleted.value, 'Message should be deleted');
  });

  test('message with fewer than MENTION_THRESHOLD mentions is not flagged', async () => {
    const userId = '555555555555555555';
    const { guild } = makeMockGuild();

    // 2 mentions — below threshold of 3
    const content = '<@100000000000000001> <@200000000000000002>';
    const msg = makeMockMessage({ authorId: userId, guild, content });

    const result = await mod._checkMentionSpam(msg, userId, guild, 'AutoMod');

    assert.ok(!result, 'Mention spam should NOT be detected with fewer than MENTION_THRESHOLD mentions');
    assert.ok(!msg._deleted.value, 'Message should NOT be deleted');
  });

  test('mention spam uses discord.js mentions.users.size when available', async () => {
    const userId = '666666666666666666';
    const squadId = 'SSE-0003';

    const squad = makeSquad({ squad_no: 3, player_ids: [userId, '777777777777777777'] });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId }));

    const { guild } = makeMockGuild();

    // Provide a mock mentions.users.size of MENTION_THRESHOLD
    const msg = makeMockMessage({
      authorId: userId,
      guild,
      content: 'hello world',  // no raw mention text
      mentions: { users: { size: mod.MENTION_THRESHOLD } },
    });

    const result = await mod._checkMentionSpam(msg, userId, guild, 'AutoMod');

    assert.ok(result, 'Should detect mention spam via mentions.users.size');
    assert.ok(msg._deleted.value, 'Message should be deleted');
  });
});

// ---------------------------------------------------------------------------
// Property 36: AutoMod Caps Spam Detection
// Validates: Requirements 19.3
// ---------------------------------------------------------------------------

describe('Property 36: AutoMod Caps Spam Detection', () => {
  /**
   * Validates: Requirements 19.3
   * A message with more than CAPS_THRESHOLD (70%) uppercase letters AND
   * more than CAPS_MIN_LENGTH (10) characters SHALL be deleted and warned.
   */

  beforeEach(() => {
    db.initDb(':memory:');
    mod._resetSpamTracker();
  });
  afterEach(() => { db.closeDb(); });

  test('_capsRatio returns correct ratio for all-caps string', () => {
    assert.equal(mod._capsRatio('HELLO'), 1.0);
  });

  test('_capsRatio returns 0 for all-lowercase string', () => {
    assert.equal(mod._capsRatio('hello'), 0.0);
  });

  test('_capsRatio ignores non-alphabetic characters', () => {
    // "HELLO world" → 5 upper, 5 lower = 0.5
    const ratio = mod._capsRatio('HELLO world');
    assert.ok(Math.abs(ratio - 0.5) < 0.01, `Expected ~0.5, got ${ratio}`);
  });

  test('_capsRatio returns 0 for empty string', () => {
    assert.equal(mod._capsRatio(''), 0);
  });

  test('message >70% caps and >10 chars is deleted and warned', async () => {
    const userId = '111111111111111111';
    const squadId = 'SSE-0001';

    const squad = makeSquad({ squad_no: 1, player_ids: [userId, '222222222222222222'] });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId }));

    const { guild } = makeMockGuild();

    // "THIS IS ALL CAPS TEXT HERE" — all caps, >10 chars
    const content = 'THIS IS ALL CAPS TEXT HERE';
    assert.ok(content.length > mod.CAPS_MIN_LENGTH, 'Content should be longer than CAPS_MIN_LENGTH');
    assert.ok(mod._capsRatio(content) > mod.CAPS_THRESHOLD, 'Content should exceed CAPS_THRESHOLD');

    const msg = makeMockMessage({ authorId: userId, guild, content });
    const result = await mod._checkCapsSpam(msg, userId, guild, 'AutoMod');

    assert.ok(result, 'Caps spam should be detected');
    assert.ok(msg._deleted.value, 'Message should be deleted');

    const player = db.getPlayer(userId, squadId);
    assert.ok(player.warnings >= 1, 'Warning should be incremented');
  });

  test('message <=10 chars is not flagged even if all caps', async () => {
    const userId = '333333333333333333';
    const { guild } = makeMockGuild();

    // "HELLO" — all caps but only 5 chars (≤ CAPS_MIN_LENGTH)
    const content = 'HELLO';
    assert.ok(content.length <= mod.CAPS_MIN_LENGTH, 'Content should be ≤ CAPS_MIN_LENGTH');

    const msg = makeMockMessage({ authorId: userId, guild, content });
    const result = await mod._checkCapsSpam(msg, userId, guild, 'AutoMod');

    assert.ok(!result, 'Short all-caps message should NOT be flagged');
    assert.ok(!msg._deleted.value, 'Short message should NOT be deleted');
  });

  test('message >10 chars but <=70% caps is not flagged', async () => {
    const userId = '444444444444444444';
    const { guild } = makeMockGuild();

    // "Hello World This Is Mixed" — roughly 50% caps
    const content = 'Hello World This Is Mixed';
    assert.ok(content.length > mod.CAPS_MIN_LENGTH, 'Content should be > CAPS_MIN_LENGTH');
    assert.ok(mod._capsRatio(content) <= mod.CAPS_THRESHOLD, 'Content should be ≤ CAPS_THRESHOLD');

    const msg = makeMockMessage({ authorId: userId, guild, content });
    const result = await mod._checkCapsSpam(msg, userId, guild, 'AutoMod');

    assert.ok(!result, 'Mixed-case message should NOT be flagged');
    assert.ok(!msg._deleted.value, 'Mixed-case message should NOT be deleted');
  });

  test('boundary: exactly 71% caps and 11 chars triggers detection', async () => {
    const userId = '555555555555555555';
    const squadId = 'SSE-0002';

    const squad = makeSquad({ squad_no: 2, player_ids: [userId, '666666666666666666'] });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId }));

    const { guild } = makeMockGuild();

    // "HHHHHHHHhhl" — 8 upper out of 11 letters = ~72.7% caps, 11 chars
    const content = 'HHHHHHHHhhl';
    assert.ok(content.length > mod.CAPS_MIN_LENGTH, 'Content should be > CAPS_MIN_LENGTH');
    assert.ok(mod._capsRatio(content) > mod.CAPS_THRESHOLD, 'Content should exceed CAPS_THRESHOLD');

    const msg = makeMockMessage({ authorId: userId, guild, content });
    const result = await mod._checkCapsSpam(msg, userId, guild, 'AutoMod');

    assert.ok(result, 'Should detect caps spam at boundary');
    assert.ok(msg._deleted.value, 'Message should be deleted at boundary');
  });
});

// ---------------------------------------------------------------------------
// Property 37: AutoMod Repeated Registration Detection
// Validates: Requirements 19.4
// ---------------------------------------------------------------------------

describe('Property 37: AutoMod Repeated Registration Detection', () => {
  /**
   * Validates: Requirements 19.4
   * A user already in an active squad who posts in the registration channel
   * SHALL receive a ❌ reaction and a warning.
   */

  beforeEach(() => {
    db.initDb(':memory:');
    mod._resetSpamTracker();
  });
  afterEach(() => { db.closeDb(); });

  test('user already in active squad gets ❌ reaction and warning', async () => {
    const userId = '111111111111111111';
    const squadId = 'SSE-0001';

    // Insert squad and player so user is already registered
    const squad = makeSquad({ squad_no: 1, player_ids: [userId, '222222222222222222'] });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId, role: 'leader' }));

    const { guild } = makeMockGuild();

    const msg = makeMockMessage({
      authorId: userId,
      guild,
      channelId: mod.REGISTRATION_CHANNEL_ID,
      content: 'Team Name: Second Team <@111111111111111111> <@333333333333333333>',
    });

    const result = await mod._checkRepeatedRegistration(msg, userId, guild, 'AutoMod');

    assert.ok(result, 'Repeated registration should be detected');

    // Should have reacted with ❌ (either animated or plain)
    assert.ok(
      msg._reactions.length > 0,
      'Message should have received a ❌ reaction'
    );

    // Warning should be incremented
    const player = db.getPlayer(userId, squadId);
    assert.ok(player.warnings >= 1, 'Warning count should be incremented');
  });

  test('user not in any squad does not trigger repeated registration', async () => {
    const userId = '333333333333333333';
    const { guild } = makeMockGuild();

    const msg = makeMockMessage({
      authorId: userId,
      guild,
      channelId: mod.REGISTRATION_CHANNEL_ID,
      content: 'Team Name: New Team <@333333333333333333> <@444444444444444444>',
    });

    const result = await mod._checkRepeatedRegistration(msg, userId, guild, 'AutoMod');

    assert.ok(!result, 'Should not detect repeated registration for new user');
    assert.equal(msg._reactions.length, 0, 'No reaction should be added for new user');
  });

  test('message in non-registration channel is not checked', async () => {
    const userId = '555555555555555555';
    const squadId = 'SSE-0003';

    const squad = makeSquad({ squad_no: 3, player_ids: [userId, '666666666666666666'] });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId }));

    const { guild } = makeMockGuild();

    // Message in a different channel
    const msg = makeMockMessage({
      authorId: userId,
      guild,
      channelId: '9999999999999999999',  // not the registration channel
      content: 'Team Name: Another Team <@555555555555555555> <@777777777777777777>',
    });

    const result = await mod._checkRepeatedRegistration(msg, userId, guild, 'AutoMod');

    assert.ok(!result, 'Should not check repeated registration outside registration channel');
    assert.equal(msg._reactions.length, 0, 'No reaction for non-registration channel');
  });

  test('handleAutoMod detects repeated registration via full pipeline', async () => {
    const userId = '777777777777777777';
    const squadId = 'SSE-0004';

    const squad = makeSquad({ squad_no: 4, player_ids: [userId, '888888888888888888'] });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId }));

    const { guild } = makeMockGuild();

    const msg = makeMockMessage({
      authorId: userId,
      guild,
      channelId: mod.REGISTRATION_CHANNEL_ID,
      content: 'Team Name: Repeat Team <@777777777777777777> <@999999999999999999>',
    });

    await mod.handleAutoMod(msg);

    assert.ok(
      msg._reactions.length > 0,
      'handleAutoMod should add ❌ reaction for repeated registration'
    );

    const player = db.getPlayer(userId, squadId);
    assert.ok(player.warnings >= 1, 'Warning should be incremented via handleAutoMod');
  });

  test('user in cancelled squad is not flagged as repeated registration', async () => {
    const userId = '100000000000000001';
    const squadId = 'SSE-0005';

    // Insert a CANCELLED squad — should not count as active
    const squad = makeSquad({
      squad_no: 5,
      squad_id: squadId,
      player_ids: [userId, '200000000000000002'],
      status: 'cancelled',
    });
    db.insertSquad(squad);
    db.insertPlayer(makePlayer({ discord_id: userId, squad_id: squadId }));

    const { guild } = makeMockGuild();

    const msg = makeMockMessage({
      authorId: userId,
      guild,
      channelId: mod.REGISTRATION_CHANNEL_ID,
      content: 'Team Name: Fresh Start <@100000000000000001> <@300000000000000003>',
    });

    const result = await mod._checkRepeatedRegistration(msg, userId, guild, 'AutoMod');

    assert.ok(!result, 'Cancelled squad membership should not trigger repeated registration detection');
    assert.equal(msg._reactions.length, 0, 'No reaction for user with only cancelled squad');
  });
});
