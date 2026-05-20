'use strict';

/**
 * Registration message parser for SS E-Sports Tournament Bot
 * Extracts team name, player mentions, and game UIDs from free-form text.
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8
 */

/**
 * Parse a registration message and extract squad data.
 *
 * Team name extraction strategy (in priority order):
 *  1. "Team Name : Rockstar Esports" → "Rockstar Esports"
 *  2. "Team Name - Rockstar Esports" → "Rockstar Esports"
 *  3. "Team Name :- Rockstar Esports" → "Rockstar Esports"
 *  4. "Team Name Rockstar Esports\nPlayer 1" → "Rockstar Esports"
 *  5. Stops at first mention, "PLAYER", "IGN", newline, or end of string
 *
 * @param {string} content - Raw message content
 * @returns {{ valid: boolean, teamName?: string, players?: string[], uids?: Object, reason?: string }}
 */
function parseRegistration(content) {
  if (!content || typeof content !== 'string') {
    return { valid: false, reason: 'Empty or invalid message content.' };
  }

  // Step 1: Normalize — collapse multiple spaces/newlines into single space
  // but keep newlines as a separator for team name boundary detection
  const normalized = content.trim();

  // Step 2: Extract team name with improved patterns
  let teamName = null;

  // Pattern A: "Team Name : <name>" or "Team Name - <name>" or "Team Name :- <name>"
  // Stops at: first @mention, "PLAYER", "IGN", newline, or end
  const patternWithSeparator = /team\s*name\s*[:\-]{1,2}\s*(.+?)(?=<@|player\s*\d|ign\s*[:\-]|\n|$)/i;
  const matchA = normalized.match(patternWithSeparator);
  if (matchA) {
    teamName = matchA[1].trim().replace(/[\s,|:]+$/, '').trim();
  }

  // Pattern B: "Team Name <name>" (no separator) — stops at newline, @mention, or "PLAYER"
  if (!teamName || teamName.length === 0) {
    const patternNoSep = /team\s*name\s+(.+?)(?=<@|player\s*\d|ign\s*[:\-]|\n|$)/i;
    const matchB = normalized.match(patternNoSep);
    if (matchB) {
      teamName = matchB[1].trim().replace(/[\s,|:]+$/, '').trim();
    }
  }

  // Pattern C: "Team : <name>" or "Team - <name>"
  if (!teamName || teamName.length === 0) {
    const patternTeam = /\bteam\s*[:\-]{1,2}\s*(.+?)(?=<@|player\s*\d|ign\s*[:\-]|\n|$)/i;
    const matchC = normalized.match(patternTeam);
    if (matchC) {
      teamName = matchC[1].trim().replace(/[\s,|:]+$/, '').trim();
    }
  }

  // Clean up team name — remove trailing "player", "ign", numbers
  if (teamName) {
    teamName = teamName
      .replace(/\s*(player\s*\d.*|ign\s*[:\-].*)$/i, '')
      .replace(/[\s,|:]+$/, '')
      .trim();
  }

  // Step 3: Extract all @mentions
  const mentionRegex = /<@!?(\d+)>/g;
  const allMentions = [];
  let mentionMatch;
  while ((mentionMatch = mentionRegex.exec(normalized)) !== null) {
    allMentions.push(mentionMatch[1]);
  }

  // Deduplicate mentions
  const seen = new Set();
  const players = [];
  for (const id of allMentions) {
    if (!seen.has(id)) {
      seen.add(id);
      players.push(id);
    }
  }

  // Step 4: Extract UIDs and pair with nearest preceding mention
  const uids = {};
  const uidRegex = /uid\s*[:\-]\s*(\d+)/gi;
  const mentionPositions = [];
  const uidPositions = [];

  const mentionRegex2 = /<@!?(\d+)>/g;
  let m;
  while ((m = mentionRegex2.exec(normalized)) !== null) {
    mentionPositions.push({ index: m.index, id: m[1] });
  }

  let u;
  while ((u = uidRegex.exec(normalized)) !== null) {
    uidPositions.push({ index: u.index, uid: u[1] });
  }

  for (const uidEntry of uidPositions) {
    let nearestMention = null;
    let nearestDist = Infinity;
    for (const mentionEntry of mentionPositions) {
      if (mentionEntry.index < uidEntry.index) {
        const dist = uidEntry.index - mentionEntry.index;
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestMention = mentionEntry.id;
        }
      }
    }
    if (nearestMention !== null) {
      uids[nearestMention] = uidEntry.uid;
    }
  }

  // Step 5: Validate
  if (!teamName || teamName.length === 0) {
    return { valid: false, reason: 'No team name found. Use "Team Name: ..." format.' };
  }

  if (players.length < 2) {
    return {
      valid: false,
      reason: `Insufficient players: found ${players.length}, need at least 2.`,
    };
  }

  return {
    valid: true,
    teamName,
    players: players.slice(0, 5),
    uids,
  };
}

module.exports = { parseRegistration };
