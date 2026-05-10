'use strict';

/**
 * Property-based tests for the scores database layer
 *
 * Property 1: Score Non-Negativity
 *   Validates: Requirements 3.1, 3.2, 15.2, 15.5
 *
 * Property 2: Leaderboard Ordering
 *   Validates: Requirements 3.4, 3.5
 *
 * Property 3: Score Round-Trip Persistence
 *   Validates: Requirements 3.1, 3.2, 15.2, 15.5
 *
 * Property 12: Leaderboard Zero-Score Display
 *   Validates: Requirements 3.8
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const db = require('./db');

// ─────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────

let _squadCounter = 0;

/**
 * Reset the squad counter (call in beforeEach)
 */
function resetCounter() {
  _squadCounter = 0;
}

/**
 * Insert a minimal active squad and return it
 * @param {Object} overrides
 * @returns {Object}
 */
function insertTestSquad(overrides = {}) {
  _squadCounter += 1;
  const squadNo = overrides.squad_no ?? _squadCounter;
  const squadId = overrides.squad_id ?? db.generateSquadId(squadNo);
  const squad = {
    squad_id: squadId,
    squad_no: squadNo,
    team_name: overrides.team_name ?? `Team ${squadNo}`,
    leader_id: overrides.leader_id ?? `10000000000000${String(squadNo).padStart(4, '0')}`,
    player_ids: overrides.player_ids ?? [`10000000000000${String(squadNo).padStart(4, '0')}`],
    player_uids: overrides.player_uids ?? {},
    group_no: null,
    registration_msg_id: null,
    registration_channel_id: null,
    confirmed_msg_id: null,
    group_msg_id: null,
    registered_at: new Date().toISOString(),
    status: overrides.status ?? 'active',
    winner_position: null,
  };
  db.insertSquad(squad);
  return squad;
}

/**
 * Build a score record for insertion
 * @param {string} squadId
 * @param {number} kills
 * @param {number} placementPoints
 * @returns {Object}
 */
function makeScore(squadId, kills, placementPoints) {
  return {
    squad_id: squadId,
    match_id: null,
    kills,
    placement_points: placementPoints,
    recorded_at: new Date().toISOString(),
  };
}

/**
 * Generate a non-negative integer in [0, max]
 * @param {number} max
 * @returns {number}
 */
function randNat(max = 50) {
  return Math.floor(Math.random() * (max + 1));
}

// ─────────────────────────────────────────────
// Property 1: Score Non-Negativity
// Property 3: Score Round-Trip Persistence
// Validates: Requirements 3.1, 3.2, 15.2, 15.5
// ─────────────────────────────────────────────

describe('Property 1 & 3: Score Non-Negativity and Round-Trip Persistence', () => {
  beforeEach(() => {
    db.initDb(':memory:');
    resetCounter();
  });

  afterEach(() => {
    db.closeDb();
  });

  test('Property 1: total_points equals kills + placement_points for 20+ non-negative pairs', () => {
    // **Validates: Requirements 3.1, 3.2, 15.2, 15.5**
    const squad = insertTestSquad();

    // Fixed representative cases
    const fixedCases = [
      { kills: 0, placement: 0 },
      { kills: 0, placement: 1 },
      { kills: 1, placement: 0 },
      { kills: 5, placement: 10 },
      { kills: 10, placement: 5 },
      { kills: 25, placement: 25 },
      { kills: 50, placement: 0 },
      { kills: 0, placement: 50 },
      { kills: 1, placement: 1 },
      { kills: 100, placement: 100 },
    ];

    for (const { kills, placement } of fixedCases) {
      const record = db.insertScore(makeScore(squad.squad_id, kills, placement));
      assert.equal(
        record.total_points,
        kills + placement,
        `total_points must equal kills(${kills}) + placement(${placement})`
      );
      assert.ok(record.kills >= 0, 'kills must be >= 0');
      assert.ok(record.placement_points >= 0, 'placement_points must be >= 0');
    }

    // Random cases to reach 20+ iterations
    for (let i = 0; i < 15; i++) {
      const kills = randNat(50);
      const placement = randNat(50);
      const record = db.insertScore(makeScore(squad.squad_id, kills, placement));
      assert.equal(
        record.total_points,
        kills + placement,
        `total_points must equal kills(${kills}) + placement(${placement})`
      );
      assert.ok(record.kills >= 0, 'kills must be >= 0');
      assert.ok(record.placement_points >= 0, 'placement_points must be >= 0');
    }
  });

  test('Property 1: insertScore throws for negative kills', () => {
    // **Validates: Requirements 3.2, 15.5**
    const squad = insertTestSquad();
    assert.throws(
      () => db.insertScore(makeScore(squad.squad_id, -1, 5)),
      /kills must be >= 0/,
      'insertScore should throw when kills < 0'
    );
  });

  test('Property 1: insertScore throws for negative placement_points', () => {
    // **Validates: Requirements 3.2, 15.5**
    const squad = insertTestSquad();
    assert.throws(
      () => db.insertScore(makeScore(squad.squad_id, 5, -1)),
      /placement_points must be >= 0/,
      'insertScore should throw when placement_points < 0'
    );
  });

  test('Property 3: score round-trip — inserted record matches fetched record for 20+ iterations', () => {
    // **Validates: Requirements 3.1, 3.2, 15.2, 15.5**
    const squad = insertTestSquad();

    const testPairs = [];

    // Fixed cases
    const fixedCases = [
      { kills: 0, placement: 0 },
      { kills: 3, placement: 7 },
      { kills: 10, placement: 20 },
      { kills: 50, placement: 50 },
      { kills: 1, placement: 99 },
    ];
    for (const { kills, placement } of fixedCases) {
      testPairs.push({ kills, placement });
    }

    // Random cases to reach 20+ iterations
    for (let i = 0; i < 20; i++) {
      testPairs.push({ kills: randNat(50), placement: randNat(50) });
    }

    for (const { kills, placement } of testPairs) {
      const inserted = db.insertScore(makeScore(squad.squad_id, kills, placement));

      // Fetch by squad and find the matching record
      const allScores = db.getScoresBySquad(squad.squad_id);
      const fetched = allScores.find((s) => s.id === inserted.id);

      assert.ok(fetched, `Score with id=${inserted.id} should be fetchable by squad`);
      assert.equal(fetched.squad_id, squad.squad_id, 'squad_id must match');
      assert.equal(fetched.kills, kills, `kills must match: expected ${kills}, got ${fetched.kills}`);
      assert.equal(
        fetched.placement_points,
        placement,
        `placement_points must match: expected ${placement}, got ${fetched.placement_points}`
      );
      assert.equal(
        fetched.total_points,
        kills + placement,
        `total_points must equal kills + placement_points`
      );
    }
  });

  test('Property 3: getScoresBySquad returns only scores for the requested squad', () => {
    // **Validates: Requirements 3.1**
    const squad1 = insertTestSquad();
    const squad2 = insertTestSquad();

    db.insertScore(makeScore(squad1.squad_id, 5, 10));
    db.insertScore(makeScore(squad1.squad_id, 3, 7));
    db.insertScore(makeScore(squad2.squad_id, 8, 2));

    const scores1 = db.getScoresBySquad(squad1.squad_id);
    const scores2 = db.getScoresBySquad(squad2.squad_id);

    assert.equal(scores1.length, 2, 'squad1 should have 2 score records');
    assert.equal(scores2.length, 1, 'squad2 should have 1 score record');

    for (const s of scores1) {
      assert.equal(s.squad_id, squad1.squad_id, 'All scores for squad1 must have correct squad_id');
    }
    for (const s of scores2) {
      assert.equal(s.squad_id, squad2.squad_id, 'All scores for squad2 must have correct squad_id');
    }
  });
});

// ─────────────────────────────────────────────
// Property 2: Leaderboard Ordering
// Validates: Requirements 3.4, 3.5
// ─────────────────────────────────────────────

describe('Property 2: Leaderboard Ordering', () => {
  beforeEach(() => {
    db.initDb(':memory:');
    resetCounter();
  });

  afterEach(() => {
    db.closeDb();
  });

  test('leaderboard is sorted by total_points DESC for 10+ iterations', () => {
    // **Validates: Requirements 3.4, 3.5**
    for (let iter = 0; iter < 10; iter++) {
      // Re-initialize DB for each iteration to get a clean state
      db.closeDb();
      db.initDb(':memory:');
      resetCounter();

      // Insert 3-6 squads with random scores
      const numSquads = 3 + (iter % 4); // 3, 4, 5, 6, 3, 4, 5, 6, 3, 4
      const squads = [];
      for (let i = 0; i < numSquads; i++) {
        squads.push(insertTestSquad());
      }

      // Assign random scores to each squad
      for (const squad of squads) {
        const kills = randNat(30);
        const placement = randNat(30);
        db.insertScore(makeScore(squad.squad_id, kills, placement));
      }

      const leaderboard = db.getLeaderboard();

      // Verify ordering: for every adjacent pair A, B: total_points(A) >= total_points(B)
      for (let i = 0; i < leaderboard.length - 1; i++) {
        const a = leaderboard[i];
        const b = leaderboard[i + 1];

        assert.ok(
          a.total_points >= b.total_points,
          `Leaderboard entry at rank ${a.rank} (${a.total_points} pts) must have >= points than rank ${b.rank} (${b.total_points} pts)`
        );

        // If total_points are equal, total_kills must be descending
        if (a.total_points === b.total_points) {
          assert.ok(
            a.total_kills >= b.total_kills,
            `When total_points are tied (${a.total_points}), total_kills must be descending: rank ${a.rank} has ${a.total_kills} kills, rank ${b.rank} has ${b.total_kills} kills`
          );
        }
      }
    }
  });

  test('leaderboard rank is 1-based and sequential', () => {
    // **Validates: Requirements 3.4**
    const numSquads = 5;
    for (let i = 0; i < numSquads; i++) {
      const squad = insertTestSquad();
      db.insertScore(makeScore(squad.squad_id, randNat(20), randNat(20)));
    }

    const leaderboard = db.getLeaderboard();

    assert.equal(leaderboard.length, numSquads, `Leaderboard should have ${numSquads} entries`);

    for (let i = 0; i < leaderboard.length; i++) {
      assert.equal(
        leaderboard[i].rank,
        i + 1,
        `Entry at index ${i} should have rank ${i + 1}, got ${leaderboard[i].rank}`
      );
    }
  });

  test('leaderboard ordering: higher total_points always ranks higher', () => {
    // **Validates: Requirements 3.4, 3.5**
    // Insert squads with known, distinct total_points to verify strict ordering
    const squad1 = insertTestSquad({ team_name: 'High Score' });
    const squad2 = insertTestSquad({ team_name: 'Mid Score' });
    const squad3 = insertTestSquad({ team_name: 'Low Score' });

    db.insertScore(makeScore(squad1.squad_id, 20, 30)); // total = 50
    db.insertScore(makeScore(squad2.squad_id, 10, 20)); // total = 30
    db.insertScore(makeScore(squad3.squad_id, 5, 5));   // total = 10

    const leaderboard = db.getLeaderboard();

    assert.equal(leaderboard.length, 3, 'Should have 3 entries');
    assert.equal(leaderboard[0].squad_id, squad1.squad_id, 'squad1 (50 pts) should be rank 1');
    assert.equal(leaderboard[1].squad_id, squad2.squad_id, 'squad2 (30 pts) should be rank 2');
    assert.equal(leaderboard[2].squad_id, squad3.squad_id, 'squad3 (10 pts) should be rank 3');
    assert.equal(leaderboard[0].rank, 1);
    assert.equal(leaderboard[1].rank, 2);
    assert.equal(leaderboard[2].rank, 3);
  });

  test('leaderboard tie-breaking: equal total_points sorted by total_kills DESC', () => {
    // **Validates: Requirements 3.5**
    const squad1 = insertTestSquad({ team_name: 'More Kills' });
    const squad2 = insertTestSquad({ team_name: 'Fewer Kills' });

    // Both have total_points = 20, but squad1 has more kills
    db.insertScore(makeScore(squad1.squad_id, 15, 5));  // kills=15, total=20
    db.insertScore(makeScore(squad2.squad_id, 5, 15));  // kills=5, total=20

    const leaderboard = db.getLeaderboard();

    assert.equal(leaderboard.length, 2, 'Should have 2 entries');
    assert.equal(leaderboard[0].total_points, 20, 'Both should have 20 total_points');
    assert.equal(leaderboard[1].total_points, 20, 'Both should have 20 total_points');
    assert.equal(
      leaderboard[0].squad_id,
      squad1.squad_id,
      'squad1 (15 kills) should rank higher than squad2 (5 kills) when points are tied'
    );
    assert.equal(leaderboard[0].rank, 1);
    assert.equal(leaderboard[1].rank, 2);
  });

  test('leaderboard aggregates multiple score records per squad', () => {
    // **Validates: Requirements 3.4**
    const squad1 = insertTestSquad();
    const squad2 = insertTestSquad();

    // squad1: two score records
    db.insertScore(makeScore(squad1.squad_id, 5, 10));  // 15 pts
    db.insertScore(makeScore(squad1.squad_id, 3, 7));   // 10 pts → total 25 pts, 8 kills

    // squad2: one score record
    db.insertScore(makeScore(squad2.squad_id, 10, 10)); // 20 pts

    const leaderboard = db.getLeaderboard();

    const entry1 = leaderboard.find((e) => e.squad_id === squad1.squad_id);
    const entry2 = leaderboard.find((e) => e.squad_id === squad2.squad_id);

    assert.ok(entry1, 'squad1 should appear in leaderboard');
    assert.ok(entry2, 'squad2 should appear in leaderboard');

    assert.equal(entry1.total_kills, 8, 'squad1 total_kills should be 5+3=8');
    assert.equal(entry1.total_placement_points, 17, 'squad1 total_placement_points should be 10+7=17');
    assert.equal(entry1.total_points, 25, 'squad1 total_points should be 25');

    assert.equal(entry2.total_kills, 10, 'squad2 total_kills should be 10');
    assert.equal(entry2.total_placement_points, 10, 'squad2 total_placement_points should be 10');
    assert.equal(entry2.total_points, 20, 'squad2 total_points should be 20');

    // squad1 (25 pts) should rank above squad2 (20 pts)
    assert.ok(entry1.rank < entry2.rank, 'squad1 should rank higher than squad2');
  });
});

// ─────────────────────────────────────────────
// Property 12: Leaderboard Zero-Score Display
// Validates: Requirements 3.8
// ─────────────────────────────────────────────

describe('Property 12: Leaderboard Zero-Score Display', () => {
  beforeEach(() => {
    db.initDb(':memory:');
    resetCounter();
  });

  afterEach(() => {
    db.closeDb();
  });

  test('active squads with no score records appear in leaderboard with all zeros', () => {
    // **Validates: Requirements 3.8**
    const numSquads = 5;
    const squads = [];
    for (let i = 0; i < numSquads; i++) {
      squads.push(insertTestSquad());
    }

    // No scores inserted — all squads have zero scores
    const leaderboard = db.getLeaderboard();

    assert.equal(
      leaderboard.length,
      numSquads,
      `All ${numSquads} active squads should appear in leaderboard even with no scores`
    );

    for (const entry of leaderboard) {
      assert.equal(
        entry.total_kills,
        0,
        `Squad ${entry.squad_id} should have total_kills=0 when no scores recorded`
      );
      assert.equal(
        entry.total_placement_points,
        0,
        `Squad ${entry.squad_id} should have total_placement_points=0 when no scores recorded`
      );
      assert.equal(
        entry.total_points,
        0,
        `Squad ${entry.squad_id} should have total_points=0 when no scores recorded`
      );
    }
  });

  test('cancelled squads do not appear in leaderboard', () => {
    // **Validates: Requirements 3.8**
    const activeSquad = insertTestSquad({ status: 'active' });
    const cancelledSquad = insertTestSquad({ status: 'cancelled' });

    const leaderboard = db.getLeaderboard();

    const activeEntry = leaderboard.find((e) => e.squad_id === activeSquad.squad_id);
    const cancelledEntry = leaderboard.find((e) => e.squad_id === cancelledSquad.squad_id);

    assert.ok(activeEntry, 'Active squad should appear in leaderboard');
    assert.equal(cancelledEntry, undefined, 'Cancelled squad should NOT appear in leaderboard');
  });

  test('leaderboard shows zeros for squads with no scores across multiple squad counts', () => {
    // **Validates: Requirements 3.8**
    // Test with varying numbers of squads (simulating property testing with multiple iterations)
    const squadCounts = [1, 3, 5, 8, 10];

    for (const count of squadCounts) {
      db.closeDb();
      db.initDb(':memory:');
      resetCounter();

      for (let i = 0; i < count; i++) {
        insertTestSquad();
      }

      const leaderboard = db.getLeaderboard();

      assert.equal(
        leaderboard.length,
        count,
        `With ${count} squads and no scores, leaderboard should have ${count} entries`
      );

      for (const entry of leaderboard) {
        assert.equal(entry.total_kills, 0, `total_kills should be 0 for squad with no scores`);
        assert.equal(
          entry.total_placement_points,
          0,
          `total_placement_points should be 0 for squad with no scores`
        );
        assert.equal(entry.total_points, 0, `total_points should be 0 for squad with no scores`);
      }
    }
  });

  test('leaderboard correctly mixes squads with and without scores', () => {
    // **Validates: Requirements 3.8**
    const squadWithScore = insertTestSquad({ team_name: 'Has Score' });
    const squadNoScore1 = insertTestSquad({ team_name: 'No Score 1' });
    const squadNoScore2 = insertTestSquad({ team_name: 'No Score 2' });

    db.insertScore(makeScore(squadWithScore.squad_id, 10, 15)); // total = 25

    const leaderboard = db.getLeaderboard();

    assert.equal(leaderboard.length, 3, 'All 3 squads should appear');

    const entryWithScore = leaderboard.find((e) => e.squad_id === squadWithScore.squad_id);
    const entryNoScore1 = leaderboard.find((e) => e.squad_id === squadNoScore1.squad_id);
    const entryNoScore2 = leaderboard.find((e) => e.squad_id === squadNoScore2.squad_id);

    assert.ok(entryWithScore, 'Squad with score should be in leaderboard');
    assert.ok(entryNoScore1, 'Squad without score 1 should be in leaderboard');
    assert.ok(entryNoScore2, 'Squad without score 2 should be in leaderboard');

    assert.equal(entryWithScore.total_points, 25, 'Squad with score should have 25 total_points');
    assert.equal(entryNoScore1.total_kills, 0, 'Squad without score should have 0 kills');
    assert.equal(entryNoScore1.total_placement_points, 0, 'Squad without score should have 0 placement');
    assert.equal(entryNoScore1.total_points, 0, 'Squad without score should have 0 total_points');
    assert.equal(entryNoScore2.total_kills, 0, 'Squad without score should have 0 kills');
    assert.equal(entryNoScore2.total_points, 0, 'Squad without score should have 0 total_points');

    // Squad with score should rank first
    assert.equal(entryWithScore.rank, 1, 'Squad with 25 pts should be rank 1');
  });

  test('empty leaderboard when no active squads exist', () => {
    // **Validates: Requirements 3.8**
    const leaderboard = db.getLeaderboard();
    assert.equal(leaderboard.length, 0, 'Leaderboard should be empty when no active squads exist');
  });
});
