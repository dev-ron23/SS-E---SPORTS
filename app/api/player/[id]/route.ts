import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * GET /api/player/[id]
 * Player-facing endpoint — fetches squad data for a given Discord ID.
 * Requires authentication. Players can only fetch their own data.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = params

  // Players can only fetch their own data (admins can fetch anyone's)
  const isAdmin = (session.user as { isAdmin?: boolean })?.isAdmin
  if (!isAdmin && id !== session.user.id) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const bridgeUrl = process.env.NEXT_PUBLIC_BRIDGE_URL ?? 'http://localhost:3001'

  try {
    const upstream = await fetch(`${bridgeUrl}/api/player/${id}`)
    const data = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch {
    return NextResponse.json({ success: false, error: 'Bridge server unreachable' }, { status: 502 })
  }
}
