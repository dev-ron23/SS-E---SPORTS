'use strict';

const express = require('express');
const router = express.Router();

let _client = null;
let _guild = null;

function init(client, guild) {
  _client = client;
  _guild = guild;
}

/**
 * GET /api/presence/:userId
 * Returns the presence/status of a guild member using the bot's cached data.
 * Requires GatewayIntentBits.GuildPresences to be enabled on the bot.
 */
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;

  if (!_guild) {
    return res.json({ status: 'offline', activities: [] });
  }

  try {
    // Try to get from cache first (fast, no API call)
    let member = _guild.members.cache.get(userId);

    // If not cached, fetch from Discord
    if (!member) {
      try {
        member = await _guild.members.fetch({ user: userId, force: false });
      } catch {
        return res.json({ status: 'offline', activities: [] });
      }
    }

    const presence = member.presence;

    if (!presence) {
      return res.json({ status: 'offline', activities: [] });
    }

    const activities = (presence.activities ?? []).map((a) => ({
      name: a.name,
      type: a.type,
      state: a.state ?? null,
      details: a.details ?? null,
      // Streaming URL
      url: a.url ?? null,
      // Custom status emoji
      emoji: a.emoji ? { name: a.emoji.name, id: a.emoji.id, animated: a.emoji.animated } : null,
    }));

    return res.json({
      status: presence.status ?? 'offline', // online | idle | dnd | offline | invisible
      clientStatus: presence.clientStatus ?? null, // { desktop?, mobile?, web? }
      activities,
    });
  } catch {
    return res.json({ status: 'offline', activities: [] });
  }
});

module.exports = { router, init };
