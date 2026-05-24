'use strict';

/**
 * recover_groups.js
 * ─────────────────────────────────────────────────────────────────────────────
 * DISASTER RECOVERY SCRIPT
 *
 * Run this after a server nuke to:
 *  1. Back up the entire database to JSON (groups_backup_<timestamp>.json)
 *  2. Detect every unique group_no from the squads table
 *  3. Use the existing Groups category (ID: 1508092308527124490)
 *     or create a new one if it no longer exists
 *  4. For each group:
 *       a. Create the "Group N" role (if missing)
 *       b. Create the "group-N" text channel under the category (if missing)
 *       c. Re-assign the group role + Registered role to every player
 *       d. Post the squad listing embed in the channel
 *       e. Update groups_table in the DB with the new channel_id / role_id
 *
 * Usage:
 *   node scripts/recover_groups.js
 *
 * Requires .env with BOT_TOKEN and GUILD_ID set.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fs = require('fs');
const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
} = require('discord.js');
const db = require('../database/db');

// ─── Config ──────────────────────────────────────────────────────────────────

const GUILD_ID    = process.env.GUILD_ID;
const BOT_TOKEN   = process.env.BOT_TOKEN;

// Category that holds all group-N channels
const GROUP_CATEGORY_ID = '1508092308527124490';

// Role given to every registered player (re-assigned during recovery)
const REGISTERED_ROLE_ID = '1508090416694689852';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(level, msg) {
  console.log(`[${level}] ${msg}`);
}

/** Build the squad listing embed for a group channel. */
function buildGroupEmbed(groupNo, squads) {
  const lines = squads.map((s, i) => {
    const players = s.player_ids.map((pid) => `<@${pid}>`).join(', ');
    return `**${i + 1}. ${s.team_name}** (\`${s.squad_id}\`)\nPlayers: ${players}`;
  });

  return new EmbedBuilder()
    .setColor(0x7289da)
    .setTitle(`📋 Group ${groupNo} — Squad Listing`)
    .setDescription(lines.length > 0 ? lines.join('\n\n') : 'No squads assigned yet.')
    .setFooter({ text: `${squads.length}/12 squads` })
    .setTimestamp();
}

/** Save a full JSON backup of squads + groups before touching anything. */
function saveBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(__dirname, `groups_backup_${timestamp}.json`);

  const backup = {
    generated_at: new Date().toISOString(),
    squads: db.getAllSquads(),
    groups: db.getAllGroups(),
  };

  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');
  log('INFO', `✅ Backup saved → ${backupPath}`);
  return backupPath;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!BOT_TOKEN) { log('ERROR', 'BOT_TOKEN is not set in .env'); process.exit(1); }
  if (!GUILD_ID)  { log('ERROR', 'GUILD_ID is not set in .env');  process.exit(1); }

  // ── Init DB ─────────────────────────────────────────────────────────────────
  db.initDb();
  log('INFO', 'Database initialised.');

  // ── Step 1: Backup ──────────────────────────────────────────────────────────
  const backupPath = saveBackup();

  // ── Step 2: Build group → squads map from DB ────────────────────────────────
  const allSquads     = db.getAllActiveSquads();
  const groupedSquads = allSquads.filter((s) => s.group_no != null);

  if (groupedSquads.length === 0) {
    log('WARN', 'No squads with a group_no found in the database. Nothing to recover.');
    process.exit(0);
  }

  const groupMap = new Map();
  for (const squad of groupedSquads) {
    if (!groupMap.has(squad.group_no)) groupMap.set(squad.group_no, []);
    groupMap.get(squad.group_no).push(squad);
  }

  const groupNos = [...groupMap.keys()].sort((a, b) => a - b);
  log('INFO', `Found ${groupNos.length} group(s) to recover: ${groupNos.join(', ')}`);

  // ── Step 3: Connect to Discord ──────────────────────────────────────────────
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ],
  });

  await new Promise((resolve, reject) => {
    client.once('ready', resolve);
    client.once('error', reject);
    client.login(BOT_TOKEN).catch(reject);
  });

  log('INFO', `Logged in as ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  if (!guild) {
    log('ERROR', `Guild ${GUILD_ID} not found.`);
    client.destroy();
    process.exit(1);
  }

  // Populate caches
  await guild.channels.fetch();
  await guild.roles.fetch();
  await guild.members.fetch();
  log('INFO', `Guild: "${guild.name}" | ${guild.memberCount} members cached`);

  // ── Step 4: Resolve the Groups category ─────────────────────────────────────
  let category = guild.channels.cache.get(GROUP_CATEGORY_ID);

  if (!category) {
    log('INFO', `Category ${GROUP_CATEGORY_ID} not found — creating a new "GROUPS" category.`);
    category = await guild.channels.create({
      name: 'GROUPS',
      type: ChannelType.GuildCategory,
      reason: 'Auto-created by recover_groups.js (original category was deleted)',
    });
    log('INFO', `New category created: ${category.id}`);
  } else {
    log('INFO', `Using category: "${category.name}" (${category.id})`);
  }

  // ── Step 5: Recover each group ──────────────────────────────────────────────
  const results = [];

  for (const groupNo of groupNos) {
    const squads = groupMap.get(groupNo);
    log('INFO', `\n── Group ${groupNo} (${squads.length} squad(s)) ──────────────────`);

    // 5a ── Group role ─────────────────────────────────────────────────────────
    const roleName = `Group ${groupNo}`;
    let groupRole = guild.roles.cache.find((r) => r.name === roleName);

    if (!groupRole) {
      log('INFO', `  Creating role "${roleName}"...`);
      groupRole = await guild.roles.create({
        name: roleName,
        reason: `Recovered by recover_groups.js — group ${groupNo}`,
      });
      log('INFO', `  Role created: ${groupRole.id}`);
    } else {
      log('INFO', `  Role exists: "${groupRole.name}" (${groupRole.id})`);
    }

    // 5b ── Group channel ──────────────────────────────────────────────────────
    const channelName = `group-${groupNo}`;
    let channel = guild.channels.cache.find(
      (c) => c.name === channelName && c.parentId === category.id
    );

    if (!channel) {
      log('INFO', `  Creating channel "#${channelName}"...`);
      channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          { id: guild.id,       deny:  [PermissionFlagsBits.ViewChannel] }, // @everyone blocked
          { id: groupRole.id,   allow: [PermissionFlagsBits.ViewChannel] }, // group role allowed
        ],
        reason: `Recovered by recover_groups.js — group ${groupNo}`,
      });
      log('INFO', `  Channel created: ${channel.id}`);
    } else {
      log('INFO', `  Channel exists: #${channel.name} (${channel.id})`);
      // Ensure permissions are correct even on existing channels
      try {
        await channel.permissionOverwrites.edit(guild.id,     { ViewChannel: false });
        await channel.permissionOverwrites.edit(groupRole.id, { ViewChannel: true  });
        log('INFO', `  Permissions refreshed.`);
      } catch (err) {
        log('WARN', `  Could not refresh permissions: ${err.message}`);
      }
    }

    // 5c ── Assign roles to all players ───────────────────────────────────────
    let assigned = 0, skipped = 0;

    for (const squad of squads) {
      for (const playerId of squad.player_ids) {
        const member = guild.members.cache.get(playerId);
        if (!member) {
          log('WARN', `  ${playerId} not in server — skipped.`);
          skipped++;
          continue;
        }

        // Assign group-specific role
        if (!member.roles.cache.has(groupRole.id)) {
          try {
            await member.roles.add(groupRole.id, `Recovered group ${groupNo} role`);
          } catch (err) {
            log('WARN', `  Failed group role for ${playerId}: ${err.message}`);
          }
        }

        // Assign Registered role
        if (!member.roles.cache.has(REGISTERED_ROLE_ID)) {
          try {
            await member.roles.add(REGISTERED_ROLE_ID, 'Recovered Registered role');
          } catch (err) {
            log('WARN', `  Failed Registered role for ${playerId}: ${err.message}`);
          }
        }

        assigned++;
      }
    }

    log('INFO', `  Roles assigned: ${assigned} | Not in server: ${skipped}`);

    // 5d ── Post squad listing embed ───────────────────────────────────────────
    let listingMsgId = null;
    try {
      const sent = await channel.send({ embeds: [buildGroupEmbed(groupNo, squads)] });
      listingMsgId = sent.id;
      log('INFO', `  Squad listing posted (msg: ${sent.id})`);
    } catch (err) {
      log('ERROR', `  Failed to post squad listing: ${err.message}`);
    }

    // 5e ── Update DB ──────────────────────────────────────────────────────────
    db.upsertGroup({
      group_no:  groupNo,
      channel_id: channel.id,
      role_id:    groupRole.id,
      squad_ids:  squads.map((s) => s.squad_id),
    });

    if (listingMsgId) {
      for (const squad of squads) {
        db.updateSquadGroup(squad.squad_id, groupNo, listingMsgId);
      }
    }

    log('INFO', `  DB updated for group ${groupNo}.`);

    results.push({
      groupNo,
      channelId: channel.id,
      roleId: groupRole.id,
      squads: squads.length,
      assigned,
      skipped,
    });
  }

  // ── Step 6: Summary ─────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  ✅  RECOVERY COMPLETE');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Backup  : ${backupPath}`);
  console.log(`  Groups  : ${results.length} recovered`);
  for (const r of results) {
    console.log(
      `  Group ${String(r.groupNo).padStart(2)}: #group-${r.groupNo} (${r.channelId}) | ` +
      `role ${r.roleId} | squads=${r.squads} assigned=${r.assigned} skipped=${r.skipped}`
    );
  }
  console.log('══════════════════════════════════════════════════════\n');

  client.destroy();
  db.closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
