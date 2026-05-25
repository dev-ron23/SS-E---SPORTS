'use strict';

/**
 * /fix_team_names command
 * Scans all active squads, fetches their original registration messages from Discord,
 * re-parses the team name using the improved parser, and updates:
 *  - The database (team_name field)
 *  - The confirmed-squads channel embed
 *  - The group channel listing
 *  - The real-time dashboard (socket event)
 *  - The audit log
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');
const { parseRegistration } = require('../utils/parser');
const embedBuilder = require('../utils/embedBuilder');
const logger = require('../utils/logger');
const emitter = require('../bridge/emitter');
const groups = require('../handlers/groups');

const CONFIRMED_SQUADS_CHANNEL_ID = '1502217351897288847';

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

    await interaction.deferReply({ flags: 64 });

    const allSquads = db.getAllActiveSquads();
    const squadsWithMsg = allSquads.filter(
      (s) => s.registration_msg_id && s.registration_channel_id
    );

    if (squadsWithMsg.length === 0) {
      return interaction.editReply({
        content: '⚠️ No squads have registration message IDs stored. Cannot re-parse.',
      });
    }

    const results = { fixed: [], unchanged: [], failed: [], noMessage: [] };
    const groupsToUpdate = new Set();

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

        // Re-parse with improved parser
        const parsed = parseRegistration(message.content);
        if (!parsed.valid || !parsed.teamName) {
          results.failed.push(`${squad.squad_id}: could not parse — "${squad.team_name}"`);
          continue;
        }

        const newName = parsed.teamName.trim();
        const oldName = squad.team_name;

        if (newName === oldName) {
          results.unchanged.push(`${squad.squad_id}: "${oldName}"`);
          continue;
        }

        if (!dryRun) {
          // 1. Update DB
          db.updateSquad(squad.squad_id, { team_name: newName });
          const updatedSquad = db.getSquadById(squad.squad_id);

          // 2. Update confirmed-squads embed
          if (updatedSquad.confirmed_msg_id) {
            try {
              const confirmedCh = await guild.channels.fetch(CONFIRMED_SQUADS_CHANNEL_ID).catch(() => null);
              if (confirmedCh) {
                const msg = await confirmedCh.messages.fetch(updatedSquad.confirmed_msg_id).catch(() => null);
                if (msg) {
                  const jumpUrl = `https://discord.com/channels/${guild.id}/${updatedSquad.registration_channel_id}/${updatedSquad.registration_msg_id}`;
                  await msg.edit({ embeds: [embedBuilder.buildRegistrationConfirmedEmbed(updatedSquad, jumpUrl)] }).catch(() => {});
                }
              }
            } catch { /* non-critical */ }
          }

          // 3. Mark group for listing update
          if (updatedSquad.group_no !== null) {
            groupsToUpdate.add(updatedSquad.group_no);
          }

          // 4. Emit real-time update
          emitter.emit('squad:updated', updatedSquad);
        }

        results.fixed.push(`${squad.squad_id}: "${oldName}" → "${newName}"`);

        // Rate limit protection
        await new Promise((r) => setTimeout(r, 150));

      } catch (err) {
        results.failed.push(`${squad.squad_id}: ${err.message}`);
      }
    }

    // 5. Update group channel listings for all affected groups
    if (!dryRun && groupsToUpdate.size > 0) {
      for (const groupNo of groupsToUpdate) {
        try {
          await groups.updateGroupListing(groupNo, guild);
          await new Promise((r) => setTimeout(r, 200));
        } catch { /* non-critical */ }
      }
    }

    // 6. Log action
    if (!dryRun && results.fixed.length > 0) {
      await logger.logAction(client, 'TEAM_NAMES_FIXED', {
        actorId: interaction.user.id,
        targetId: null,
        description: `${moderator} fixed ${results.fixed.length} team names. Groups updated: ${[...groupsToUpdate].join(', ')}`,
      }, moderator).catch(() => {});
    }

    // Build response
    const lines = [
      dryRun ? '🔍 **DRY RUN — no changes saved**\n' : `✅ Updated ${groupsToUpdate.size} group listing(s)\n`,
      `✅ **Fixed: ${results.fixed.length}**`,
      ...results.fixed.slice(0, 25).map((l) => `  • ${l}`),
      results.fixed.length > 25 ? `  ...and ${results.fixed.length - 25} more` : '',
      '',
      `⏭️ **Unchanged: ${results.unchanged.length}**`,
      results.noMessage.length > 0 ? `\n⚠️ **Message not found: ${results.noMessage.length}**` : '',
      ...results.noMessage.slice(0, 5).map((l) => `  • ${l}`),
      results.failed.length > 0 ? `\n❌ **Failed: ${results.failed.length}**` : '',
      ...results.failed.slice(0, 5).map((l) => `  • ${l}`),
    ].filter((l) => l !== '');

    let response = lines.join('\n');
    if (response.length > 1900) response = response.substring(0, 1900) + '\n...(truncated)';

    return interaction.editReply({ content: response || '✅ Done.' });
  },
};
