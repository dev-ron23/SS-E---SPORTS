'use strict';

/**
 * /group_winner command
 * Declares winners from a group and moves them to a specified channel.
 * Usage: /group_winner squad_ids:SSE-0001,SSE-0002 channel:#next-round
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const logger = require('../utils/logger');
const emitter = require('../bridge/emitter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('group_winner')
    .setDescription('Declare group winners and move them to the next round channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName('squad_ids')
        .setDescription('Comma-separated squad IDs (e.g. SSE-0001,SSE-0002)')
        .setRequired(true)
    )
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription('The channel to send the winners to (next round channel)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const guild = interaction.guild;
    const client = interaction.client;
    const moderator = interaction.user.tag;

    await interaction.deferReply({ ephemeral: true });

    // Parse squad IDs
    const rawIds = interaction.options.getString('squad_ids');
    const squadIds = rawIds
      .split(/[,\s]+/)
      .map((id) => id.trim().toUpperCase())
      .filter((id) => id.length > 0);

    if (squadIds.length === 0) {
      return interaction.editReply({ content: '❌ No valid squad IDs provided.' });
    }

    const targetChannel = interaction.options.getChannel('channel');
    if (!targetChannel || !targetChannel.isTextBased()) {
      return interaction.editReply({ content: '❌ Invalid channel selected.' });
    }

    // Validate all squad IDs exist
    const squads = [];
    const errors = [];

    for (const squadId of squadIds) {
      const squad = db.getSquadById(squadId);
      if (!squad) {
        errors.push(`❌ Squad \`${squadId}\` not found.`);
        continue;
      }
      if (squad.status !== 'active') {
        errors.push(`⚠️ Squad \`${squadId}\` is not active (status: ${squad.status}).`);
        continue;
      }
      squads.push(squad);
    }

    if (errors.length > 0 && squads.length === 0) {
      return interaction.editReply({ content: errors.join('\n') });
    }

    // Build winner announcement embed
    const winnerLines = squads.map((s, i) => {
      const players = s.player_ids.map((pid) => `<@${pid}>`).join(', ');
      return `**${i + 1}. ${s.team_name}** (\`${s.squad_id}\`)\nPlayers: ${players}`;
    });

    const winnerEmbed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🏆 Group Winners — Advancing to Next Round!')
      .setDescription(winnerLines.join('\n\n'))
      .addFields({
        name: 'Next Round Channel',
        value: `<#${targetChannel.id}>`,
        inline: true,
      })
      .setFooter({ text: `Declared by ${moderator}` })
      .setTimestamp();

    // Post in the target (next round) channel
    try {
      await targetChannel.send({ embeds: [winnerEmbed] });
    } catch (err) {
      return interaction.editReply({ content: `❌ Failed to post in <#${targetChannel.id}>: ${err.message}` });
    }

    // Also post in each winner's current group channel
    const groupsNotified = new Set();
    for (const squad of squads) {
      if (squad.group_no !== null && !groupsNotified.has(squad.group_no)) {
        const group = db.getGroup(squad.group_no);
        if (group?.channel_id) {
          try {
            const groupChannel = await guild.channels.fetch(group.channel_id);
            if (groupChannel) {
              const groupEmbed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('🏆 Winners Advancing!')
                .setDescription(
                  squads
                    .filter((s) => s.group_no === squad.group_no)
                    .map((s) => `**${s.team_name}** (\`${s.squad_id}\`) → <#${targetChannel.id}>`)
                    .join('\n')
                )
                .setTimestamp();
              await groupChannel.send({ embeds: [groupEmbed] });
            }
          } catch { /* non-critical */ }
        }
        groupsNotified.add(squad.group_no);
      }

      // Emit socket event
      emitter.emit('match:winner', {
        squad_id: squad.squad_id,
        team_name: squad.team_name,
        position: squads.indexOf(squad) + 1,
      });
    }

    // Log action
    await logger.logAction(client, 'GROUP_WINNERS_DECLARED', {
      actorId: interaction.user.id,
      targetId: squadIds.join(', '),
      description: `${moderator} declared winners: ${squads.map((s) => s.team_name).join(', ')} → #${targetChannel.name}`,
    }, moderator).catch(() => {});

    const resultLines = [
      `✅ **${squads.length}** winner(s) announced in <#${targetChannel.id}>`,
      ...squads.map((s) => `• ${s.team_name} (\`${s.squad_id}\`)`),
    ];
    if (errors.length > 0) {
      resultLines.push('', '**Warnings:**', ...errors);
    }

    return interaction.editReply({ content: resultLines.join('\n') });
  },
};
