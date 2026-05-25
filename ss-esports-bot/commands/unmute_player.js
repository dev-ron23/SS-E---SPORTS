'use strict';

/**
 * /unmute_player command
 * Unmutes a player via the moderation handler.
 * Requirements: 15.5-15.7
 */

const { SlashCommandBuilder } = require('discord.js');
const moderation = require('../handlers/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unmute_player')
    .setDescription('Unmute a player')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The player to unmute').setRequired(true)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const guild = interaction.guild;
    const client = interaction.client;
    const moderator = interaction.user.tag;

    await interaction.deferReply({ flags: 64 });

    // Call moderation.unmutePlayer (Requirements 15.5-15.7)
    await moderation.unmutePlayer(targetUser.id, guild, moderator, client);

    await interaction.editReply({
      content: `🔊 <@${targetUser.id}> has been unmuted.`,
    });
  },
};
