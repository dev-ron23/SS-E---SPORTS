'use strict';

/**
 * Property-based and unit tests for utils/embedBuilder.js
 * Tests Property 10: Embed Color Consistency
 * Validates: Requirements 3.5, 27.1-27.9
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  COLORS,
  buildRegistrationConfirmedEmbed,
  buildRegistrationCancelledEmbed,
  buildEditPreviewEmbed,
  buildEditConfirmedEmbed,
  buildMatchAssignedEmbed,
  buildWinnerEmbed,
  buildBroadcastEmbed,
  buildDMEmbed,
  buildLockRegistrationEmbed,
  buildPlayerInfoEmbed,
  buildLeaderInfoEmbed,
  buildDuplicateEmbed,
  buildWarnEmbed,
  buildMuteEmbed,
} = require('./embedBuilder');

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function randomUserId() {
  return String(100000000000000000n + BigInt(Math.floor(Math.random() * 900000000000000000)));
}

function makeSquad(overrides = {}) {
  const playerIds = [randomUserId(), randomUserId(), randomUserId()];
  return {
    squad_id: 'SSE-0001',
    squad_no: 1,
    team_name: 'Test Squad',
    leader_id: playerIds[0],
    player_ids: playerIds,
    player_uids: { [playerIds[0]]: '12345678' },
    group_no: 1,
    registered_at: new Date().toISOString(),
    status: 'active',
    winner_position: null,
    ...overrides,
  };
}

/**
 * Extract the color from an EmbedBuilder's data
 */
function getEmbedColor(embed) {
  return embed.data.color;
}

// ─────────────────────────────────────────────
// Property 10: Embed Color Consistency
// Validates: Requirements 3.5, 27.1-27.9
// ─────────────────────────────────────────────

describe('Property 10: Embed Color Consistency', () => {
  it('buildRegistrationConfirmedEmbed should use color #00FF7F (Req 27.1)', () => {
    const squad = makeSquad();
    const embed = buildRegistrationConfirmedEmbed(squad, 'https://discord.com/channels/1/2/3');
    assert.equal(getEmbedColor(embed), COLORS.REGISTRATION_CONFIRMED);
    assert.equal(COLORS.REGISTRATION_CONFIRMED, 0x00ff7f);
  });

  it('buildRegistrationCancelledEmbed should use color #FF0000 (Req 27.2)', () => {
    const squad = makeSquad();
    const embed = buildRegistrationCancelledEmbed(squad);
    assert.equal(getEmbedColor(embed), COLORS.REGISTRATION_CANCELLED);
    assert.equal(COLORS.REGISTRATION_CANCELLED, 0xff0000);
  });

  it('buildEditPreviewEmbed should use color #FFA500 (Req 27.3)', () => {
    const squad = makeSquad();
    const newData = { teamName: 'New Name', players: squad.player_ids };
    const embed = buildEditPreviewEmbed(squad, newData);
    assert.equal(getEmbedColor(embed), COLORS.EDIT_PENDING);
    assert.equal(COLORS.EDIT_PENDING, 0xffa500);
  });

  it('buildEditConfirmedEmbed should use color #00BFFF (Req 27.4)', () => {
    const squad = makeSquad();
    const embed = buildEditConfirmedEmbed(squad);
    assert.equal(getEmbedColor(embed), COLORS.EDIT_CONFIRMED);
    assert.equal(COLORS.EDIT_CONFIRMED, 0x00bfff);
  });

  it('buildMatchAssignedEmbed should use color #9B59B6 (Req 27.5)', () => {
    const embed = buildMatchAssignedEmbed(1, 'ROOM123', 'pass456');
    assert.equal(getEmbedColor(embed), COLORS.MATCH_ASSIGNED);
    assert.equal(COLORS.MATCH_ASSIGNED, 0x9b59b6);
  });

  it('buildWinnerEmbed should use color #FFD700 (Req 27.6)', () => {
    const squad = makeSquad();
    const embed = buildWinnerEmbed(squad, 1);
    assert.equal(getEmbedColor(embed), COLORS.WINNER_DECLARED);
    assert.equal(COLORS.WINNER_DECLARED, 0xffd700);
  });

  it('buildBroadcastEmbed should use color #7289DA (Req 27.7)', () => {
    const embed = buildBroadcastEmbed('Hello everyone!', 'Admin#0001');
    assert.equal(getEmbedColor(embed), COLORS.ADMIN_BROADCAST);
    assert.equal(COLORS.ADMIN_BROADCAST, 0x7289da);
  });

  it('buildDMEmbed should use color #7289DA (Req 27.7)', () => {
    const embed = buildDMEmbed('Personal message', 'Admin#0001');
    assert.equal(getEmbedColor(embed), COLORS.ADMIN_BROADCAST);
    assert.equal(COLORS.ADMIN_BROADCAST, 0x7289da);
  });

  it('buildLockRegistrationEmbed should use color #8B00FF (Req 27.8)', () => {
    const embed = buildLockRegistrationEmbed();
    assert.equal(getEmbedColor(embed), COLORS.LOCK_REGISTRATION);
    assert.equal(COLORS.LOCK_REGISTRATION, 0x8b00ff);
  });

  it('buildDuplicateEmbed should use color #FF4444 (Req 27.9)', () => {
    const userId = randomUserId();
    const embed = buildDuplicateEmbed(userId, 'SSE-0001', 'Some Team');
    assert.equal(getEmbedColor(embed), COLORS.ERROR_WARNING);
    assert.equal(COLORS.ERROR_WARNING, 0xff4444);
  });

  it('buildWarnEmbed should use color #FF4444 (Req 27.9)', () => {
    const userId = randomUserId();
    const embed = buildWarnEmbed(userId, 'Spamming', 1);
    assert.equal(getEmbedColor(embed), COLORS.ERROR_WARNING);
  });

  it('buildMuteEmbed should use color #FF4444', () => {
    const userId = randomUserId();
    const embed = buildMuteEmbed(userId, 'Moderator#0001');
    assert.equal(getEmbedColor(embed), COLORS.ERROR_WARNING);
  });

  // Property-based: color consistency holds across many random inputs
  it('color consistency holds for 20 random registration confirmed embeds', () => {
    for (let i = 0; i < 20; i++) {
      const squad = makeSquad({ squad_id: `SSE-${String(i).padStart(4, '0')}`, squad_no: i + 1 });
      const embed = buildRegistrationConfirmedEmbed(squad, `https://discord.com/channels/1/2/${i}`);
      assert.equal(
        getEmbedColor(embed),
        COLORS.REGISTRATION_CONFIRMED,
        `Iteration ${i}: color should be #00FF7F`
      );
    }
  });

  it('color consistency holds for 20 random winner embeds', () => {
    for (let i = 0; i < 20; i++) {
      const squad = makeSquad();
      const position = 1 + Math.floor(Math.random() * 10);
      const embed = buildWinnerEmbed(squad, position);
      assert.equal(
        getEmbedColor(embed),
        COLORS.WINNER_DECLARED,
        `Iteration ${i}: color should be #FFD700`
      );
    }
  });
});

// ─────────────────────────────────────────────
// Unit tests for embed content
// ─────────────────────────────────────────────

describe('Embed content correctness', () => {
  it('buildRegistrationConfirmedEmbed should include squad ID and team name', () => {
    const squad = makeSquad({ squad_id: 'SSE-0042', team_name: 'Alpha Team' });
    const embed = buildRegistrationConfirmedEmbed(squad, 'https://discord.com/channels/1/2/3');
    const data = embed.data;

    const fieldValues = data.fields.map((f) => f.value);
    assert.ok(fieldValues.some((v) => v.includes('SSE-0042')), 'Should include squad ID');
    assert.ok(fieldValues.some((v) => v.includes('Alpha Team')), 'Should include team name');
  });

  it('buildMatchAssignedEmbed should include room ID and password', () => {
    const embed = buildMatchAssignedEmbed(3, 'ROOM999', 'secret123');
    const data = embed.data;

    const fieldValues = data.fields.map((f) => f.value);
    assert.ok(fieldValues.some((v) => v.includes('ROOM999')), 'Should include room ID');
    assert.ok(fieldValues.some((v) => v.includes('secret123')), 'Should include password');
  });

  it('buildWarnEmbed should include warning count', () => {
    const userId = randomUserId();
    const embed = buildWarnEmbed(userId, 'Caps spam', 2);
    const data = embed.data;

    const fieldValues = data.fields.map((f) => f.value);
    assert.ok(fieldValues.some((v) => v.includes('2/3')), 'Should include warning count 2/3');
  });

  it('buildWarnEmbed at 3 warnings should mention auto-removal', () => {
    const userId = randomUserId();
    const embed = buildWarnEmbed(userId, 'Final warning', 3);
    const data = embed.data;

    const fieldValues = data.fields.map((f) => f.value);
    assert.ok(
      fieldValues.some((v) => v.toLowerCase().includes('removed')),
      'Should mention auto-removal at 3 warnings'
    );
  });

  it('buildDuplicateEmbed should include the existing squad ID', () => {
    const userId = randomUserId();
    const embed = buildDuplicateEmbed(userId, 'SSE-0007', 'New Team');
    const data = embed.data;

    const allText = JSON.stringify(data);
    assert.ok(allText.includes('SSE-0007'), 'Should include existing squad ID');
  });

  it('buildLockRegistrationEmbed should have a title about locking', () => {
    const embed = buildLockRegistrationEmbed();
    assert.ok(
      embed.data.title.toLowerCase().includes('lock') ||
        embed.data.title.toLowerCase().includes('closed'),
      'Title should mention lock or closed'
    );
  });

  it('buildPlayerInfoEmbed should include player discord ID', () => {
    const userId = randomUserId();
    const player = {
      discord_id: userId,
      squad_id: 'SSE-0001',
      game_uid: '99887766',
      role: 'player',
      warnings: 1,
      is_muted: 0,
    };
    const squad = makeSquad();
    const embed = buildPlayerInfoEmbed(player, squad);
    const allText = JSON.stringify(embed.data);

    assert.ok(allText.includes(userId), 'Should include player discord ID');
  });
});
