import type { Metadata } from 'next'
import { ToastProvider } from '@/components/shared/ToastNotification'
import { PortalNav } from '@/components/portal/PortalNav'

export const metadata: Metadata = {
  title: 'SS Esports — Tournament Portal',
  description: 'Live tournament standings, matches, and squad info',
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Cyberpunk grid background — fixed, behind everything */}
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(0,212,255,0.10) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 80%, rgba(139,92,246,0.08) 0%, transparent 50%), #050508',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(0,212,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.035) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)',
        }} />
      </div>

      <ToastProvider>
        <div className="relative z-10 flex flex-col min-h-screen" style={{ background: 'transparent' }}>
          <PortalNav />
          <main className="flex-1 px-4 md:px-8 py-6 max-w-7xl mx-auto w-full">
            {children}
          </main>
          <footer className="relative z-10 border-t border-white/5 py-4 text-center text-xs text-white/20 font-mono tracking-widest">
            SS ESPORTS TOURNAMENT SYSTEM &nbsp;·&nbsp; LIVE DATA
          </footer>
        </div>
      </ToastProvider>
    </>
  )
}
