import { NextRequest, NextResponse } from 'next/server'

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL ?? 'http://localhost:3001'
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY ?? ''

/**
 * Strip the /api/bridge prefix and forward to the bridge server.
 * Injects the Authorization header server-side — key never reaches the browser.
 */
async function proxyRequest(
  req: NextRequest,
  { params }: { params: { path: string[] } }
): Promise<NextResponse> {
  const path = params.path.join('/')
  const targetUrl = `${BRIDGE_URL}/api/${path}`

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${BRIDGE_API_KEY}`,
  }

  let body: string | undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      body = await req.text()
    } catch {
      body = undefined
    }
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    })

    const data = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (err) {
    console.error('[bridge proxy] fetch error:', err)
    return NextResponse.json(
      { success: false, error: 'Bridge server unreachable' },
      { status: 502 }
    )
  }
}

export const GET = proxyRequest
export const POST = proxyRequest
export const PUT = proxyRequest
export const PATCH = proxyRequest
export const DELETE = proxyRequest
