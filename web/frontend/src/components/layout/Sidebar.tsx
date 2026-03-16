'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/dashboard', icon: '⬡', label: 'Dashboard' },
  { href: '/devices',   icon: '▣', label: 'Devices' },
  { href: '/alerts',    icon: '⚠', label: 'Alerts' },
  { href: '/settings',  icon: '⚙', label: 'Settings' },
]

export default function Sidebar() {
  const path = usePathname()
  return (
    <aside className="fixed left-0 top-0 h-screen w-52 bg-surface-card border-r border-surface-border flex flex-col">
      <div className="px-5 py-5 border-b border-surface-border">
        <p className="text-xs text-slate-500 font-mono">CONB</p>
        <p className="text-slate-200 font-semibold text-sm mt-0.5">Monitoring Dashboard</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, icon, label }) => {
          const active = path === href || path.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-blue-600/20 text-blue-400 font-medium'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
              }`}
            >
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="px-5 py-4 border-t border-surface-border">
        <p className="text-xs text-slate-600">v1.1.0</p>
      </div>
    </aside>
  )
}
