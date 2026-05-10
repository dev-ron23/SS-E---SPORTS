'use strict';

/**
 * /check_player command
 * Queries DB for a player record and replies with player info embed (ephemeral).
 * Requirements: 8.1-8.3
 */

const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db');
const embedBuilder = require('../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('check_player')
    .setDescription('Check player registration details')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The player to look up').setRequired(true)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');

    await interaction.deferReply({ ephemeral: true });

    // Query DB for player's active squad membership (Requirement 8.1)
    const playerSquad = db.getActivePlayerSquad(targetUser.id);
    if (!playerSquad) {
      return interaction.editReply({ content: `❌ <@${targetUser.id}> is not registered in any active squad.` });
    }

    // Get full player record
    const player = db.getPlayer(targetUser.id, playerSquad.squad_id);
    if (!player) {
      return interaction.editReply({ content: `❌ Player record not found for <@${targetUser.id}>.` });
    }

    // Get squad record
    const squad = db.getSquadById(playerSquad.squad_id);

    // Build player-info embed (Requirement 8.2)
    const embed = embedBuilder.buildPlayerInfoEmbed(player, squad);

    // Reply ephemeral (Requirement 8.3)
    await interaction.editReply({ embeds: [embed] });
  },
};
