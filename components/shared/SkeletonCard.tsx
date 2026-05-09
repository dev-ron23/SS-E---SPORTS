import React from 'react'
import { cn } from '@/lib/utils'

interface SkeletonCardProps {
  rows?: number    // default 3
  height?: string  // default 'h-32'
}

export function SkeletonCard({ rows = 3, height = 'h-32' }: SkeletonCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/10 overflow-hidden',
        height
      )}
      style={{
        backdropFilter: 'blur(20px)',
        background: 'rgba(255,255,255,0.03)',
      }}
    >
      <div className="p-4 flex flex-col gap-3 h-full">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="rounded-md animate-shimmer"
            style={{
              height: '1rem',
              background:
                'linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 75%)',
              backgroundSize: '200% 100%',
              width: i === rows - 1 ? '60%' : '100%',
            }}
          />
        ))}
      </div>
    </div>
  )
}
