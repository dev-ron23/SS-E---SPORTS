'use strict';

/**
 * /warn_player command
 * Issues a warning to a player via the moderation handler.
 * Requirements: 16.1-16.5
 */

const { SlashCommandBuilder } = require('discord.js');
const moderation = require('../handlers/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn_player')
    .setDescription('Warn a player')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The player to warn').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for the warning').setRequired(true)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const guild = interaction.guild;
    const client = interaction.client;
    const moderator = interaction.user.tag;

    await interaction.deferReply({ ephemeral: true });

    // Call moderation.warnPlayer (Requirements 16.1-16.5)
    const updatedPlayer = await moderation.warnPlayer(targetUser.id, reason, guild, moderator, client);

    if (!updatedPlayer) {
      return interaction.editReply({ content: `❌ <@${targetUser.id}> is not registered in any active squad.` });
    }

    await interaction.editReply({
      content: `⚠️ <@${targetUser.id}> has been warned. Warning count: **${updatedPlayer.warnings}/3**. Reason: ${reason}`,
    });
  },
};
