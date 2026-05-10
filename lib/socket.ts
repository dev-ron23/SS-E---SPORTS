import { io, Socket } from 'socket.io-client'

/**
 * Socket.IO client singleton.
 * Connects directly to the bridge server.
 * NEXT_PUBLIC_BRIDGE_URL must be an HTTPS URL in production
 * (use Cloudflare Tunnel or ngrok to expose the bot over HTTPS).
 */
export const socket: Socket = io(
  process.env.NEXT_PUBLIC_BRIDGE_URL ?? 'http://localhost:3001',
  {
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 5000,
    reconnectionAttempts: Infinity,
    transports: ['websocket', 'polling'],
  }
)

export function connectSocket(): void {
  if (!socket.connected) socket.connect()
}

export function disconnectSocket(): void {
  socket.disconnect()
}

export function connectSocket(): void {
  if (!socket.connected) socket.connect()
}

export function disconnectSocket(): void {
  socket.disconnect()
}
