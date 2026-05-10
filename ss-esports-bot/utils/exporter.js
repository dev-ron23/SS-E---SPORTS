'use strict';

/**
 * Data Exporter for SS E-Sports Tournament Bot
 * Generates CSV and TXT exports of squad data.
 * Requirements: 9.1, 9.2, 9.4
 */

/**
 * Escape a value for CSV output.
 * Wraps in quotes if it contains commas, quotes, or newlines.
 * @param {*} value
 * @returns {string}
 */
function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Export active squads to CSV format.
 * Includes all fields: squad ID, squad number, team name, leader ID,
 * player IDs, player UIDs, group number, registration timestamp.
 *
 * @param {Object[]} squads - Array of squad objects (should be active squads only)
 * @returns {string} CSV content
 */
function exportToCSV(squads) {
  const headers = [
    'squad_id',
    'squad_no',
    'team_name',
    'leader_id',
    'player_ids',
    'player_uids',
    'group_no',
    'registered_at',
    'status',
    'winner_position',
  ];

  const lines = [headers.join(',')];

  for (const squad of squads) {
    // Only include active squads
    if (squad.status !== 'active') continue;

    const playerIds = Array.isArray(squad.player_ids)
      ? squad.player_ids.join(';')
      : squad.player_ids || '';

    const playerUids =
      typeof squad.player_uids === 'object' && squad.player_uids !== null
        ? Object.entries(squad.player_uids)
            .map(([id, uid]) => `${id}:${uid}`)
            .join(';')
        : '';

    const row = [
      csvEscape(squad.squad_id),
      csvEscape(squad.squad_no),
      csvEscape(squad.team_name),
      csvEscape(squad.leader_id),
      csvEscape(playerIds),
      csvEscape(playerUids),
      csvEscape(squad.group_no ?? ''),
      csvEscape(squad.registered_at),
      csvEscape(squad.status),
      csvEscape(squad.winner_position ?? ''),
    ];

    lines.push(row.join(','));
  }

  return lines.join('\n');
}

/**
 * Export active squads to human-readable TXT format.
 *
 * @param {Object[]} squads - Array of squad objects (should be active squads only)
 * @returns {string} TXT content
 */
function exportToTXT(squads) {
  const lines = [];
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('           SS E-SPORTS TOURNAMENT — SQUAD ROSTER');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push(`Generated: ${new Date().toUTCString()}`);
  lines.push('');

  const activeSquads = squads.filter((s) => s.status === 'active');

  lines.push(`Total Active Squads: ${activeSquads.length}`);
  lines.push('');

  for (const squad of activeSquads) {
    lines.push('───────────────────────────────────────────────────────');
    lines.push(`Squad ID    : ${squad.squad_id}`);
    lines.push(`Squad No    : ${squad.squad_no}`);
    lines.push(`Team Name   : ${squad.team_name}`);
    lines.push(`Leader ID   : ${squad.leader_id}`);

    const playerIds = Array.isArray(squad.player_ids) ? squad.player_ids : [];
    lines.push(`Players     : ${playerIds.join(', ')}`);

    const playerUids =
      typeof squad.player_uids === 'object' && squad.player_uids !== null
        ? squad.player_uids
        : {};
    const uidEntries = Object.entries(playerUids);
    if (uidEntries.length > 0) {
      lines.push(`Game UIDs   : ${uidEntries.map(([id, uid]) => `${id}=${uid}`).join(', ')}`);
    } else {
      lines.push('Game UIDs   : None');
    }

    lines.push(`Group No    : ${squad.group_no != null ? squad.group_no : 'Not assigned'}`);
    lines.push(`Registered  : ${squad.registered_at}`);
    lines.push(`Status      : ${squad.status}`);
    if (squad.winner_position != null) {
      lines.push(`Winner Pos  : #${squad.winner_position}`);
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════');
  lines.push('                     END OF ROSTER');
  lines.push('═══════════════════════════════════════════════════════');

  return lines.join('\n');
}

module.exports = { exportToCSV, exportToTXT };
