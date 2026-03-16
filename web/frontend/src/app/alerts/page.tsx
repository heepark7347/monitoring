'use client'
import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { fetcher, poster, api } from '@/lib/api'
import type { DashboardSummary, Sensor, SensorStatus } from '@/lib/types'

const STATUS_CFG: Record<SensorStatus, { label: string; dot: string; text: string; row: string; tab: string; tabActive: string }> = {
  up:      { label: 'UP',      dot: 'bg-emerald-400', text: 'text-emerald-400', row: 'border-surface-border/30',           tab: 'text-ink-muted hover:text-emerald-300', tabActive: 'border-emerald-500 text-emerald-400' },
  down:    { label: 'DOWN',    dot: 'bg-red-400',     text: 'text-red-400',     row: 'border-red-500/30 bg-red-900/10',     tab: 'text-ink-muted hover:text-red-300',     tabActive: 'border-red-500     text-red-400'     },
  warning: { label: 'WARNING', dot: 'bg-amber-400',   text: 'text-amber-400',   row: 'border-amber-500/30 bg-amber-900/10', tab: 'text-ink-muted hover:text-amber-300',   tabActive: 'border-amber-500   text-amber-400'   },
  pause:   { label: 'PAUSE',   dot: 'bg-slate-500',   text: 'text-ink-muted',   row: 'border-surface-border/25 bg-surface-card/30', tab: 'text-ink-muted hover:text-ink/85',   tabActive: 'border-slate-400   text-ink/70'   },
}

const STATUS_ORDER: SensorStatus[] = ['up', 'down', 'warning', 'pause']

const TYPE_ORDER: Sensor['type'][] = ['GPU', 'Node', 'Network', 'Disk', 'ICMP', 'Port']

const TYPE_CFG: Record<Sensor['type'], { icon: string; label: string }> = {
  GPU:     { icon: '▣', label: 'GPU' },
  Node:    { icon: '⬡', label: 'System' },
  Network: { icon: '⇆', label: 'Network' },
  Disk:    { icon: '◫', label: 'Disk' },
  ICMP:    { icon: '⟳', label: 'ICMP' },
  Port:    { icon: '⇌', label: 'Port' },
}

function SensorRow({ sensor, onPause, onResume }: {
  sensor: Sensor
  onPause: (key: string) => void
  onResume: (key: string) => void
}) {
  const cfg      = STATUS_CFG[sensor.status]
  const isPaused = sensor.status === 'pause'
  return (
    <div className={`flex items-center gap-4 rounded-lg border px-4 py-3 ${cfg.row}`}>
      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <span className="text-xs text-ink-muted/60 w-16">{TYPE_CFG[sensor.type].label}</span>
      <span className="flex-1 text-sm text-ink/85 font-mono">{sensor.name}</span>
      <button
        onClick={() => isPaused ? onResume(sensor.key) : onPause(sensor.key)}
        className={`flex-shrink-0 rounded px-3 py-1 text-xs font-medium transition-colors ${
          isPaused
            ? 'bg-emerald-700/40 text-emerald-300 hover:bg-emerald-700/60'
            : 'bg-surface-border/40 text-ink/70 hover:bg-slate-600/60'
        }`}
      >
        {isPaused ? '재개' : '일시정지'}
      </button>
    </div>
  )
}

function TypeSection({ type, sensors, onPause, onResume }: {
  type: Sensor['type']
  sensors: Sensor[]
  onPause: (key: string) => void
  onResume: (key: string) => void
}) {
  if (sensors.length === 0) return null
  const cfg = TYPE_CFG[type]
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-ink-muted/60 text-sm">{cfg.icon}</span>
        <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider">{cfg.label}</h3>
        <span className="text-xs text-ink-faint">{sensors.length}</span>
      </div>
      <div className="space-y-1.5">
        {sensors.map(s => (
          <SensorRow key={s.key} sensor={s} onPause={onPause} onResume={onResume} />
        ))}
      </div>
    </div>
  )
}

export default function AlertsPage() {
  const [activeTab, setActiveTab] = useState<SensorStatus>('up')
  const summaryKey = api.dashboard.summary()
  const { data }   = useSWR<DashboardSummary>(summaryKey, fetcher, { refreshInterval: 30000 })
  const sensors    = data?.sensors ?? []

  async function handlePause(key: string) {
    await poster(api.dashboard.pause(key), 'POST')
    mutate(summaryKey)
  }
  async function handleResume(key: string) {
    await poster(api.dashboard.resume(key), 'DELETE')
    mutate(summaryKey)
  }

  const countByStatus = (st: SensorStatus) => sensors.filter(s => s.status === st).length

  // 현재 탭에 해당하는 센서, 종류별로 나열
  const filtered = sensors.filter(s => s.status === activeTab)
  const byType   = (type: Sensor['type']) => filtered.filter(s => s.type === type)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Sensor</h1>
        <p className="text-sm text-ink-muted/60 mt-0.5">전체 센서 상태</p>
      </div>

      {/* 상태 탭 */}
      <div className="flex gap-0 border-b border-surface-border">
        {STATUS_ORDER.map(st => {
          const cfg   = STATUS_CFG[st]
          const count = countByStatus(st)
          const active = activeTab === st
          return (
            <button
              key={st}
              onClick={() => setActiveTab(st)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active ? cfg.tabActive : `border-transparent ${cfg.tab}`
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
              {cfg.label}
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${
                active ? 'bg-surface-border/60 text-ink/85' : 'bg-surface-card text-ink-muted/60'
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* 탭 콘텐츠 */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-surface-border bg-surface-card px-5 py-12 text-center">
          <p className={`font-medium ${STATUS_CFG[activeTab].text}`}>
            {STATUS_CFG[activeTab].label} 상태의 센서가 없습니다
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {TYPE_ORDER.map(type => (
            <TypeSection
              key={type}
              type={type}
              sensors={byType(type)}
              onPause={handlePause}
              onResume={handleResume}
            />
          ))}
        </div>
      )}
    </div>
  )
}
