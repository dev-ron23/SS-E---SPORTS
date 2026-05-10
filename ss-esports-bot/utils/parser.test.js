'use strict';

/**
 * Property-based and unit tests for utils/parser.js
 * Tests Properties 1, 2, 3, 4 from the design document.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseRegistration } = require('./parser');

// ─────────────────────────────────────────────
// Helpers for generating test data
// ─────────────────────────────────────────────

/**
 * Generate a random Discord-like user ID (17-18 digit string)
 */
function randomUserId() {
  const base = 100000000000000000n;
  const range = 900000000000000000n;
  const rand = base + BigInt(Math.floor(Math.random() * Number(range)));
  return rand.toString();
}

/**
 * Generate a random game UID (8-10 digit number string)
 */
function randomGameUid() {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

/**
 * Format a mention string
 */
function mention(userId) {
  return `<@${userId}>`;
}

/**
 * Build a valid registration message from structured data
 */
function buildRegistrationMessage({ teamName, players, uids = {} }) {
  let msg = `Team Name: ${teamName}\n`;
  for (const playerId of players) {
    msg += `${mention(playerId)} `;
    if (uids[playerId]) {
      msg += `UID: ${uids[playerId]} `;
    }
  }
  return msg.trim();
}

/**
 * Generate N unique user IDs
 */
function generateUserIds(n) {
  const ids = new Set();
  while (ids.size < n) {
    ids.add(randomUserId());
  }
  return Array.from(ids);
}

// ─────────────────────────────────────────────
// Property 1: Registration Message Round-Trip
// Validates: Requirements 1.1, 1.2
// ─────────────────────────────────────────────

describe('Property 1: Registration Message Round-Trip', () => {
  it('should parse a basic 2-player registration correctly', () => {
    const players = generateUserIds(2);
    const teamName = 'Alpha Squad';
    const msg = buildRegistrationMessage({ teamName, players });
    const result = parseRegistration(msg);

    assert.equal(result.valid, true, 'Should be valid');
    assert.equal(result.teamName, teamName, 'Team name should match');
    assert.deepEqual(result.players, players, 'Players should match');
  });

  it('should parse a 4-player registration with UIDs correctly', () => {
    const players = generateUserIds(4);
    const uids = {};
    players.forEach((p) => { uids[p] = randomGameUid(); });
    const teamName = 'Beta Warriors';
    const msg = buildRegistrationMessage({ teamName, players, uids });
    const result = parseRegistration(msg);

    assert.equal(result.valid, true, 'Should be valid');
    assert.equal(result.teamName, teamName, 'Team name should match');
    assert.deepEqual(result.players, players, 'Players should match');
    for (const playerId of players) {
      assert.equal(result.uids[playerId], uids[playerId], `UID for ${playerId} should match`);
    }
  });

  it('should parse a 5-player registration (max squad size)', () => {
    const players = generateUserIds(5);
    const teamName = 'Full Squad';
    const msg = buildRegistrationMessage({ teamName, players });
    const result = parseRegistration(msg);

    assert.equal(result.valid, true, 'Should be valid');
    assert.equal(result.players.length, 5, 'Should have 5 players');
  });

  it('should accept "Team:" prefix as well as "Team Name:"', () => {
    const players = generateUserIds(2);
    const msg = `Team: Gamma Force\n${mention(players[0])} ${mention(players[1])}`;
    const result = parseRegistration(msg);

    assert.equal(result.valid, true, 'Should be valid');
    assert.equal(result.teamName, 'Gamma Force', 'Team name should be extracted');
  });

  // Property-based: run multiple random valid registrations
  it('round-trip holds for 20 random valid registrations', () => {
    for (let i = 0; i < 20; i++) {
      const playerCount = 2 + Math.floor(Math.random() * 4); // 2-5
      const players = generateUserIds(playerCount);
      const teamName = `Team_${i}_${Math.random().toString(36).slice(2, 8)}`;
      const uids = {};
      // Randomly assign UIDs to some players
      for (const p of players) {
        if (Math.random() > 0.5) uids[p] = randomGameUid();
      }

      const msg = buildRegistrationMessage({ teamName, players, uids });
      const result = parseRegistration(msg);

      assert.equal(result.valid, true, `Iteration ${i}: should be valid`);
      assert.equal(result.teamName, teamName, `Iteration ${i}: team name should match`);
      assert.deepEqual(result.players, players, `Iteration ${i}: players should match`);

      for (const [playerId, uid] of Object.entries(uids)) {
        assert.equal(result.uids[playerId], uid, `Iteration ${i}: UID for ${playerId} should match`);
      }
    }
  });
});

// ─────────────────────────────────────────────
// Property 2: Mention Deduplication
// Validates: Requirements 1.5
// ─────────────────────────────────────────────

describe('Property 2: Mention Deduplication', () => {
  it('should deduplicate repeated mentions and keep first occurrence', () => {
    const players = generateUserIds(2);
    const [p1, p2] = players;
    // p1 appears twice
    const msg = `Team Name: Dupe Team\n${mention(p1)} ${mention(p2)} ${mention(p1)}`;
    const result = parseRegistration(msg);

    assert.equal(result.valid, true, 'Should be valid');
    assert.equal(result.players.length, 2, 'Should have 2 unique players');
    assert.deepEqual(result.players, [p1, p2], 'Should preserve first occurrence order');
  });

  it('should handle all-duplicate mentions (only 1 unique player → invalid)', () => {
    const [p1] = generateUserIds(1);
    const msg = `Team Name: Solo Team\n${mention(p1)} ${mention(p1)} ${mention(p1)}`;
    const result = parseRegistration(msg);

    assert.equal(result.valid, false, 'Should be invalid (only 1 unique player)');
  });

  it('should deduplicate across many duplicates', () => {
    const players = generateUserIds(3);
    const [p1, p2, p3] = players;
    // Each player mentioned multiple times
    const msg = `Team Name: Triple Dupe\n${mention(p1)} ${mention(p2)} ${mention(p1)} ${mention(p3)} ${mention(p2)} ${mention(p1)}`;
    const result = parseRegistration(msg);

    assert.equal(result.valid, true, 'Should be valid');
    assert.equal(result.players.length, 3, 'Should have 3 unique players');
    assert.deepEqual(result.players, [p1, p2, p3], 'Should preserve first occurrence order');
  });

  // Property-based: for any message with duplicates, result has unique players
  it('deduplication holds for 20 random messages with duplicates', () => {
    for (let i = 0; i < 20; i++) {
      const uniqueCount = 2 + Math.floor(Math.random() * 3); // 2-4 unique
      const uniquePlayers = generateUserIds(uniqueCount);

      // Build a list with duplicates
      const withDupes = [...uniquePlayers];
      for (let j = 0; j < uniqueCount; j++) {
        withDupes.push(uniquePlayers[Math.floor(Math.random() * uniqueCount)]);
      }

      const msg = `Team Name: DupeTest${i}\n${withDupes.map(mention).join(' ')}`;
      const result = parseRegistration(msg);

      assert.equal(result.valid, true, `Iteration ${i}: should be valid`);

      // Verify uniqueness
      const playerSet = new Set(result.players);
      assert.equal(playerSet.size, result.players.length, `Iteration ${i}: players should be unique`);

      // Verify all unique players are present
      for (const p of uniquePlayers) {
        assert.ok(result.players.includes(p), `Iteration ${i}: player ${p} should be in result`);
      }
    }
  });
});

// ─────────────────────────────────────────────
// Property 3: Invalid Registration Rejection — Missing Team Name
// Validates: Requirements 1.6
// ─────────────────────────────────────────────

describe('Property 3: Invalid Registration Rejection — Missing Team Name', () => {
  it('should reject a message with no team name', () => {
    const players = generateUserIds(3);
    const msg = players.map(mention).join(' ');
    const result = parseRegistration(msg);

    assert.equal(result.valid, false, 'Should be invalid');
    assert.ok(result.reason, 'Should have a reason');
  });

  it('should reject an empty message', () => {
    const result = parseRegistration('');
    assert.equal(result.valid, false, 'Should be invalid');
  });

  it('should reject a message with only mentions and no team prefix', () => {
    const players = generateUserIds(4);
    const msg = `Hello everyone! ${players.map(mention).join(' ')} please join us`;
    const result = parseRegistration(msg);

    assert.equal(result.valid, false, 'Should be invalid — no team name pattern');
  });

  // Property-based: messages without team name pattern are always invalid
  it('messages without team name are always rejected (20 random cases)', () => {
    for (let i = 0; i < 20; i++) {
      const playerCount = 2 + Math.floor(Math.random() * 4);
      const players = generateUserIds(playerCount);
      // No "Team:" or "Team Name:" prefix
      const msg = `Registration: ${players.map(mention).join(' ')}`;
      const result = parseRegistration(msg);

      assert.equal(result.valid, false, `Iteration ${i}: should be invalid without team name`);
    }
  });
});

// ─────────────────────────────────────────────
// Property 4: Invalid Registration Rejection — Insufficient Players
// Validates: Requirements 1.7
// ─────────────────────────────────────────────

describe('Property 4: Invalid Registration Rejection — Insufficient Players', () => {
  it('should reject a message with 0 players', () => {
    const msg = 'Team Name: Solo Team';
    const result = parseRegistration(msg);

    assert.equal(result.valid, false, 'Should be invalid');
  });

  it('should reject a message with exactly 1 player', () => {
    const [p1] = generateUserIds(1);
    const msg = `Team Name: Solo Team\n${mention(p1)}`;
    const result = parseRegistration(msg);

    assert.equal(result.valid, false, 'Should be invalid with only 1 player');
  });

  it('should accept a message with exactly 2 players (minimum)', () => {
    const players = generateUserIds(2);
    const msg = `Team Name: Duo Team\n${mention(players[0])} ${mention(players[1])}`;
    const result = parseRegistration(msg);

    assert.equal(result.valid, true, 'Should be valid with 2 players');
  });

  // Property-based: messages with <2 unique players are always invalid
  it('messages with <2 players are always rejected (20 random cases)', () => {
    for (let i = 0; i < 20; i++) {
      // 0 or 1 player
      const playerCount = Math.floor(Math.random() * 2); // 0 or 1
      const players = generateUserIds(playerCount);
      const msg = `Team Name: SmallTeam${i}\n${players.map(mention).join(' ')}`;
      const result = parseRegistration(msg);

      assert.equal(result.valid, false, `Iteration ${i}: should be invalid with ${playerCount} player(s)`);
    }
  });

  // Property-based: messages with >=2 unique players and a team name are always valid
  it('messages with >=2 players and team name are always valid (20 random cases)', () => {
    for (let i = 0; i < 20; i++) {
      const playerCount = 2 + Math.floor(Math.random() * 4); // 2-5
      const players = generateUserIds(playerCount);
      const msg = `Team Name: ValidTeam${i}\n${players.map(mention).join(' ')}`;
      const result = parseRegistration(msg);

      assert.equal(result.valid, true, `Iteration ${i}: should be valid with ${playerCount} players`);
    }
  });
});

// ─────────────────────────────────────────────
// Additional unit tests
// ─────────────────────────────────────────────

describe('Parser — additional edge cases', () => {
  it('should handle <@!USER_ID> format (legacy mentions)', () => {
    const userId = randomUserId();
    const userId2 = randomUserId();
    const msg = `Team Name: Legacy Team\n<@!${userId}> <@!${userId2}>`;
    const result = parseRegistration(msg);

    assert.equal(result.valid, true, 'Should be valid');
    assert.ok(result.players.includes(userId), 'Should include first player');
    assert.ok(result.players.includes(userId2), 'Should include second player');
  });

  it('should handle mixed <@USER_ID> and <@!USER_ID> formats', () => {
    const [p1, p2] = generateUserIds(2);
    const msg = `Team Name: Mixed Format\n<@${p1}> <@!${p2}>`;
    const result = parseRegistration(msg);

    assert.equal(result.valid, true, 'Should be valid');
    assert.ok(result.players.includes(p1), 'Should include p1');
    assert.ok(result.players.includes(p2), 'Should include p2');
  });

  it('should handle UID with dash separator (uid- format)', () => {
    const [p1, p2] = generateUserIds(2);
    const uid1 = randomGameUid();
    const msg = `Team Name: UID Dash Team\n${mention(p1)} uid- ${uid1} ${mention(p2)}`;
    const result = parseRegistration(msg);

    assert.equal(result.valid, true, 'Should be valid');
    assert.equal(result.uids[p1], uid1, 'Should extract UID with dash separator');
  });

  it('should cap players at 5 even if more are mentioned', () => {
    const players = generateUserIds(7);
    const msg = `Team Name: Big Team\n${players.map(mention).join(' ')}`;
    const result = parseRegistration(msg);

    assert.equal(result.valid, true, 'Should be valid');
    assert.equal(result.players.length, 5, 'Should cap at 5 players');
  });

  it('should handle null input gracefully', () => {
    const result = parseRegistration(null);
    assert.equal(result.valid, false, 'Should be invalid for null input');
  });

  it('should handle case-insensitive team name prefix', () => {
    const [p1, p2] = generateUserIds(2);
    const msg = `TEAM NAME: Upper Case Team\n${mention(p1)} ${mention(p2)}`;
    const result = parseRegistration(msg);

    assert.equal(result.valid, true, 'Should be valid with uppercase prefix');
    assert.equal(result.teamName, 'Upper Case Team', 'Should extract team name');
  });
});
