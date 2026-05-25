'use strict';

/**
 * /mute_player command
 * Mutes a player via the moderation handler.
 * Requirements: 15.1-15.4
 */

const { SlashCommandBuilder } = require('discord.js');
const moderation = require('../handlers/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute_player')
    .setDescription('Mute a player')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The player to mute').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for mute').setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') ?? undefined;
    const guild = interaction.guild;
    const client = interaction.client;
    const moderator = interaction.user.tag;

    await interaction.deferReply({ flags: 64 });

    // Call moderation.mutePlayer (Requirements 15.1-15.4)
    await moderation.mutePlayer(targetUser.id, guild, moderator, client, reason);

    await interaction.editReply({
      content: `🔇 <@${targetUser.id}> has been muted.${reason ? ` Reason: ${reason}` : ''}`,
    });
  },
};
