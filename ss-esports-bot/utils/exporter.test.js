'use strict';

/**
 * Property-based and unit tests for utils/exporter.js
 * Tests Property 25: Export Completeness
 * Validates: Requirements 9.1, 9.2, 9.4
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { exportToCSV, exportToTXT } = require('./exporter');

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function randomUserId() {
  return String(100000000000000000n + BigInt(Math.floor(Math.random() * 900000000000000000)));
}

function makeSquad(overrides = {}) {
  const playerIds = [randomUserId(), randomUserId()];
  const squadNo = overrides.squad_no || 1;
  return {
    squad_id: `SSE-${String(squadNo).padStart(4, '0')}`,
    squad_no: squadNo,
    team_name: `Team ${squadNo}`,
    leader_id: playerIds[0],
    player_ids: playerIds,
    player_uids: { [playerIds[0]]: '12345678' },
    group_no: Math.ceil(squadNo / 12),
    registered_at: new Date().toISOString(),
    status: 'active',
    winner_position: null,
    ...overrides,
  };
}

function makeActiveSquads(n, startNo = 1) {
  return Array.from({ length: n }, (_, i) => makeSquad({ squad_no: startNo + i }));
}

function makeCancelledSquads(n, startNo = 1000) {
  return Array.from({ length: n }, (_, i) =>
    makeSquad({ squad_no: startNo + i, status: 'cancelled' })
  );
}

// ─────────────────────────────────────────────
// Property 25: Export Completeness
// Validates: Requirements 9.1, 9.2, 9.4
// ─────────────────────────────────────────────

describe('Property 25: Export Completeness', () => {
  it('CSV should contain exactly N active squads when given N active + M cancelled', () => {
    const N = 5;
    const M = 3;
    const squads = [...makeActiveSquads(N), ...makeCancelledSquads(M)];

    const csv = exportToCSV(squads);
    const lines = csv.split('\n').filter((l) => l.trim().length > 0);

    // First line is header
    const dataLines = lines.slice(1);
    assert.equal(dataLines.length, N, `CSV should have exactly ${N} data rows`);
  });

  it('TXT should contain exactly N active squads when given N active + M cancelled', () => {
    const N = 4;
    const M = 6;
    const squads = [...makeActiveSquads(N), ...makeCancelledSquads(M)];

    const txt = exportToTXT(squads);

    // Count occurrences of "Squad ID" lines (one per squad)
    const squadIdMatches = (txt.match(/Squad ID\s*:/g) || []).length;
    assert.equal(squadIdMatches, N, `TXT should have exactly ${N} squad entries`);
  });

  it('CSV should include all required fields in header', () => {
    const squads = makeActiveSquads(1);
    const csv = exportToCSV(squads);
    const header = csv.split('\n')[0];

    const requiredFields = [
      'squad_id',
      'squad_no',
      'team_name',
      'leader_id',
      'player_ids',
      'player_uids',
      'group_no',
      'registered_at',
    ];

    for (const field of requiredFields) {
      assert.ok(header.includes(field), `CSV header should include field: ${field}`);
    }
  });

  it('CSV should include squad data for each active squad', () => {
    const squads = makeActiveSquads(3);
    const csv = exportToCSV(squads);

    for (const squad of squads) {
      assert.ok(csv.includes(squad.squad_id), `CSV should include squad ID: ${squad.squad_id}`);
      assert.ok(csv.includes(squad.team_name), `CSV should include team name: ${squad.team_name}`);
      assert.ok(csv.includes(squad.leader_id), `CSV should include leader ID: ${squad.leader_id}`);
    }
  });

  it('TXT should include squad data for each active squad', () => {
    const squads = makeActiveSquads(3);
    const txt = exportToTXT(squads);

    for (const squad of squads) {
      assert.ok(txt.includes(squad.squad_id), `TXT should include squad ID: ${squad.squad_id}`);
      assert.ok(txt.includes(squad.team_name), `TXT should include team name: ${squad.team_name}`);
    }
  });

  it('CSV should NOT include cancelled squads', () => {
    const active = makeActiveSquads(2);
    const cancelled = makeCancelledSquads(2);
    const squads = [...active, ...cancelled];

    const csv = exportToCSV(squads);

    for (const squad of cancelled) {
      assert.ok(!csv.includes(squad.squad_id), `CSV should NOT include cancelled squad: ${squad.squad_id}`);
    }
  });

  it('TXT should NOT include cancelled squads', () => {
    const active = makeActiveSquads(2);
    const cancelled = makeCancelledSquads(2);
    const squads = [...active, ...cancelled];

    const txt = exportToTXT(squads);

    for (const squad of cancelled) {
      assert.ok(!txt.includes(squad.squad_id), `TXT should NOT include cancelled squad: ${squad.squad_id}`);
    }
  });

  it('CSV with 0 active squads should only have header', () => {
    const squads = makeCancelledSquads(5);
    const csv = exportToCSV(squads);
    const lines = csv.split('\n').filter((l) => l.trim().length > 0);

    assert.equal(lines.length, 1, 'CSV with no active squads should only have header line');
  });

  it('TXT with 0 active squads should show 0 total', () => {
    const squads = makeCancelledSquads(3);
    const txt = exportToTXT(squads);

    assert.ok(txt.includes('Total Active Squads: 0'), 'TXT should show 0 active squads');
  });

  // Property-based: export completeness holds for random N active + M cancelled
  it('export completeness holds for 20 random (N, M) combinations', () => {
    for (let i = 0; i < 20; i++) {
      const N = Math.floor(Math.random() * 10); // 0-9 active
      const M = Math.floor(Math.random() * 5); // 0-4 cancelled
      const squads = [...makeActiveSquads(N, 1), ...makeCancelledSquads(M, 1000)];

      const csv = exportToCSV(squads);
      const csvLines = csv.split('\n').filter((l) => l.trim().length > 0);
      const csvDataLines = csvLines.slice(1); // remove header

      assert.equal(
        csvDataLines.length,
        N,
        `Iteration ${i}: CSV should have exactly ${N} data rows (N=${N}, M=${M})`
      );

      const txt = exportToTXT(squads);
      const squadIdMatches = (txt.match(/Squad ID\s*:/g) || []).length;
      assert.equal(
        squadIdMatches,
        N,
        `Iteration ${i}: TXT should have exactly ${N} squad entries (N=${N}, M=${M})`
      );
    }
  });
});

// ─────────────────────────────────────────────
// Unit tests for CSV formatting
// ─────────────────────────────────────────────

describe('CSV formatting', () => {
  it('should escape commas in team names', () => {
    const squad = makeSquad({ team_name: 'Team, With, Commas', squad_no: 1 });
    const csv = exportToCSV([squad]);
    // The team name should be quoted
    assert.ok(csv.includes('"Team, With, Commas"'), 'Should quote team names with commas');
  });

  it('should escape quotes in team names', () => {
    const squad = makeSquad({ team_name: 'Team "Alpha"', squad_no: 1 });
    const csv = exportToCSV([squad]);
    // Quotes should be doubled
    assert.ok(csv.includes('"Team ""Alpha"""'), 'Should double-quote quotes in CSV');
  });

  it('should include player IDs separated by semicolons', () => {
    const playerIds = [randomUserId(), randomUserId(), randomUserId()];
    const squad = makeSquad({ player_ids: playerIds, squad_no: 1 });
    const csv = exportToCSV([squad]);

    // All player IDs should appear in the CSV
    for (const id of playerIds) {
      assert.ok(csv.includes(id), `CSV should include player ID: ${id}`);
    }
  });
});

// ─────────────────────────────────────────────
// Unit tests for TXT formatting
// ─────────────────────────────────────────────

describe('TXT formatting', () => {
  it('should include a header section', () => {
    const squads = makeActiveSquads(1);
    const txt = exportToTXT(squads);
    assert.ok(txt.includes('SS E-SPORTS'), 'TXT should include organization name');
  });

  it('should include generation timestamp', () => {
    const squads = makeActiveSquads(1);
    const txt = exportToTXT(squads);
    // Should have some date-like content
    assert.ok(txt.includes('Generated:'), 'TXT should include generation timestamp');
  });

  it('should show group number for assigned squads', () => {
    const squad = makeSquad({ group_no: 3, squad_no: 25 });
    const txt = exportToTXT([squad]);
    assert.ok(txt.includes('3'), 'TXT should include group number');
  });

  it('should show "Not assigned" for squads without group', () => {
    const squad = makeSquad({ group_no: null, squad_no: 1 });
    const txt = exportToTXT([squad]);
    assert.ok(txt.includes('Not assigned'), 'TXT should show "Not assigned" for null group');
  });
});
