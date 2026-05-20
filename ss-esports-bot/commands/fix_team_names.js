'use strict';

/**
 * /fix_team_names command
 * Scans all active squads, fetches their original registration messages from Discord,
 * re-parses the team name using the improved parser, and updates the DB if the name changed.
 *
 * Usage: /fix_team_names [dry_run:true]
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');
const { parseRegistration } = require('../utils/parser');
const logger = require('../utils/logger');
const emitter = require('../bridge/emitter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fix_team_names')
    .setDescription('Re-parse team names from original registration messages and fix incorrect ones')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption((opt) =>
      opt
        .setName('dry_run')
        .setDescription('Preview changes without saving (default: false)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const guild = interaction.guild;
    const client = interaction.client;
    const moderator = interaction.user.tag;
    const dryRun = interaction.options.getBoolean('dry_run') ?? false;

    await interaction.deferReply({ ephemeral: true });

    const allSquads = db.getAllActiveSquads();
    const squadsWithMsg = allSquads.filter(
      (s) => s.registration_msg_id && s.registration_channel_id
    );

    if (squadsWithMsg.length === 0) {
      return interaction.editReply({
        content: '⚠️ No squads have registration message IDs stored. Cannot re-parse.',
      });
    }

    const results = {
      fixed: [],
      unchanged: [],
      failed: [],
      noMessage: [],
    };

    // Process in batches to avoid rate limits
    for (const squad of squadsWithMsg) {
      try {
        // Fetch the original registration message
        const channel = await guild.channels.fetch(squad.registration_channel_id).catch(() => null);
        if (!channel) {
          results.noMessage.push(`${squad.squad_id}: channel not found`);
          continue;
        }

        const message = await channel.messages.fetch(squad.registration_msg_id).catch(() => null);
        if (!message) {
          results.noMessage.push(`${squad.squad_id}: message deleted`);
          continue;
        }

        // Re-parse the message with the improved parser
        const parsed = parseRegistration(message.content);
        if (!parsed.valid || !parsed.teamName) {
          results.failed.push(`${squad.squad_id}: could not parse team name from message`);
          continue;
        }

        const newName = parsed.teamName.trim();
        const oldName = squad.team_name;

        if (newName === oldName) {
          results.unchanged.push(`${squad.squad_id}: "${oldName}" (no change)`);
          continue;
        }

        // Update the DB
        if (!dryRun) {
          db.updateSquad(squad.squad_id, { team_name: newName });
          const updatedSquad = db.getSquadById(squad.squad_id);
          emitter.emit('squad:updated', updatedSquad);
        }

        results.fixed.push(`${squad.squad_id}: "${oldName}" → "${newName}"`);

        // Small delay to avoid Discord rate limits
        await new Promise((r) => setTimeout(r, 100));

      } catch (err) {
        results.failed.push(`${squad.squad_id}: ${err.message}`);
      }
    }

    // Log action
    if (!dryRun && results.fixed.length > 0) {
      await logger.logAction(client, 'TEAM_NAMES_FIXED', {
        actorId: interaction.user.id,
        targetId: null,
        description: `${moderator} fixed ${results.fixed.length} team names via /fix_team_names`,
      }, moderator).catch(() => {});
    }

    // Build response
    const lines = [
      dryRun ? '🔍 **DRY RUN — no changes saved**\n' : '',
      `✅ **Fixed: ${results.fixed.length}**`,
      ...results.fixed.slice(0, 30).map((l) => `  • ${l}`),
      results.fixed.length > 30 ? `  ...and ${results.fixed.length - 30} more` : '',
      '',
      `⏭️ **Unchanged: ${results.unchanged.length}**`,
      '',
      results.noMessage.length > 0 ? `⚠️ **Message not found: ${results.noMessage.length}**` : '',
      ...results.noMessage.slice(0, 10).map((l) => `  • ${l}`),
      '',
      results.failed.length > 0 ? `❌ **Failed: ${results.failed.length}**` : '',
      ...results.failed.slice(0, 10).map((l) => `  • ${l}`),
    ].filter((l) => l !== '');

    // Discord has a 2000 char limit on ephemeral replies
    let response = lines.join('\n');
    if (response.length > 1900) {
      response = response.substring(0, 1900) + '\n...(truncated)';
    }

    return interaction.editReply({ content: response || '✅ Done.' });
  },
};
