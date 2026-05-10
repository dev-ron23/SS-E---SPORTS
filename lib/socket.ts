import { io, Socket } from 'socket.io-client'

/**
 * Socket.IO client singleton.
 *
 * In production (HTTPS), the browser cannot connect directly to an HTTP bridge
 * server due to mixed-content blocking. We proxy the Socket.IO connection
 * through the Next.js server using the /api/socketio path so it goes over HTTPS.
 *
 * In development (localhost), connect directly to the bridge server.
 */
const isProduction = typeof window !== 'undefined' && window.location.protocol === 'https:'

// In production: connect to the same origin (Vercel) via the proxy path.
// In development: connect directly to the bridge server.
const socketUrl = isProduction
  ? (typeof window !== 'undefined' ? window.location.origin : '')
  : (process.env.NEXT_PUBLIC_BRIDGE_URL ?? 'http://localhost:3001')

const socketPath = isProduction ? '/api/socketio' : '/socket.io'

export const socket: Socket = io(socketUrl, {
  path: socketPath,
  autoConnect: false,
  reconnection: true,
  reconnectionDelay: 5000,
  reconnectionAttempts: Infinity,
  transports: ['websocket', 'polling'],
})

export function connectSocket(): void {
  if (!socket.connected) socket.connect()
}

export function disconnectSocket(): void {
  socket.disconnect()
}
