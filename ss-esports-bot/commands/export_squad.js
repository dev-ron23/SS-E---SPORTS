'use strict';

/**
 * /export_squad command
 * Exports all active squads as CSV and TXT files attached to the response.
 * Requirements: 9.1-9.4
 */

const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const db = require('../database/db');
const exporter = require('../utils/exporter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('export_squad')
    .setDescription('Export all squad data (CSV + TXT)'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // Query all active squads from DB (Requirement 9.1)
    const squads = db.getAllActiveSquads();

    if (squads.length === 0) {
      return interaction.editReply({ content: '⚠️ No active squads to export.' });
    }

    // Generate CSV (Requirement 9.2)
    const csvContent = exporter.exportToCSV(squads);
    const csvBuffer = Buffer.from(csvContent, 'utf8');
    const csvAttachment = new AttachmentBuilder(csvBuffer, { name: 'squads.csv' });

    // Generate TXT (Requirement 9.3)
    const txtContent = exporter.exportToTXT(squads);
    const txtBuffer = Buffer.from(txtContent, 'utf8');
    const txtAttachment = new AttachmentBuilder(txtBuffer, { name: 'squads.txt' });

    // Attach both files to response (Requirement 9.4)
    await interaction.editReply({
      content: `📊 Exported **${squads.length}** active squad(s).`,
      files: [csvAttachment, txtAttachment],
    });
  },
};
