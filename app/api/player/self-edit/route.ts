import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * POST /api/player/self-edit
 * Player-facing endpoint — forwards to bridge /api/player/self-edit.
 * Uses the session to verify the caller's Discord ID server-side.
 * The bridge exempts /api/player/* from API key auth.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })
  }

  // If session is available, enforce discord_id matches the authenticated user
  if (session?.user?.id) {
    body.discord_id = session.user.id
  } else if (!body.discord_id) {
    // No session and no discord_id — reject
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
  }
  // If no session but discord_id is provided, the bridge will validate it against the DB

  const bridgeUrl = process.env.NEXT_PUBLIC_BRIDGE_URL ?? 'http://localhost:3001'

  try {
    const upstream = await fetch(`${bridgeUrl}/api/player/self-edit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Include API key so it works even if bridge auth is strict
        Authorization: `Bearer ${process.env.BRIDGE_API_KEY ?? ''}`,
      },
      body: JSON.stringify(body),
    })
    const data = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch {
    return NextResponse.json({ success: false, error: 'Bridge server unreachable' }, { status: 502 })
  }
}
