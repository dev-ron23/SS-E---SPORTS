'use strict';

/**
 * /whitelist command
 * Adds a user or channel to the AutoMod whitelist so they are exempt from AutoMod checks.
 * Requirements: AutoMod whitelist management
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Manage AutoMod whitelist — exempt users or channels from AutoMod')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('add_user')
        .setDescription('Add a user to the AutoMod whitelist')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('The user to whitelist').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove_user')
        .setDescription('Remove a user from the AutoMod whitelist')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('The user to remove').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('add_channel')
        .setDescription('Add a channel to the AutoMod whitelist (AutoMod ignores this channel)')
        .addChannelOption((opt) =>
          opt.setName('channel').setDescription('The channel to whitelist').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove_channel')
        .setDescription('Remove a channel from the AutoMod whitelist')
        .addChannelOption((opt) =>
          opt.setName('channel').setDescription('The channel to remove').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Show all whitelisted users and channels')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const moderator = interaction.user.tag;
    const client = interaction.client;

    await interaction.deferReply({ ephemeral: true });

    // Load current whitelist from settings
    const rawUsers = db.getSetting('automod_whitelist_users') ?? '[]';
    const rawChannels = db.getSetting('automod_whitelist_channels') ?? '[]';
    let whitelistUsers = JSON.parse(rawUsers);
    let whitelistChannels = JSON.parse(rawChannels);

    if (sub === 'add_user') {
      const user = interaction.options.getUser('user');
      if (whitelistUsers.includes(user.id)) {
        return interaction.editReply({ content: `⚠️ <@${user.id}> is already whitelisted.` });
      }
      whitelistUsers.push(user.id);
      db.setSetting('automod_whitelist_users', JSON.stringify(whitelistUsers));

      await logger.logAction(client, 'AUTOMOD_WHITELIST_ADD_USER', {
        actorId: interaction.user.id,
        targetId: user.id,
        description: `${moderator} added ${user.tag} to AutoMod whitelist`,
      }, moderator).catch(() => {});

      return interaction.editReply({
        content: `✅ <@${user.id}> (**${user.tag}**) has been added to the AutoMod whitelist.\nThey will no longer be affected by spam, mention, caps, or repeated-registration checks.`,
      });
    }

    if (sub === 'remove_user') {
      const user = interaction.options.getUser('user');
      if (!whitelistUsers.includes(user.id)) {
        return interaction.editReply({ content: `⚠️ <@${user.id}> is not in the whitelist.` });
      }
      whitelistUsers = whitelistUsers.filter((id) => id !== user.id);
      db.setSetting('automod_whitelist_users', JSON.stringify(whitelistUsers));

      await logger.logAction(client, 'AUTOMOD_WHITELIST_REMOVE_USER', {
        actorId: interaction.user.id,
        targetId: user.id,
        description: `${moderator} removed ${user.tag} from AutoMod whitelist`,
      }, moderator).catch(() => {});

      return interaction.editReply({
        content: `✅ <@${user.id}> (**${user.tag}**) has been removed from the AutoMod whitelist.`,
      });
    }

    if (sub === 'add_channel') {
      const channel = interaction.options.getChannel('channel');
      if (whitelistChannels.includes(channel.id)) {
        return interaction.editReply({ content: `⚠️ <#${channel.id}> is already whitelisted.` });
      }
      whitelistChannels.push(channel.id);
      db.setSetting('automod_whitelist_channels', JSON.stringify(whitelistChannels));

      await logger.logAction(client, 'AUTOMOD_WHITELIST_ADD_CHANNEL', {
        actorId: interaction.user.id,
        targetId: channel.id,
        description: `${moderator} added #${channel.name} to AutoMod whitelist`,
      }, moderator).catch(() => {});

      return interaction.editReply({
        content: `✅ <#${channel.id}> (**#${channel.name}**) has been added to the AutoMod whitelist.\nAutoMod will ignore all messages in this channel.`,
      });
    }

    if (sub === 'remove_channel') {
      const channel = interaction.options.getChannel('channel');
      if (!whitelistChannels.includes(channel.id)) {
        return interaction.editReply({ content: `⚠️ <#${channel.id}> is not in the whitelist.` });
      }
      whitelistChannels = whitelistChannels.filter((id) => id !== channel.id);
      db.setSetting('automod_whitelist_channels', JSON.stringify(whitelistChannels));

      await logger.logAction(client, 'AUTOMOD_WHITELIST_REMOVE_CHANNEL', {
        actorId: interaction.user.id,
        targetId: channel.id,
        description: `${moderator} removed #${channel.name} from AutoMod whitelist`,
      }, moderator).catch(() => {});

      return interaction.editReply({
        content: `✅ <#${channel.id}> (**#${channel.name}**) has been removed from the AutoMod whitelist.`,
      });
    }

    if (sub === 'list') {
      const userMentions = whitelistUsers.length > 0
        ? whitelistUsers.map((id) => `<@${id}>`).join(', ')
        : 'None';
      const channelMentions = whitelistChannels.length > 0
        ? whitelistChannels.map((id) => `<#${id}>`).join(', ')
        : 'None';

      return interaction.editReply({
        content: `**AutoMod Whitelist**\n\n👤 **Whitelisted Users** (${whitelistUsers.length}):\n${userMentions}\n\n📢 **Whitelisted Channels** (${whitelistChannels.length}):\n${channelMentions}`,
      });
    }
  },
};
