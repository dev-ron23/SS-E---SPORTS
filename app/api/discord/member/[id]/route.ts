import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export interface GuildRole {
  id: string
  name: string
  color: number
  colorHex: string
  position: number
  hoist: boolean
}

export interface GuildMemberInfo {
  id: string
  nick: string | null
  joined_at: string
  roles: GuildRole[]
  premium_since: string | null
  pending: boolean
}

function colorToHex(color: number): string {
  if (color === 0) return ''
  return `#${color.toString(16).padStart(6, '0')}`
}

/**
 * GET /api/discord/member/[id]
 * Fetches a guild member's info (join date, resolved roles with names+colors, nickname).
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
    // Fetch member and all guild roles in parallel
    const [memberRes, rolesRes] = await Promise.all([
      fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${id}`, {
        headers: { Authorization: `Bot ${botToken}`, 'User-Agent': 'SS-Esports-Dashboard/1.0' },
        next: { revalidate: 300 },
      }),
      fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
        headers: { Authorization: `Bot ${botToken}`, 'User-Agent': 'SS-Esports-Dashboard/1.0' },
        next: { revalidate: 600 }, // roles change less often
      }),
    ])

    if (!memberRes.ok) {
      if (memberRes.status === 404) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
      return NextResponse.json({ error: 'Discord API error' }, { status: memberRes.status })
    }

    const member = await memberRes.json()
    const allRoles: { id: string; name: string; color: number; position: number; hoist: boolean }[] =
      rolesRes.ok ? await rolesRes.json() : []

    // Build a map of role ID → role data
    const roleMap = new Map(allRoles.map((r) => [r.id, r]))

    // Resolve member's role IDs to full role objects, filter out @everyone, sort by position desc
    const resolvedRoles: GuildRole[] = (member.roles as string[])
      .map((roleId) => {
        const r = roleMap.get(roleId)
        if (!r) return null
        return {
          id: r.id,
          name: r.name,
          color: r.color,
          colorHex: colorToHex(r.color),
          position: r.position,
          hoist: r.hoist,
        }
      })
      .filter((r): r is GuildRole => r !== null && r.name !== '@everyone')
      .sort((a, b) => b.position - a.position)

    const info: GuildMemberInfo = {
      id,
      nick: member.nick ?? null,
      joined_at: member.joined_at,
      roles: resolvedRoles,
      premium_since: member.premium_since ?? null,
      pending: member.pending ?? false,
    }

    return NextResponse.json(info)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch member info' }, { status: 500 })
  }
}
