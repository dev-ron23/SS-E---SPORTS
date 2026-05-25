'use strict';

/**
 * /clear_reg_chat command
 * Clears all messages in the registration channel.
 * Requirements: 18.1-18.3
 */

const { SlashCommandBuilder } = require('discord.js');
const moderation = require('../handlers/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear_reg_chat')
    .setDescription('Clear the registration channel'),

  async execute(interaction) {
    const guild = interaction.guild;
    const client = interaction.client;
    const moderator = interaction.user.tag;

    await interaction.deferReply({ flags: 64 });

    // Call moderation.clearRegChat (Requirements 18.1-18.3)
    const deletedCount = await moderation.clearRegChat(guild, moderator, client);

    await interaction.editReply({
      content: `🧹 Registration channel cleared. **${deletedCount}** message(s) deleted.`,
    });
  },
};
