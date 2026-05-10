'use strict';

/**
 * /start_match command
 * Starts a match for a group.
 * Requirements: 11.1-11.4
 */

const { SlashCommandBuilder } = require('discord.js');
const matchManager = require('../handlers/matches');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('start_match')
    .setDescription('Start match for a group')
    .addIntegerOption((opt) =>
      opt.setName('group_no').setDescription('Group number').setRequired(true)
    ),

  async execute(interaction) {
    const groupNo = interaction.options.getInteger('group_no');
    const guild = interaction.guild;
    const client = interaction.client;

    await interaction.deferReply({ ephemeral: true });

    // Call matchManager.startMatch (Requirements 11.1-11.3)
    await matchManager.startMatch(groupNo, guild, client);

    await interaction.editReply({
      content: `🚀 Match started for **Group ${groupNo}**! All players have been notified.`,
    });
  },
};
