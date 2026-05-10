import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export interface DiscordUserProfile {
  id: string
  username: string
  global_name: string | null
  discriminator: string
  avatar: string | null
  banner: string | null
  banner_color: string | null
  accent_color: number | null
  avatar_decoration_data: {
    asset: string
    sku_id: string
  } | null
  // Computed CDN URLs
  avatarUrl: string | null
  bannerUrl: string | null
  avatarDecorationUrl: string | null
}

const DISCORD_CDN = 'https://cdn.discordapp.com'

function avatarUrl(userId: string, hash: string | null): string | null {
  if (!hash) return null
  const ext = hash.startsWith('a_') ? 'gif' : 'webp'
  return `${DISCORD_CDN}/avatars/${userId}/${hash}.${ext}?size=256`
}

function bannerUrl(userId: string, hash: string | null): string | null {
  if (!hash) return null
  const ext = hash.startsWith('a_') ? 'gif' : 'webp'
  return `${DISCORD_CDN}/banners/${userId}/${hash}.${ext}?size=600`
}

function decorationUrl(asset: string | null): string | null {
  if (!asset) return null
  return `${DISCORD_CDN}/avatar-decoration-presets/${asset}.png?size=96&passthrough=true`
}

/**
 * GET /api/discord/user/[id]
 * Fetches a Discord user's public profile using the bot token.
 * Requires the caller to be authenticated (any signed-in user).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  // Require authentication — players must be signed in
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = params
  if (!id || !/^\d{17,20}$/.test(id)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
  }

  const botToken = process.env.BOT_TOKEN
  if (!botToken) {
    return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 })
  }

  try {
    const res = await fetch(`https://discord.com/api/v10/users/${id}`, {
      headers: {
        Authorization: `Bot ${botToken}`,
        'User-Agent': 'SS-Esports-Dashboard/1.0',
      },
      // Cache for 5 minutes — Discord profiles don't change that often
      next: { revalidate: 300 },
    })

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Discord API error' }, { status: res.status })
    }

    const user = await res.json()

    const profile: DiscordUserProfile = {
      id: user.id,
      username: user.username,
      global_name: user.global_name ?? null,
      discriminator: user.discriminator,
      avatar: user.avatar,
      banner: user.banner ?? null,
      banner_color: user.banner_color ?? null,
      accent_color: user.accent_color ?? null,
      avatar_decoration_data: user.avatar_decoration_data ?? null,
      avatarUrl: avatarUrl(user.id, user.avatar),
      bannerUrl: bannerUrl(user.id, user.banner ?? null),
      avatarDecorationUrl: decorationUrl(user.avatar_decoration_data?.asset ?? null),
    }

    return NextResponse.json(profile)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 })
  }
}
