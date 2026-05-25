'use strict';

/**
 * /broadcast command
 * Sends a broadcast DM to all registered players.
 * Requirements: 14.1, 14.3, 14.5
 */

const { SlashCommandBuilder } = require('discord.js');
const embedBuilder = require('../utils/embedBuilder');
const dmEngine = require('../utils/dmEngine');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('DM all registered players')
    .addStringOption((opt) =>
      opt.setName('message').setDescription('The message to broadcast').setRequired(true)
    ),

  async execute(interaction) {
    const message = interaction.options.getString('message');
    const client = interaction.client;
    const moderator = interaction.user.tag;

    await interaction.deferReply({ flags: 64 });

    // Build broadcast embed (Requirement 14.1)
    const embed = embedBuilder.buildBroadcastEmbed(message, moderator);

    // DM all players (Requirement 14.3)
    const { sent, failed } = await dmEngine.dmAllPlayers(embed, client);

    // Log action (Requirement 14.5)
    await logger.logAction(
      client,
      'BROADCAST_SENT',
      {
        actorId: interaction.user.id,
        targetId: null,
        description: `Broadcast sent by ${moderator}. Delivered: ${sent}, Failed: ${failed}. Message: "${message}"`,
      },
      moderator
    ).catch(() => {});

    // Reply with confirmation count (Requirement 14.3)
    await interaction.editReply({
      content: `📢 Broadcast sent! ✅ Delivered: **${sent}** | ❌ Failed: **${failed}**`,
    });
  },
};
