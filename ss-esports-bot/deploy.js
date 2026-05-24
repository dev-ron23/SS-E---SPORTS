'use strict';

/**
 * deploy.js — Register all slash commands with Discord
 *
 * Run this once whenever you add/change/remove a command:
 *   node deploy.js
 *
 * Registers commands to your specific guild (instant update).
 * Requires BOT_TOKEN and GUILD_ID in .env
 * CLIENT_ID is auto-detected from the bot token if not set.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { REST, Routes } = require('discord.js');
const fs = require('fs');

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID  = process.env.GUILD_ID;
// CLIENT_ID is the first part of the bot token (base64 of the app ID)
const CLIENT_ID = process.env.CLIENT_ID || Buffer.from(BOT_TOKEN.split('.')[0], 'base64').toString('utf8');

if (!BOT_TOKEN) { console.error('[deploy] BOT_TOKEN not set'); process.exit(1); }
if (!GUILD_ID)  { console.error('[deploy] GUILD_ID not set');  process.exit(1); }

// ── Load all command data ──────────────────────────────────────────────────
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath)
  .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'));

const commands = [];
for (const file of commandFiles) {
  try {
    const cmd = require(path.join(commandsPath, file));
    if (cmd?.data?.toJSON) {
      commands.push(cmd.data.toJSON());
      console.log(`[deploy] Loaded: ${cmd.data.name}`);
    }
  } catch (err) {
    console.warn(`[deploy] Skipped ${file}: ${err.message}`);
  }
}

console.log(`\n[deploy] Registering ${commands.length} command(s) to guild ${GUILD_ID}...`);

// ── Push to Discord ────────────────────────────────────────────────────────
const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

rest.put(
  Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
  { body: commands }
)
  .then((data) => {
    console.log(`[deploy] ✅ Successfully registered ${data.length} command(s):`);
    data.forEach((c) => console.log(`  /${c.name}`));
  })
  .catch((err) => {
    console.error('[deploy] ❌ Failed:', err.message);
    process.exit(1);
  });
