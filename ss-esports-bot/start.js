'use strict';

/**
 * Startup script for Endercloud Pterodactyl panel.
 * Downloads the correct cloudflared binary for the current architecture,
 * starts the tunnel, then starts the bot.
 */

const { spawn } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '5542', 10);
const CLOUDFLARED_PATH = path.join(os.tmpdir(), 'cloudflared');

// Pick the right binary for the current CPU architecture
function getCloudflaredUrl() {
  const arch = os.arch();
  if (arch === 'arm64' || arch === 'aarch64') {
    return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64';
  }
  if (arch === 'arm') {
    return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm';
  }
  // Default: amd64
  return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';
}

// ── Download with redirect following ──────────────────────────────────────
function downloadFile(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 10) return reject(new Error('Too many redirects'));

    https.get(url, { headers: { 'User-Agent': 'node.js' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        return downloadFile(res.headers.location, dest, redirects + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }

      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => { file.close(); fs.chmodSync(dest, '755'); resolve(); });
      file.on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
    }).on('error', reject);
  });
}

// ── Download cloudflared ───────────────────────────────────────────────────
async function downloadCloudflared() {
  // Delete old binary if it exists (might be wrong arch)
  if (fs.existsSync(CLOUDFLARED_PATH)) {
    fs.unlinkSync(CLOUDFLARED_PATH);
  }

  const url = getCloudflaredUrl();
  console.log(`[tunnel] Downloading cloudflared for arch=${os.arch()} from ${url}`);
  await downloadFile(url, CLOUDFLARED_PATH);
  console.log('[tunnel] cloudflared downloaded to', CLOUDFLARED_PATH);
}

// ── Start cloudflared tunnel ───────────────────────────────────────────────
function startTunnel() {
  console.log(`[tunnel] Starting tunnel on port ${BRIDGE_PORT}...`);

  // If a tunnel token is provided, use named tunnel (permanent URL)
  const tunnelToken = process.env.CLOUDFLARE_TUNNEL_TOKEN;
  const args = tunnelToken
    ? ['tunnel', '--no-autoupdate', 'run', '--token', tunnelToken]
    : ['tunnel', '--url', `http://localhost:${BRIDGE_PORT}`];

  const tunnel = spawn(CLOUDFLARED_PATH, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  function extractUrl(text) {
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) {
      console.log('\n========================================');
      console.log('CLOUDFLARE TUNNEL URL:');
      console.log('  ' + match[0]);
      console.log('SET IN VERCEL: NEXT_PUBLIC_BRIDGE_URL=' + match[0]);
      console.log('========================================\n');
    }
  }

  tunnel.stdout.on('data', (d) => { const t = d.toString(); extractUrl(t); process.stdout.write('[cf] ' + t); });
  tunnel.stderr.on('data', (d) => { const t = d.toString(); extractUrl(t); process.stderr.write('[cf] ' + t); });
  tunnel.on('exit', (code) => {
    console.log(`[tunnel] cloudflared exited with code ${code}`);
    if (code !== 0) {
      console.log('[tunnel] Retrying in 15 seconds...');
      setTimeout(startTunnel, 15000);
    }
  });
}

// ── Main ───────────────────────────────────────────────────────────────────
console.log('[start] Starting SS E-Sports bot...');
require('./index.js');

setTimeout(async () => {
  try {
    await downloadCloudflared();
    startTunnel();
  } catch (err) {
    console.error('[tunnel] Failed:', err.message);
    console.log('[tunnel] Bot continues without tunnel.');
  }
}, 10000);


