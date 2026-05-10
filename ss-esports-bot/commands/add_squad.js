'use strict';

/**
 * /add_squad command
 * Manually adds a squad, following the same confirmation flow as automatic registration.
 * Requirements: 7.1-7.5
 */

const { SlashCommandBuilder } = require('discord.js');
const parser = require('../utils/parser');
const registration = require('../handlers/registration');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add_squad')
    .setDescription('Manually add a squad')
    .addStringOption((opt) =>
      opt.setName('team_name').setDescription('Team name').setRequired(true)
    )
    .addUserOption((opt) =>
      opt.setName('leader').setDescription('Squad leader').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('format').setDescription('Registration format (mentions + UIDs)').setRequired(true)
    ),

  async execute(interaction) {
    const teamName = interaction.options.getString('team_name');
    const leaderUser = interaction.options.getUser('leader');
    const format = interaction.options.getString('format');
    const guild = interaction.guild;

    await interaction.deferReply({ ephemeral: true });

    // Parse the format string (Requirement 7.2)
    const parsed = parser.parseRegistration(format);
    if (!parsed.valid) {
      return interaction.editReply({ content: `❌ Invalid format: ${parsed.reason}` });
    }

    // Override team name and leader from explicit options (Requirement 7.1)
    parsed.teamName = teamName;
    // Ensure leader is first in players list
    if (!parsed.players.includes(leaderUser.id)) {
      parsed.players.unshift(leaderUser.id);
    } else {
      // Move leader to front
      parsed.players = [leaderUser.id, ...parsed.players.filter((id) => id !== leaderUser.id)];
    }

    // Build a synthetic message object for confirmRegistration (Requirement 7.3)
    const syntheticMessage = {
      id: `admin_add_${Date.now()}`,
      channelId: registration.REGISTRATION_CHANNEL_ID,
      content: format,
      author: { bot: false, id: interaction.user.id },
      url: null,
      guild,
      channel: { send: async () => ({ id: '0' }) },
      react: async () => {},
    };

    // Follow same confirmation flow as automatic registration (Requirement 7.4)
    await registration.confirmRegistration(syntheticMessage, parsed, guild);

    await interaction.editReply({
      content: `✅ Squad **${teamName}** has been manually added and confirmed.`,
    });
  },
};
