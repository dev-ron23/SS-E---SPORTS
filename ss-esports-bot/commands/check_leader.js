'use strict';

/**
 * /check_leader command
 * Queries DB for a squad led by the given user and replies with leader info embed (ephemeral).
 * Requirements: 8.4-8.6
 */

const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db');
const embedBuilder = require('../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('check_leader')
    .setDescription('Check leader squad details')
    .addUserOption((opt) =>
      opt.setName('leader').setDescription('The leader to look up').setRequired(true)
    ),

  async execute(interaction) {
    const leaderUser = interaction.options.getUser('leader');

    await interaction.deferReply({ ephemeral: true });

    // Query DB for squad led by this user (Requirement 8.4)
    const squad = db.getSquadByLeader(leaderUser.id);
    if (!squad) {
      return interaction.editReply({ content: `❌ <@${leaderUser.id}> is not leading any active squad.` });
    }

    // Get leader player record
    const leader = db.getPlayer(leaderUser.id, squad.squad_id);

    // Build leader-info embed (Requirement 8.5)
    const embed = embedBuilder.buildLeaderInfoEmbed(leader, squad);

    // Reply ephemeral (Requirement 8.6)
    await interaction.editReply({ embeds: [embed] });
  },
};
