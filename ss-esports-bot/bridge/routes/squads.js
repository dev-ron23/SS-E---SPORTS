'use strict';

const express = require('express');
const router = express.Router();
const db = require('../../database/db');
const emitter = require('../emitter');
const embedBuilder = require('../../utils/embedBuilder');
const dmEngine = require('../../utils/dmEngine');
const logger = require('../../utils/logger');
const groups = require('../../handlers/groups');

const REGISTERED_ROLE_ID = '1502219695791538226';
const CONFIRMED_SQUADS_CHANNEL_ID = '1502217351897288847';
const VC_COUNTER_CHANNEL_ID = '1502217617522425966';

let _client = null;
let _guild = null;

function init(client, guild) {
  _client = client;
  _guild = guild;
}

// GET /api/squads
router.get('/', (req, res) => {
  const squads = db.getAllSquads();
  res.json({ success: true, data: squads });
});

// POST /api/cancel-squad
router.post('/cancel-squad', async (req, res) => {
  const { squad_id } = req.body;
  if (!squad_id) {
    return res.status(400).json({ success: false, error: 'Missing required field: squad_id', field: 'squad_id' });
  }

  const squad = db.getSquadById(squad_id);
  if (!squad) {
    return res.status(404).json({ success: false, error: `Squad ${squad_id} not found` });
  }
  if (squad.status === 'cancelled') {
    return res.status(400).json({ success: false, error: `Squad ${squad_id} is already cancelled` });
  }

  try {
    // Update DB status
    db.updateSquadStatus(squad_id, 'cancelled');

    // Remove roles from all players
    if (_guild) {
      const groupRecord = squad.group_no != null ? db.getGroup(squad.group_no) : null;
      for (const playerId of squad.player_ids) {
        try {
          const member = await _guild.members.fetch(playerId);
          await member.roles.remove(REGISTERED_ROLE_ID).catch(() => {});
          if (groupRecord?.role_id) {
            await member.roles.remove(groupRecord.role_id).catch(() => {});
          }
        } catch { /* member may have left */ }
      }
    }

    // Edit confirmed embed
    if (_guild && squad.confirmed_msg_id) {
      try {
        const ch = await _guild.channels.fetch(CONFIRMED_SQUADS_CHANNEL_ID);
        if (ch) {
          const msg = await ch.messages.fetch(squad.confirmed_msg_id);
          await msg.edit({ embeds: [embedBuilder.buildRegistrationCancelledEmbed(squad)] });
        }
      } catch { /* message may be deleted */ }
    }

    // Remove from group listing
    if (_guild && squad.group_no != null) {
      await groups.removeSquadFromGroup(squad_id, _guild).catch(() => {});
    }

    // Update VC counter
    if (_guild) {
      try {
        const count = db.countActiveSquads();
        const vcCh = await _guild.channels.fetch(VC_COUNTER_CHANNEL_ID);
        if (vcCh) await vcCh.setName(`✅ Registered: ${count}`);
      } catch { /* non-critical */ }
    }

    // DM all players
    if (_client) {
      const cancelEmbed = embedBuilder.buildRegistrationCancelledEmbed(squad);
      for (const pid of squad.player_ids) {
        await dmEngine.dmUser(pid, cancelEmbed, _client).catch(() => {});
      }
    }

    // Log action
    if (_client) {
      await logger.logAction(_client, 'REGISTRATION_CANCELLED', {
        actorId: null,
        targetId: squad_id,
        description: `Squad ${squad_id} (${squad.team_name}) cancelled via dashboard`,
      }, 'Dashboard').catch(() => {});
    }

    emitter.emit('squad:cancelled', { squad_id });
    res.json({ success: true });
  } catch (err) {
    logger.terminalLog('ERROR', `Bridge cancel-squad error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/edit-squad
router.post('/edit-squad', async (req, res) => {
  const { squad_id, team_name, leader_id, player_ids } = req.body;
  if (!squad_id) {
    return res.status(400).json({ success: false, error: 'Missing required field: squad_id', field: 'squad_id' });
  }
  if (!team_name && !leader_id && !player_ids) {
    return res.status(400).json({ success: false, error: 'At least one update field required (team_name, leader_id, player_ids)' });
  }

  const squad = db.getSquadById(squad_id);
  if (!squad) {
    return res.status(404).json({ success: false, error: `Squad ${squad_id} not found` });
  }

  try {
    const updates = {};
    if (team_name) updates.team_name = team_name;
    if (leader_id) updates.leader_id = leader_id;
    if (player_ids) updates.player_ids = player_ids;

    db.updateSquad(squad_id, updates);
    const updatedSquad = db.getSquadById(squad_id);

    // Edit confirmed embed
    if (_guild && updatedSquad.confirmed_msg_id) {
      try {
        const ch = await _guild.channels.fetch(CONFIRMED_SQUADS_CHANNEL_ID);
        if (ch) {
          const msg = await ch.messages.fetch(updatedSquad.confirmed_msg_id);
          const jumpUrl = `https://discord.com/channels/${_guild.id}/${updatedSquad.registration_channel_id}/${updatedSquad.registration_msg_id}`;
          await msg.edit({ embeds: [embedBuilder.buildEditConfirmedEmbed(updatedSquad)] });
        }
      } catch { /* non-critical */ }
    }

    if (_client) {
      await logger.logAction(_client, 'REGISTRATION_EDITED', {
        actorId: null,
        targetId: squad_id,
        description: `Squad ${squad_id} edited via dashboard`,
      }, 'Dashboard').catch(() => {});
    }

    emitter.emit('squad:updated', updatedSquad);
    res.json({ success: true, data: updatedSquad });
  } catch (err) {
    logger.terminalLog('ERROR', `Bridge edit-squad error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = { router, init };
