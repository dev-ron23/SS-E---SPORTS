'use strict';

/**
 * /winner command
 * Declares the winner for a group match.
 * Requirements: 12.1-12.6
 */

const { SlashCommandBuilder } = require('discord.js');
const matchManager = require('../handlers/matches');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('winner')
    .setDescription('Declare winner for a group')
    .addStringOption((opt) =>
      opt.setName('format').setDescription('Format: "SQUAD_ID POSITION" (e.g. "SSE-0001 1")').setRequired(true)
    )
    .addChannelOption((opt) =>
      opt.setName('channel').setDescription('The group channel').setRequired(true)
    ),

  async execute(interaction) {
    const format = interaction.options.getString('format');
    const guild = interaction.guild;
    const client = interaction.client;

    await interaction.deferReply({ ephemeral: true });

    // Parse format to extract squad ID and position (Requirement 12.1)
    const parts = format.trim().split(/\s+/);
    if (parts.length < 2) {
      return interaction.editReply({ content: '❌ Invalid format. Use: `SQUAD_ID POSITION` (e.g. `SSE-0001 1`)' });
    }

    const squadId = parts[0].toUpperCase();
    const position = parseInt(parts[1], 10);

    if (isNaN(position) || position < 1) {
      return interaction.editReply({ content: '❌ Position must be a positive integer.' });
    }

    // Call matchManager.declareWinner (Requirements 12.2-12.6)
    await matchManager.declareWinner(squadId, position, guild, client);

    await interaction.editReply({
      content: `🏆 Winner declared: Squad \`${squadId}\` at position **#${position}**.`,
    });
  },
};
