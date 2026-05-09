import type { NextAuthOptions } from 'next-auth'
import DiscordProvider from 'next-auth/providers/discord'

const ADMINISTRATOR_PERMISSION = BigInt(0x8)

async function fetchGuildMember(accessToken: string, guildId: string) {
  const res = await fetch(
    `https://discord.com/api/v10/users/@me/guilds/${guildId}/member`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
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
    signIn: '/login',
    error: '/denied',
  },

  callbacks: {
    async signIn({ account }) {
      if (!account?.access_token) return false

      const guildId = process.env.GUILD_ID
      if (!guildId) {
        console.error('GUILD_ID environment variable is not set')
        return false
      }

      try {
        const member = await fetchGuildMember(account.access_token, guildId)
        if (!member) return '/denied'

        const permissions = BigInt(member.permissions ?? '0')
        const isAdmin = (permissions & ADMINISTRATOR_PERMISSION) !== BigInt(0)

        if (!isAdmin) return '/denied'

        return true
      } catch (err) {
        console.error('Error checking guild membership:', err)
        return '/denied'
      }
    },

    async jwt({ token, account }) {
      if (account?.access_token) {
        token.accessToken = account.access_token

        const guildId = process.env.GUILD_ID
        if (guildId) {
          try {
            const member = await fetchGuildMember(account.access_token, guildId)
            if (member) {
              const permissions = BigInt(member.permissions ?? '0')
              token.isAdmin = (permissions & ADMINISTRATOR_PERMISSION) !== BigInt(0)
            } else {
              token.isAdmin = false
            }
          } catch {
            token.isAdmin = false
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
        },
      }
    },
  },
}
