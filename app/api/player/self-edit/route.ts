import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * POST /api/player/self-edit
 * Player-facing endpoint — forwards to bridge /api/player/self-edit.
 * Uses the session to verify the caller's Discord ID server-side.
 * Does NOT require BRIDGE_API_KEY since the bridge exempts this endpoint.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
  }

  const bridgeUrl = process.env.NEXT_PUBLIC_BRIDGE_URL ?? 'http://localhost:3001'

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })
  }

  // Enforce that discord_id matches the authenticated session — prevents impersonation
  const payload = body as Record<string, unknown>
  if (payload.discord_id && payload.discord_id !== session.user.id) {
    return NextResponse.json({ success: false, error: 'Forbidden: discord_id mismatch' }, { status: 403 })
  }

  // Always use the session user's ID
  payload.discord_id = session.user.id

  try {
    const upstream = await fetch(`${bridgeUrl}/api/player/self-edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch {
    return NextResponse.json({ success: false, error: 'Bridge server unreachable' }, { status: 502 })
  }
}
