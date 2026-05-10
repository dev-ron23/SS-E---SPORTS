'use strict';

/**
 * /update_score command
 * Updates kills and placement points for a squad.
 * Requirements: 15.1-15.6, 3.9
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const emitter = require('../bridge/emitter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('update_score')
    .setDescription('Update kills and placement points for a squad')
    .addStringOption((opt) =>
      opt.setName('squad_id').setDescription('The squad ID').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('kills').setDescription('Kill points').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('placement').setDescription('Placement points').setRequired(true)
    ),

  async execute(interaction) {
    const squad_id = interaction.options.getString('squad_id');
    const kills = interaction.options.getInteger('kills');
    const placement = interaction.options.getInteger('placement');

    // Requirement 15.5: Validate kills >= 0 and placement >= 0
    if (kills < 0 || placement < 0) {
      return interaction.reply({
        content: '❌ `kills` and `placement` must both be **0 or greater**.',
        ephemeral: true,
      });
    }

    // Requirement 15.6: Validate squad exists in DB
    const squad = db.getSquadById(squad_id);
    if (!squad) {
      return interaction.reply({
        content: `❌ Squad \`${squad_id}\` was not found in the database.`,
        ephemeral: true,
      });
    }

    // Requirement 15.2: Insert score record
    const scoreRecord = db.insertScore({
      squad_id,
      kills,
      placement_points: placement,
      recorded_at: new Date().toISOString(),
      match_id: null,
    });

    // Requirement 15.4 / 2.11: Emit score:updated event
    emitter.emit('score:updated', scoreRecord);

    // Requirement 15.3: Reply with ephemeral embed confirming the score
    const embed = new EmbedBuilder()
      .setTitle('✅ Score Updated')
      .setColor(0x00d4ff)
      .addFields(
        { name: 'Squad', value: `\`${squad_id}\` — ${squad.team_name}`, inline: false },
        { name: 'Kills', value: String(kills), inline: true },
        { name: 'Placement Points', value: String(placement), inline: true },
        { name: 'Total Points', value: String(scoreRecord.total_points), inline: true }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
