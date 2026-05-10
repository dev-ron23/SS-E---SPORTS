'use strict';

/**
 * Seed script — adds the SS E-Sports Bot and Rockstar to the credits table.
 * Run once: node ss-esports-bot/scripts/seed-credits.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../database/db');

db.initDb();

const entries = [
  {
    discord_id: '1440760650526756895',
    display_name: 'SS E-Sports Bot',
    role_label: 'Tournament Bot',
    category: 'developer',
    description: 'The official SS E-Sports tournament management bot. Handles squad registration, match management, scoring, leaderboard, moderation, and real-time dashboard sync.',
    discord_url: 'https://discord.com/users/1440760650526756895',
    github_url: null,
    youtube_url: null,
    instagram_url: null,
    dm_url: null,
    display_order: 99,
  },
  {
    discord_id: '1332626290360193135',
    display_name: '꧁• シ Ꮢ𝐨𝐜𝐤𝐬𝐭𝐚𝐫 ×͜×',
    role_label: 'Founder & Developer',
    category: 'owner',
    description: 'Creator and developer of the SS E-Sports tournament system. Built the Discord bot, bridge server, and live dashboard from scratch.',
    discord_url: 'https://discord.com/users/1332626290360193135',
    github_url: null,
    youtube_url: null,
    instagram_url: null,
    dm_url: 'https://discord.com/users/1332626290360193135',
    display_order: 0,
  },
];

for (const entry of entries) {
  db.upsertCredit({ ...entry, created_at: new Date().toISOString() });
  console.log(`✅ Seeded: ${entry.display_name} (${entry.discord_id})`);
}

db.closeDb();
console.log('Done.');
