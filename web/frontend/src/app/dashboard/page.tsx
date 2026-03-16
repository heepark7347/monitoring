'use client'
import useSWR from 'swr'
import { fetcher, api } from '@/lib/api'
import type { DashboardSummary, SensorStatus } from '@/lib/types'
import SensorStatusDonut from '@/components/charts/SensorStatusDonut'

const STATUS_CFG: Record<SensorStatus, { label: string; color: string; ring: string }> = {
  up:      { label: 'Up',      color: 'text-emerald-400', ring: 'border-emerald-500/40 bg-emerald-900/20' },
  down:    { label: 'Down',    color: 'text-red-400',     ring: 'border-red-500/40     bg-red-900/20'     },
  warning: { label: 'Warning', color: 'text-amber-400',   ring: 'border-amber-500/40  bg-amber-900/20'   },
  pause:   { label: 'Pause',   color: 'text-slate-400',   ring: 'border-slate-600/40  bg-slate-800/30'   },
}

const LEGEND = [
  { status: 'up'      as SensorStatus, dot: 'bg-emerald-400' },
  { status: 'down'    as SensorStatus, dot: 'bg-red-400'     },
  { status: 'warning' as SensorStatus, dot: 'bg-amber-400'   },
  { status: 'pause'   as SensorStatus, dot: 'bg-slate-500'   },
]

export default function DashboardPage() {
  const { data } = useSWR<DashboardSummary>(api.dashboard.summary(), fetcher, { refreshInterval: 30000 })
  const c = data?.counts

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">전체 센서 상태 요약</p>
      </div>

      {/* 도넛 차트 + 범례 */}
      <div className="bg-surface-card border border-surface-border rounded-xl p-8 flex items-center gap-12">
        <div className="flex-shrink-0">
          <SensorStatusDonut
            up={c?.up ?? 0}
            down={c?.down ?? 0}
            warning={c?.warning ?? 0}
            pause={c?.pause ?? 0}
            size={220}
          />
        </div>

        <div className="flex-1 space-y-4">
          {LEGEND.map(({ status, dot }) => {
            const cfg   = STATUS_CFG[status]
            const count = c?.[status] ?? 0
            const pct   = c?.total ? Math.round((count / c.total) * 100) : 0
            return (
              <div key={status} className="flex items-center gap-4">
                <span className={`h-3 w-3 rounded-full flex-shrink-0 ${dot}`} />
                <span className="text-sm text-slate-400 w-20">{cfg.label}</span>
                <div className="flex-1 h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${dot}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`text-2xl font-bold font-mono w-10 text-right ${cfg.color}`}>{count}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 상태 카드 4개 */}
      <div className="grid grid-cols-4 gap-4">
        {LEGEND.map(({ status, dot }) => {
          const cfg   = STATUS_CFG[status]
          const count = c?.[status] ?? 0
          return (
            <div key={status} className={`rounded-xl border p-5 ${cfg.ring}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`h-2 w-2 rounded-full ${dot}`} />
                <p className={`text-xs font-semibold uppercase tracking-widest ${cfg.color}`}>{cfg.label}</p>
              </div>
              <p className={`text-4xl font-bold font-mono ${cfg.color}`}>{count}</p>
              <p className="text-xs text-slate-500 mt-1">
                {c?.total ? `전체의 ${Math.round((count / c.total) * 100)}%` : '—'}
              </p>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-slate-600 text-right">
        총 <span className="text-slate-400">{c?.total ?? 0}</span>개 센서 · 30초마다 갱신
      </p>
    </div>
  )
}
