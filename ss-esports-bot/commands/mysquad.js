'use strict';

/**
 * /mysquad command
 * Shows the invoking player's own squad details — ephemeral, self-service.
 * Displays squad ID, team name, all members, group, match status, and personal stats.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database/db');

const COLORS = {
  ACTIVE:    0x00ff7f, // green  — registered & active
  IN_MATCH:  0x9b59b6, // purple — match assigned/live
  WINNER:    0xffd700, // gold   — squad won
  CANCELLED: 0xff4444, // red    — cancelled
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mysquad')
    .setDescription('View your own squad details, group assignment, and match status'),

  async execute(interaction) {
    const userId = interaction.user.id;

    await interaction.deferReply({ ephemeral: true });

    // ── 1. Find the player's active squad ──────────────────────────────────
    const playerRow = db.getActivePlayerSquad(userId);
    if (!playerRow) {
      return interaction.editReply({
        content: [
          '❌ **You are not registered in any active squad.**',
          '',
          'Register by posting your team details in the registration channel.',
        ].join('\n'),
      });
    }

    const squad   = db.getSquadById(playerRow.squad_id);
    const player  = db.getPlayer(userId, playerRow.squad_id);
    const group   = squad.group_no != null ? db.getGroup(squad.group_no) : null;

    // ── 2. Determine status & color ────────────────────────────────────────
    let statusLine;
    let embedColor = COLORS.ACTIVE;

    if (squad.winner_position != null) {
      const medal = squad.winner_position === 1 ? '🥇' : squad.winner_position === 2 ? '🥈' : squad.winner_position === 3 ? '🥉' : `#${squad.winner_position}`;
      statusLine = `${medal} **Winner — Position ${squad.winner_position}**`;
      embedColor = COLORS.WINNER;
    } else if (group && group.match_started_at) {
      statusLine = '🔴 **Match is LIVE**';
      embedColor = COLORS.IN_MATCH;
    } else if (group && group.match_room_id) {
      statusLine = '🟡 **Match room assigned — check your DMs**';
      embedColor = COLORS.IN_MATCH;
    } else if (squad.group_no != null) {
      statusLine = `🟢 **Registered — Group ${squad.group_no}**`;
    } else {
      statusLine = '🟢 **Registered — Group pending**';
    }

    // ── 3. Build player list ───────────────────────────────────────────────
    const allPlayers = db.getSquadPlayers(squad.squad_id);

    const playerLines = squad.player_ids.map((pid) => {
      const p       = allPlayers.find((r) => r.discord_id === pid);
      const uid     = squad.player_uids?.[pid] ? `\`${squad.player_uids[pid]}\`` : '`—`';
      const isLeader = pid === squad.leader_id;
      const role    = isLeader ? '👑' : '🎮';
      const muted   = p?.is_muted ? ' 🔇' : '';
      const warns   = p?.warnings > 0 ? ` ⚠️×${p.warnings}` : '';
      return `${role} <@${pid}> — UID: ${uid}${muted}${warns}`;
    });

    // ── 4. Group & match info ──────────────────────────────────────────────
    const groupValue = squad.group_no != null
      ? `Group ${squad.group_no}`
      : 'Not yet assigned';

    let matchValue = 'No match assigned yet';
    if (group?.match_room_id) {
      matchValue = group.match_started_at
        ? `🔴 LIVE — Room \`${group.match_room_id}\``
        : `🟡 Room assigned — check your DMs for credentials`;
    }

    // ── 5. Personal stats for the invoking player ─────────────────────────
    const myRole     = player?.role === 'leader' ? '👑 Leader' : '🎮 Player';
    const myUid      = squad.player_uids?.[userId] ? `\`${squad.player_uids[userId]}\`` : '`Not provided`';
    const myWarnings = player?.warnings ?? 0;
    const myMuted    = player?.is_muted ? '🔇 Yes' : '✅ No';

    // ── 6. Registered timestamp ────────────────────────────────────────────
    const registeredAt = squad.registered_at
      ? `<t:${Math.floor(new Date(squad.registered_at).getTime() / 1000)}:R>`
      : 'Unknown';

    // ── 7. Build embed ─────────────────────────────────────────────────────
    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(`🏆 ${squad.team_name}`)
      .setDescription(statusLine)
      .addFields(
        {
          name: '📋 Squad Info',
          value: [
            `**ID:** \`${squad.squad_id}\``,
            `**Registered:** ${registeredAt}`,
            `**Slot #:** ${squad.squad_no}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '📍 Group & Match',
          value: [
            `**Group:** ${groupValue}`,
            `**Match:** ${matchValue}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '\u200B',
          value: '\u200B',
          inline: true,
        },
        {
          name: `👥 Roster (${squad.player_ids.length} players)`,
          value: playerLines.join('\n') || 'No players found',
        },
        {
          name: '👤 Your Stats',
          value: [
            `**Role:** ${myRole}`,
            `**Game UID:** ${myUid}`,
            `**Warnings:** ${myWarnings}/3`,
            `**Muted:** ${myMuted}`,
          ].join('\n'),
          inline: true,
        },
      )
      .setFooter({ text: `SS E-SPORTS Tournament • Only visible to you` })
      .setTimestamp();

    // Add winner banner if applicable
    if (squad.winner_position != null) {
      embed.addFields({
        name: '🏅 Tournament Result',
        value: `This squad finished in **position #${squad.winner_position}**`,
        inline: true,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
