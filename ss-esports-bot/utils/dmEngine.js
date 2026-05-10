'use strict';

/**
 * DM Notification Engine for SS E-Sports Tournament Bot
 * Dispatches Discord DMs with retry logic.
 * Requirements: 20.1, 20.2, 20.3, 20.4
 */

const db = require('../database/db');

const MAX_RETRIES = 3;
// Allow override via environment variable for testing (set DM_RETRY_DELAY_MS=0 in tests)
const RETRY_DELAY_MS = process.env.DM_RETRY_DELAY_MS !== undefined
  ? parseInt(process.env.DM_RETRY_DELAY_MS, 10)
  : 1000;

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a DM to a single user with up to 3 retry attempts.
 * Logs failure to terminal after retries exhausted.
 *
 * @param {string} userId - Discord user ID
 * @param {import('discord.js').EmbedBuilder} embed - Embed to send
 * @param {import('discord.js').Client} client - Discord.js client
 * @returns {Promise<boolean>} true if delivered, false if failed
 */
async function dmUser(userId, embed, client) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const user = await client.users.fetch(userId);
      await user.send({ embeds: [embed] });
      return true;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  // All retries exhausted — log failure to terminal
  console.error(
    `[DM Engine] Failed to DM user ${userId} after ${MAX_RETRIES} attempts: ${lastError?.message}`
  );
  return false;
}

/**
 * Send a DM to all players in all active squads.
 *
 * @param {import('discord.js').EmbedBuilder} embed - Embed to send
 * @param {import('discord.js').Client} client - Discord.js client
 * @returns {Promise<{ sent: number, failed: number }>}
 */
async function dmAllPlayers(embed, client) {
  const squads = db.getAllActiveSquads();
  const seen = new Set();
  let sent = 0;
  let failed = 0;

  for (const squad of squads) {
    for (const playerId of squad.player_ids) {
      if (seen.has(playerId)) continue;
      seen.add(playerId);

      const success = await dmUser(playerId, embed, client);
      if (success) {
        sent++;
      } else {
        failed++;
      }
    }
  }

  return { sent, failed };
}

/**
 * Send a DM to all players in a specific squad.
 *
 * @param {string} squadId - Squad ID
 * @param {import('discord.js').EmbedBuilder} embed - Embed to send
 * @param {import('discord.js').Client} client - Discord.js client
 * @returns {Promise<{ sent: number, failed: number }>}
 */
async function dmSquadPlayers(squadId, embed, client) {
  const squad = db.getSquadById(squadId);
  if (!squad) {
    console.error(`[DM Engine] Squad ${squadId} not found.`);
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const playerId of squad.player_ids) {
    const success = await dmUser(playerId, embed, client);
    if (success) {
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, failed };
}

module.exports = {
  dmUser,
  dmAllPlayers,
  dmSquadPlayers,
  MAX_RETRIES,
};
