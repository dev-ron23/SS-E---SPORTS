import type { NextAuthOptions } from 'next-auth'
import DiscordProvider from 'next-auth/providers/discord'

const DEFAULT_DASHBOARD_ADMIN_ROLE_ID = '1438586285345341450'

type DiscordGuildMember = {
  roles?: string[]
}

function getDashboardAdminRoleId() {
  return process.env.DASHBOARD_ADMIN_ROLE_ID?.trim() || DEFAULT_DASHBOARD_ADMIN_ROLE_ID
}

function hasDashboardAdminRole(member: DiscordGuildMember | null) {
  return member?.roles?.includes(getDashboardAdminRoleId()) ?? false
}

async function fetchGuildMember(accessToken: string, guildId: string): Promise<DiscordGuildMember | null> {
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

        if (!hasDashboardAdminRole(member)) return '/denied'

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
              token.isAdmin = hasDashboardAdminRole(member)
              token.dashboardAdminRoleId = getDashboardAdminRoleId()
            } else {
              token.isAdmin = false
              token.dashboardAdminRoleId = getDashboardAdminRoleId()
            }
          } catch {
            token.isAdmin = false
            token.dashboardAdminRoleId = getDashboardAdminRoleId()
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
