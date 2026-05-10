import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── Public portal routes — no auth required ──────────────────────────────
  // /portal, /portal/leaderboard, /portal/squads, /portal/matches, /portal/tournament
  if (
    pathname === '/portal' ||
    pathname.startsWith('/portal/leaderboard') ||
    pathname.startsWith('/portal/squads') ||
    pathname.startsWith('/portal/matches') ||
    pathname.startsWith('/portal/tournament') ||
    pathname.startsWith('/portal/login') ||
    pathname.startsWith('/portal/denied')
  ) {
    return NextResponse.next()
  }

  const token = await getToken({ req })

  // ── Player portal routes — any authenticated user ─────────────────────────
  if (pathname.startsWith('/portal/')) {
    if (!token) {
      const loginUrl = new URL('/portal/login', req.url)
      loginUrl.searchParams.set('callbackUrl', req.nextUrl.href)
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }

  // ── Admin routes — owner role only ────────────────────────────────────────
  if (!token) {
    const loginUrl = new URL('/portal/login', req.url)
    loginUrl.searchParams.set('callbackUrl', req.nextUrl.href)
    return NextResponse.redirect(loginUrl)
  }

  if (token.isAdmin !== true) {
    // Authenticated but not admin — send to player portal
    return NextResponse.redirect(new URL('/portal', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|login|denied).*)',
  ],
}
