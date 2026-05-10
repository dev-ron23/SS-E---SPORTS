'use strict';

/**
 * /lock_reg command
 * Locks registrations and posts a closure embed to the registration channel.
 * Requirements: 13.1-13.4
 */

const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db');
const embedBuilder = require('../utils/embedBuilder');
const logger = require('../utils/logger');
const emitter = require('../bridge/emitter');

const REGISTRATION_CHANNEL_ID = '1502217324059431064';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock_reg')
    .setDescription('Lock registrations and post closure message'),

  async execute(interaction) {
    const client = interaction.client;
    const guild = interaction.guild;
    const moderator = interaction.user.tag;

    await interaction.deferReply({ ephemeral: true });

    // Set registration_locked=1 in DB settings (Requirement 13.1)
    db.setSetting('registration_locked', '1');
    emitter.emit('registration:status', { locked: true });

    // Post lock embed to registration channel (Requirement 13.2)
    const lockEmbed = embedBuilder.buildLockRegistrationEmbed();
    if (guild) {
      try {
        const regChannel = await guild.channels.fetch(REGISTRATION_CHANNEL_ID);
        if (regChannel) {
          await regChannel.send({ embeds: [lockEmbed] });
        }
      } catch {
        // Non-critical
      }
    }

    // Log action (Requirement 13.4)
    await logger.logAction(
      client,
      'REGISTRATION_LOCKED',
      {
        actorId: interaction.user.id,
        targetId: null,
        description: `Registration locked by ${moderator}`,
      },
      moderator
    ).catch(() => {});

    await interaction.editReply({ content: '🔒 Registrations have been locked.' });
  },
};
