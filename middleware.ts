import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import type { NextRequest } from 'next/server'

const DEFAULT_DASHBOARD_ADMIN_ROLE_ID = '1438586285345341450'

function getDashboardAdminRoleId() {
  return process.env.DASHBOARD_ADMIN_ROLE_ID?.trim() || DEFAULT_DASHBOARD_ADMIN_ROLE_ID
}

export async function middleware(req: NextRequest) {
  const token = await getToken({ req })

  if (!token) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', req.nextUrl.href)
    return NextResponse.redirect(loginUrl)
  }

  if (token.isAdmin !== true || token.dashboardAdminRoleId !== getDashboardAdminRoleId()) {
    return NextResponse.redirect(new URL('/denied', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!login|denied|api/auth|_next/static|_next/image|favicon.ico).*)'],
}
