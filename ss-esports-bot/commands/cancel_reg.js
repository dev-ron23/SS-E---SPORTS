'use strict';

/**
 * /cancel_reg command
 * Cancels a squad registration: updates DB status, removes roles, edits embed,
 * removes from group listing, DMs all players, and logs the action.
 * Requirements: 5.1-5.8
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const embedBuilder = require('../utils/embedBuilder');
const dmEngine = require('../utils/dmEngine');
const logger = require('../utils/logger');
const groups = require('../handlers/groups');
const emitter = require('../bridge/emitter');

const REGISTERED_ROLE_ID = '1502219695791538226';
const CONFIRMED_SQUADS_CHANNEL_ID = '1502217351897288847';
const VC_COUNTER_CHANNEL_ID = '1502217617522425966';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cancel_reg')
    .setDescription('Cancel a squad registration')
    .addStringOption((opt) =>
      opt.setName('squad_id').setDescription('The squad ID to cancel (e.g. SSE-0001)').setRequired(true)
    ),

  async execute(interaction) {
    const squadId = interaction.options.getString('squad_id');
    const guild = interaction.guild;
    const client = interaction.client;
    const moderator = interaction.user.tag;

    await interaction.deferReply({ ephemeral: true });

    // Fetch squad from DB
    const squad = db.getSquadById(squadId);
    if (!squad) {
      return interaction.editReply({ content: `❌ Squad \`${squadId}\` not found.` });
    }
    if (squad.status === 'cancelled') {
      return interaction.editReply({ content: `⚠️ Squad \`${squadId}\` is already cancelled.` });
    }

    // 1. Update squad status to 'cancelled' in DB (Requirement 5.1)
    db.updateSquadStatus(squadId, 'cancelled');
    emitter.emit('squad:cancelled', { squad_id: squadId });

    // 2. Remove Registered_Role and group role from all players (Requirements 5.2, 5.3)
    if (guild) {
      const groupNo = squad.group_no;
      const groupRecord = groupNo != null ? db.getGroup(groupNo) : null;

      for (const playerId of squad.player_ids) {
        try {
          const member = await guild.members.fetch(playerId);
          // Remove Registered_Role
          await member.roles.remove(REGISTERED_ROLE_ID).catch(() => {});
          // Remove group role
          if (groupRecord && groupRecord.role_id) {
            await member.roles.remove(groupRecord.role_id).catch(() => {});
          }
        } catch {
          // Member may have left the server
        }
      }
    }

    // 3. Edit confirmed embed to show cancellation (Requirement 5.6)
    if (guild && squad.confirmed_msg_id) {
      try {
        const confirmedChannel = await guild.channels.fetch(CONFIRMED_SQUADS_CHANNEL_ID);
        if (confirmedChannel) {
          const msg = await confirmedChannel.messages.fetch(squad.confirmed_msg_id);
          const cancelEmbed = embedBuilder.buildRegistrationCancelledEmbed(squad);
          await msg.edit({ embeds: [cancelEmbed] });
        }
      } catch {
        // Message may have been deleted
      }
    }

    // 4. Remove from group listing (Requirement 5.4, 5.5)
    if (guild && squad.group_no != null) {
      await groups.removeSquadFromGroup(squadId, guild).catch(() => {});
    }

    // Update VC counter
    if (guild) {
      try {
        const count = db.countActiveSquads();
        const vcChannel = await guild.channels.fetch(VC_COUNTER_CHANNEL_ID);
        if (vcChannel) await vcChannel.setName(`✅ Registered: ${count}`);
      } catch {
        // Non-critical
      }
    }

    // 5. DM all players (Requirement 5.7)
    const cancelEmbed = embedBuilder.buildRegistrationCancelledEmbed(squad);
    for (const playerId of squad.player_ids) {
      await dmEngine.dmUser(playerId, cancelEmbed, client).catch(() => {});
    }

    // 6. Log action (Requirement 5.8)
    await logger.logAction(
      client,
      'REGISTRATION_CANCELLED',
      {
        actorId: interaction.user.id,
        targetId: squadId,
        description: `Squad ${squadId} (${squad.team_name}) cancelled by ${moderator}`,
      },
      moderator
    ).catch(() => {});

    await interaction.editReply({
      content: `✅ Squad \`${squadId}\` (${squad.team_name}) has been cancelled. All players have been notified.`,
    });
  },
};
