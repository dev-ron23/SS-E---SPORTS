'use strict';

/**
 * /remove_from_group command
 * Removes a player from a group via the moderation handler.
 * Requirements: 17.1-17.4
 */

const { SlashCommandBuilder } = require('discord.js');
const moderation = require('../handlers/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove_from_group')
    .setDescription('Remove a player from a group')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The player to remove').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('group_no').setDescription('Group number to remove from').setRequired(true)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const groupNo = interaction.options.getInteger('group_no');
    const guild = interaction.guild;
    const client = interaction.client;
    const moderator = interaction.user.tag;

    await interaction.deferReply({ flags: 64 });

    // Call moderation.removeFromGroup (Requirements 17.1-17.4)
    await moderation.removeFromGroup(targetUser.id, groupNo, guild, moderator, client);

    await interaction.editReply({
      content: `✅ <@${targetUser.id}> has been removed from **Group ${groupNo}**.`,
    });
  },
};
