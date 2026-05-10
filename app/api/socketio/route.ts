/**
 * Socket.IO proxy for production.
 *
 * The browser connects to https://ss-esports.vercel.app/api/socketio
 * This route proxies the WebSocket upgrade to the bridge server at NEXT_PUBLIC_BRIDGE_URL.
 *
 * NOTE: Vercel Serverless Functions do NOT support WebSocket upgrades.
 * Socket.IO will fall back to HTTP long-polling through this route.
 *
 * For true WebSocket support in production, the bot's bridge server needs
 * to be accessible over HTTPS (e.g. via a reverse proxy with SSL).
 */

import { NextRequest, NextResponse } from 'next/server'

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL ?? 'http://localhost:3001'

async function handler(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url)
  // Forward the full query string (Socket.IO uses ?EIO=4&transport=polling&sid=...)
  const targetUrl = `${BRIDGE_URL}/socket.io${url.search}`

  const headers: HeadersInit = {
    'Content-Type': req.headers.get('content-type') ?? 'application/octet-stream',
  }

  let body: ArrayBuffer | undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      body = await req.arrayBuffer()
    } catch {
      body = undefined
    }
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: body ? body : undefined,
    })

    const responseBody = await upstream.arrayBuffer()
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Bridge unreachable' }, { status: 502 })
  }
}

export const GET = handler
export const POST = handler
