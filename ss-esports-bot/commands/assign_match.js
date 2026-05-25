'use strict';

/**
 * /assign_match command
 * Assigns a match room to a group.
 * Requirements: 10.1-10.5
 */

const { SlashCommandBuilder } = require('discord.js');
const matchManager = require('../handlers/matches');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('assign_match')
    .setDescription('Assign match room to a group')
    .addIntegerOption((opt) =>
      opt.setName('group_no').setDescription('Group number').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('room_id').setDescription('Match room ID').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('room_password').setDescription('Match room password').setRequired(true)
    ),

  async execute(interaction) {
    const groupNo = interaction.options.getInteger('group_no');
    const roomId = interaction.options.getString('room_id');
    const roomPassword = interaction.options.getString('room_password');
    const guild = interaction.guild;
    const client = interaction.client;

    await interaction.deferReply({ flags: 64 });

    // Call matchManager.assignMatch (Requirements 10.1-10.4)
    await matchManager.assignMatch(groupNo, roomId, roomPassword, guild, client);

    await interaction.editReply({
      content: `✅ Match room assigned to **Group ${groupNo}**.\nRoom ID: \`${roomId}\` | Password: \`${roomPassword}\``,
    });
  },
};
