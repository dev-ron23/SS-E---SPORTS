import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/discord/presence/[id]
 * Fetches a guild member's presence (online status, activities) via the bot.
 * The bot must have GatewayIntentBits.GuildPresences enabled.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const { id } = params
  if (!id || !/^\d{17,20}$/.test(id)) {
    return NextResponse.json({ status: 'offline' })
  }

  const bridgeUrl = process.env.NEXT_PUBLIC_BRIDGE_URL ?? 'http://localhost:3001'
  const apiKey = process.env.BRIDGE_API_KEY ?? ''

  try {
    const res = await fetch(`${bridgeUrl}/api/presence/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 30 }, // cache 30s
    })
    if (!res.ok) return NextResponse.json({ status: 'offline' })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ status: 'offline' })
  }
}
