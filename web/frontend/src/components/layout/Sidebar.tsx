'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from '@/components/providers/ThemeProvider'

const NAV = [
  { href: '/dashboard', icon: '⬡', label: 'Dashboard' },
  { href: '/devices',   icon: '▣', label: 'Devices'   },
  { href: '/alerts',    icon: '⚠', label: 'Sensor'    },
]

export default function Sidebar() {
  const path = usePathname()
  const { theme, toggle } = useTheme()

  return (
    <aside className="fixed left-0 top-0 h-screen w-52 bg-surface-card border-r border-accent/20 flex flex-col">
      {/* Header */}
      <div className="px-5 py-5 border-b border-accent/20">
        <p className="text-xs text-accent font-mono tracking-widest text-glow">CONB</p>
        <p className="text-ink font-semibold text-sm mt-0.5 font-mono">Monitoring Dashboard</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ href, icon, label }) => {
          const active = path === href || path.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm font-mono transition-colors relative ${
                active
                  ? 'text-accent text-glow'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-accent accent-glow rounded-r" />
              )}
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Theme toggle + version */}
      <div className="px-4 py-4 border-t border-accent/20 space-y-3">
        <button
          onClick={toggle}
          className="w-full flex items-center justify-between px-3 py-2 rounded border border-accent/20 hover:border-accent/50 hover:bg-accent/5 transition-colors group"
        >
          <span className="text-xs text-ink-muted font-mono group-hover:text-ink transition-colors">
            {theme === 'dark' ? '◑  DARK' : '◐  LIGHT'}
          </span>
          <span className={`text-xs font-mono font-bold ${theme === 'dark' ? 'text-accent' : 'text-accent'}`}>
            {theme === 'dark' ? '[ DARK ]' : '[LIGHT ]'}
          </span>
        </button>
        <p className="text-xs text-ink-faint font-mono px-1">v1.2.0</p>
      </div>
    </aside>
  )
}
