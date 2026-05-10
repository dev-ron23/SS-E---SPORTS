import type { NextAuthOptions } from 'next-auth'
import DiscordProvider from 'next-auth/providers/discord'

// Owner role ID — only this role gets admin access
const OWNER_ROLE_ID = process.env.OWNER_ROLE_ID?.trim() || '1407286622957080597'

type DiscordGuildMember = {
  roles?: string[]
}

function hasOwnerRole(member: DiscordGuildMember | null): boolean {
  return member?.roles?.includes(OWNER_ROLE_ID) ?? false
}

async function fetchGuildMember(accessToken: string, guildId: string): Promise<DiscordGuildMember | null> {
  const res = await fetch(
    `https://discord.com/api/v10/users/@me/guilds/${guildId}/member`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) return null
  return res.json()
}

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'identify guilds guilds.members.read',
        },
      },
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: 86400, // 24 hours
  },

  pages: {
    signIn: '/portal/login',
    error: '/portal/denied',
  },

  callbacks: {
    // Allow ALL Discord users to sign in — role check happens in jwt/middleware
    async signIn({ account }) {
      if (!account?.access_token) return false
      return true
    },

    async jwt({ token, account }) {
      if (account?.access_token) {
        token.accessToken = account.access_token

        const guildId = process.env.GUILD_ID
        if (guildId) {
          try {
            const member = await fetchGuildMember(account.access_token, guildId)
            token.isAdmin = hasOwnerRole(member)
            token.isGuildMember = member !== null
          } catch {
            token.isAdmin = false
            token.isGuildMember = false
          }
        }
      }
      return token
    },

    async session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: token.sub ?? '',
          isAdmin: (token.isAdmin as boolean) ?? false,
          isGuildMember: (token.isGuildMember as boolean) ?? false,
        },
      }
    },
  },
}
