'use strict';

/**
 * /dm command
 * Sends a DM to a specific player from HQ.
 * Requirements: 14.2, 14.4, 14.5
 */

const { SlashCommandBuilder } = require('discord.js');
const embedBuilder = require('../utils/embedBuilder');
const dmEngine = require('../utils/dmEngine');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dm')
    .setDescription('DM a specific player from HQ')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The user to DM').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('description').setDescription('The message to send').setRequired(true)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const description = interaction.options.getString('description');
    const client = interaction.client;
    const moderator = interaction.user.tag;

    await interaction.deferReply({ ephemeral: true });

    // Build DM embed (Requirement 14.2)
    const embed = embedBuilder.buildDMEmbed(description, moderator);

    // Send DM (Requirement 14.4)
    const success = await dmEngine.dmUser(targetUser.id, embed, client);

    // Log action (Requirement 14.5)
    await logger.logAction(
      client,
      'DM_SENT',
      {
        actorId: interaction.user.id,
        targetId: targetUser.id,
        description: `DM sent to <@${targetUser.id}> by ${moderator}. Message: "${description}"`,
      },
      moderator
    ).catch(() => {});

    // Reply with confirmation
    if (success) {
      await interaction.editReply({ content: `✅ DM successfully sent to <@${targetUser.id}>.` });
    } else {
      await interaction.editReply({ content: `❌ Failed to DM <@${targetUser.id}>. They may have DMs disabled.` });
    }
  },
};
