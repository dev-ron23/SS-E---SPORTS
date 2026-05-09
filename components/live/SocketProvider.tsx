'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { connectSocket, disconnectSocket, socket } from '@/lib/socket'

type SocketStatus = 'connected' | 'disconnected' | 'reconnecting'

interface SocketContextValue {
  status: SocketStatus
}

const SocketContext = createContext<SocketContextValue>({ status: 'disconnected' })

export function SocketProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [status, setStatus] = useState<SocketStatus>('disconnected')

  useEffect(() => {
    connectSocket()

    function onConnect() {
      setStatus('connected')
    }

    function onDisconnect() {
      setStatus('disconnected')
    }

    function onConnectError() {
      setStatus('reconnecting')
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)

    // Sync initial state if already connected
    if (socket.connected) {
      setStatus('connected')
    }

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      disconnectSocket()
    }
  }, [])

  return (
    <SocketContext.Provider value={{ status }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocketStatus(): SocketContextValue {
  return useContext(SocketContext)
}
