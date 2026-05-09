import { io, Socket } from 'socket.io-client'

export const socket: Socket = io(process.env.NEXT_PUBLIC_BRIDGE_URL ?? 'http://localhost:3001', {
  autoConnect: false,
  reconnection: true,
  reconnectionDelay: 5000,
  reconnectionAttempts: Infinity,
})

export function connectSocket(): void {
  if (!socket.connected) socket.connect()
}

export function disconnectSocket(): void {
  socket.disconnect()
}
