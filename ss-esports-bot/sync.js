'use strict';

/**
 * $sync — Command sync utility
 * Registers all slash commands with the Discord REST API for the configured guild.
 * Requirements: 22.1-22.3
 */

const { REST, Routes } = require('discord.js');
const path = require('path');
const fs = require('fs');
const logger = require('./utils/logger');

require('dotenv').config({ path: path.join(__dirname, '.env') });

/**
 * Handle the $sync prefix command.
 * Can be called from index.js messageCreate handler or run standalone.
 *
 * @param {import('discord.js').Message|null} message - Discord message (null if run standalone)
 * @param {import('discord.js').Client|null} client - Discord client (null if run standalone)
 */
async function handleSync(message, client) {
  const token = process.env.BOT_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId || !guildId) {
    const errMsg = '❌ Missing BOT_TOKEN, CLIENT_ID, or GUILD_ID in .env';
    logger.terminalLog('ERROR', errMsg);
    if (message) await message.reply(errMsg).catch(() => {});
    return;
  }

  // Load all command definitions
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'));

  const commands = [];
  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command.data) {
      commands.push(command.data.toJSON());
    }
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    logger.terminalLog('INFO', `Registering ${commands.length} slash commands for guild ${guildId}...`);

    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });

    const successMsg = `✅ Successfully registered ${commands.length} slash commands.`;
    logger.terminalLog('INFO', successMsg);

    if (message) {
      await message.reply(successMsg).catch(() => {});
    }
  } catch (err) {
    const errMsg = `❌ Failed to register commands: ${err.message}`;
    logger.terminalLog('ERROR', errMsg, { error: err.message });

    if (message) {
      await message.reply(errMsg).catch(() => {});
    }
  }
}

module.exports = { handleSync };

// Allow running standalone: node sync.js
if (require.main === module) {
  handleSync(null, null).catch((err) => {
    logger.terminalLog('ERROR', 'Unexpected sync failure', { error: err.message });
    process.exitCode = 1;
  });
}
