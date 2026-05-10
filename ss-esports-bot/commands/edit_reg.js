'use strict';

/**
 * /edit_reg command
 * Edits a squad registration with admin confirmation via DM buttons.
 * Requirements: 6.1-6.11
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const db = require('../database/db');
const parser = require('../utils/parser');
const embedBuilder = require('../utils/embedBuilder');
const dmEngine = require('../utils/dmEngine');
const logger = require('../utils/logger');
const emitter = require('../bridge/emitter');

const CONFIRMED_SQUADS_CHANNEL_ID = '1502217351897288847';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('edit_reg')
    .setDescription('Edit a squad registration')
    .addStringOption((opt) =>
      opt.setName('previous_team_name').setDescription('Current team name').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('new_team_name').setDescription('New team name').setRequired(true)
    )
    .addUserOption((opt) =>
      opt.setName('leader').setDescription('New squad leader').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('new_format').setDescription('New registration format (mentions + UIDs)').setRequired(true)
    ),

  async execute(interaction) {
    const previousTeamName = interaction.options.getString('previous_team_name');
    const newTeamName = interaction.options.getString('new_team_name');
    const leaderUser = interaction.options.getUser('leader');
    const newFormat = interaction.options.getString('new_format');
    const guild = interaction.guild;
    const client = interaction.client;
    const moderator = interaction.user.tag;

    await interaction.deferReply({ ephemeral: true });

    // Find existing squad by previous team name (Requirement 6.1)
    const oldSquad = db.getSquadByTeamName(previousTeamName);
    if (!oldSquad) {
      return interaction.editReply({ content: `❌ No active squad found with team name \`${previousTeamName}\`.` });
    }

    // Parse new format (Requirement 6.2)
    const parsed = parser.parseRegistration(newFormat);
    if (!parsed.valid) {
      return interaction.editReply({ content: `❌ Invalid new format: ${parsed.reason}` });
    }

    const newData = {
      teamName: newTeamName,
      team_name: newTeamName,
      players: parsed.players,
      uids: parsed.uids || {},
      leaderId: leaderUser.id,
    };

    // Build edit-preview embed (Requirement 6.3)
    const previewEmbed = embedBuilder.buildEditPreviewEmbed(oldSquad, newData);

    // Build confirm/reject buttons
    const confirmId = `edit_confirm_${oldSquad.squad_id}_${Date.now()}`;
    const rejectId = `edit_reject_${oldSquad.squad_id}_${Date.now()}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel('✅ Confirm')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(rejectId)
        .setLabel('❌ Reject')
        .setStyle(ButtonStyle.Danger)
    );

    // DM admin with preview + buttons (Requirement 6.4)
    let dmMessage = null;
    try {
      const adminUser = await client.users.fetch(interaction.user.id);
      dmMessage = await adminUser.send({ embeds: [previewEmbed], components: [row] });
    } catch {
      return interaction.editReply({ content: '❌ Could not DM you. Please enable DMs from server members.' });
    }

    await interaction.editReply({ content: '📩 Check your DMs to confirm or reject the edit.' });

    // Wait for button interaction (Requirement 6.5)
    const filter = (i) => (i.customId === confirmId || i.customId === rejectId) && i.user.id === interaction.user.id;

    try {
      const buttonInteraction = await dmMessage.awaitMessageComponent({ filter, time: 60_000 });

      if (buttonInteraction.customId === confirmId) {
        // Confirmed: update DB (Requirement 6.6)
        db.updateSquad(oldSquad.squad_id, {
          team_name: newTeamName,
          leader_id: leaderUser.id,
          player_ids: parsed.players,
          player_uids: parsed.uids || {},
        });

        const updatedSquad = db.getSquadById(oldSquad.squad_id);
        emitter.emit('squad:updated', updatedSquad);

        // Edit confirmed embed in confirmed squads channel (Requirement 6.7)
        if (guild && updatedSquad.confirmed_msg_id) {
          try {
            const confirmedChannel = await guild.channels.fetch(CONFIRMED_SQUADS_CHANNEL_ID);
            if (confirmedChannel) {
              const msg = await confirmedChannel.messages.fetch(updatedSquad.confirmed_msg_id);
              const editConfirmedEmbed = embedBuilder.buildEditConfirmedEmbed(updatedSquad);
              await msg.edit({ embeds: [editConfirmedEmbed] });
            }
          } catch {
            // Message may have been deleted
          }
        }

        // DM leader (Requirement 6.8)
        const leaderNotifyEmbed = embedBuilder.buildEditConfirmedEmbed(updatedSquad);
        await dmEngine.dmUser(leaderUser.id, leaderNotifyEmbed, client).catch(() => {});

        // Log action (Requirement 6.9)
        await logger.logAction(
          client,
          'REGISTRATION_EDITED',
          {
            actorId: interaction.user.id,
            targetId: oldSquad.squad_id,
            description: `Squad ${oldSquad.squad_id} edited by ${moderator}. New team name: ${newTeamName}`,
          },
          moderator
        ).catch(() => {});

        await buttonInteraction.update({
          content: `✅ Edit confirmed for squad \`${oldSquad.squad_id}\`.`,
          embeds: [],
          components: [],
        });
      } else {
        // Rejected (Requirement 6.10)
        await logger.logAction(
          client,
          'REGISTRATION_EDIT_REJECTED',
          {
            actorId: interaction.user.id,
            targetId: oldSquad.squad_id,
            description: `Edit for squad ${oldSquad.squad_id} rejected by ${moderator}`,
          },
          moderator
        ).catch(() => {});

        await buttonInteraction.update({
          content: `❌ Edit rejected. No changes were made to squad \`${oldSquad.squad_id}\`.`,
          embeds: [],
          components: [],
        });
      }
    } catch {
      // Timeout — disable buttons
      try {
        await dmMessage.edit({ components: [] });
      } catch {
        // DM may have been deleted
      }
    }
  },
};
