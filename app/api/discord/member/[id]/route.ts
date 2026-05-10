import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export interface GuildMemberInfo {
  id: string
  nick: string | null
  joined_at: string
  roles: string[]
  premium_since: string | null
  pending: boolean
}

/**
 * GET /api/discord/member/[id]
 * Fetches a guild member's info (join date, roles, nickname) using the bot token.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = params
  if (!id || !/^\d{17,20}$/.test(id)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
  }

  const botToken = process.env.BOT_TOKEN
  const guildId = process.env.GUILD_ID
  if (!botToken || !guildId) {
    return NextResponse.json({ error: 'Bot token or Guild ID not configured' }, { status: 500 })
  }

  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${id}`, {
      headers: {
        Authorization: `Bot ${botToken}`,
        'User-Agent': 'SS-Esports-Dashboard/1.0',
      },
      next: { revalidate: 300 },
    })

    if (!res.ok) {
      if (res.status === 404) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
      return NextResponse.json({ error: 'Discord API error' }, { status: res.status })
    }

    const member = await res.json()

    const info: GuildMemberInfo = {
      id,
      nick: member.nick ?? null,
      joined_at: member.joined_at,
      roles: member.roles ?? [],
      premium_since: member.premium_since ?? null,
      pending: member.pending ?? false,
    }

    return NextResponse.json(info)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch member info' }, { status: 500 })
  }
}
