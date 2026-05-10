'use strict';

/**
 * Registration message parser for SS E-Sports Tournament Bot
 * Extracts team name, player mentions, and game UIDs from free-form text.
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8
 */

/**
 * Parse a registration message and extract squad data.
 *
 * Algorithm:
 *   1. Normalize content (trim, collapse whitespace)
 *   2. Extract team name via regex patterns
 *   3. Extract all @mentions
 *   4. Extract UIDs and pair with nearest preceding mention
 *   5. Deduplicate mentions (keep first occurrence)
 *   6. Validate: teamName exists AND mentions.length >= 2
 *
 * @param {string} content - Raw message content
 * @returns {{ valid: boolean, teamName?: string, players?: string[], uids?: Object, reason?: string }}
 */
function parseRegistration(content) {
  if (!content || typeof content !== 'string') {
    return { valid: false, reason: 'Empty or invalid message content.' };
  }

  // Step 1: Normalize content
  const normalized = content.trim().replace(/\s+/g, ' ');

  // Step 2: Extract team name
  // Try "team name: ..." first, then "team: ..."
  let teamName = null;

  const teamNamePatterns = [
    /team\s*name\s*[:\-]\s*(.+?)(?=<@|\n|uid|$)/i,
    /team\s*[:\-]\s*(.+?)(?=<@|\n|uid|$)/i,
  ];

  for (const pattern of teamNamePatterns) {
    const match = normalized.match(pattern);
    if (match) {
      teamName = match[1].trim();
      // Remove trailing whitespace and common separators
      teamName = teamName.replace(/[\s,|]+$/, '').trim();
      if (teamName.length > 0) break;
    }
  }

  // Step 3: Extract all @mentions: <@USER_ID> or <@!USER_ID>
  const mentionRegex = /<@!?(\d+)>/g;
  const allMentions = [];
  let mentionMatch;
  while ((mentionMatch = mentionRegex.exec(normalized)) !== null) {
    allMentions.push(mentionMatch[1]);
  }

  // Step 5: Deduplicate mentions (keep first occurrence)
  const seen = new Set();
  const players = [];
  for (const id of allMentions) {
    if (!seen.has(id)) {
      seen.add(id);
      players.push(id);
    }
  }

  // Step 4: Extract UIDs and pair with nearest preceding mention
  // We need to find each UID and associate it with the mention that appears just before it
  const uids = {};

  // Build a list of positions: mentions and UIDs in order
  const uidRegex = /uid\s*[:\-]\s*(\d+)/gi;
  const mentionPositions = [];
  const uidPositions = [];

  // Reset and collect mention positions
  const mentionRegex2 = /<@!?(\d+)>/g;
  let m;
  while ((m = mentionRegex2.exec(normalized)) !== null) {
    mentionPositions.push({ index: m.index, id: m[1] });
  }

  // Collect UID positions
  let u;
  while ((u = uidRegex.exec(normalized)) !== null) {
    uidPositions.push({ index: u.index, uid: u[1] });
  }

  // For each UID, find the nearest preceding mention
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

  // Step 6: Validate
  if (!teamName) {
    return { valid: false, reason: 'No team name found. Use "Team Name: ..." or "Team: ...".' };
  }

  if (players.length < 2) {
    return {
      valid: false,
      reason: `Insufficient players: found ${players.length}, need at least 2.`,
    };
  }

  // Limit to 5 players max (2-4 mandatory + 1 optional per spec)
  const acceptedPlayers = players.slice(0, 5);

  return {
    valid: true,
    teamName,
    players: acceptedPlayers,
    uids,
  };
}

module.exports = { parseRegistration };
