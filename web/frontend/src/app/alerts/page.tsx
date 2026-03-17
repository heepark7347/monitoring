'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { fetcher, api } from '@/lib/api'
import type { DashboardSummary, Device, Sensor, SensorStatus } from '@/lib/types'

const STATUS_CFG: Record<SensorStatus, { label: string; dot: string; text: string; row: string; tab: string; tabActive: string }> = {
  up:      { label: 'UP',      dot: 'bg-emerald-400', text: 'text-emerald-400', row: 'border-surface-border/30',           tab: 'text-ink-muted hover:text-emerald-300', tabActive: 'border-emerald-500 text-emerald-400' },
  down:    { label: 'DOWN',    dot: 'bg-red-400',     text: 'text-red-400',     row: 'border-red-500/30 bg-red-900/10',     tab: 'text-ink-muted hover:text-red-300',     tabActive: 'border-red-500     text-red-400'     },
  warning: { label: 'WARNING', dot: 'bg-amber-400',   text: 'text-amber-400',   row: 'border-amber-500/30 bg-amber-900/10', tab: 'text-ink-muted hover:text-amber-300',   tabActive: 'border-amber-500   text-amber-400'   },
  pause:   { label: 'PAUSE',   dot: 'bg-slate-500',   text: 'text-ink-muted',   row: 'border-surface-border/25 bg-surface-card/30', tab: 'text-ink-muted hover:text-ink/85', tabActive: 'border-slate-400 text-ink/70' },
}

const STATUS_ORDER: SensorStatus[] = ['down', 'warning', 'up', 'pause']

const TYPE_ORDER: Sensor['type'][] = ['GPU', 'Node', 'Network', 'Disk', 'ICMP', 'Port']

const TYPE_CFG: Record<Sensor['type'], { icon: string; label: string }> = {
  GPU:     { icon: '▣', label: 'GPU' },
  Node:    { icon: '⬡', label: 'System' },
  Network: { icon: '⇆', label: 'Network' },
  Disk:    { icon: '◫', label: 'Disk' },
  ICMP:    { icon: '⟳', label: 'ICMP' },
  Port:    { icon: '⇌', label: 'Port' },
}

function SensorRow({ sensor, deviceName }: { sensor: Sensor; deviceName: string }) {
  const cfg = STATUS_CFG[sensor.status]
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${cfg.row}`}>
      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <span className="w-32 text-xs text-ink/85 font-mono truncate flex-shrink-0" title={deviceName}>{deviceName || '—'}</span>
      <span className="w-28 text-xs text-ink-muted/60 font-mono flex-shrink-0">{sensor.host_ip}</span>
      <span className="w-20 text-xs text-ink-muted/60 flex-shrink-0">{TYPE_CFG[sensor.type]?.label ?? sensor.type}</span>
      <span className="flex-1 text-sm text-ink/85 font-mono truncate">{sensor.name}</span>
      <span className={`w-32 text-xs font-mono text-right flex-shrink-0 ${
        sensor.status === 'down'    ? 'text-red-400' :
        sensor.status === 'warning' ? 'text-amber-400' : 'text-ink-muted/60'
      }`}>{sensor.detail || '—'}</span>
      <span className={`w-16 text-xs font-mono font-semibold text-right flex-shrink-0 ${cfg.text}`}>{cfg.label}</span>
    </div>
  )
}

function TypeSection({ type, sensors, deviceMap }: {
  type: Sensor['type']
  sensors: Sensor[]
  deviceMap: Record<string, string>
}) {
  if (sensors.length === 0) return null
  const cfg = TYPE_CFG[type]
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 px-1">
        <span className="text-ink-muted/60 text-sm">{cfg.icon}</span>
        <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider">{cfg.label}</h3>
        <span className="text-xs text-ink-faint">{sensors.length}</span>
      </div>
      <div className="space-y-1">
        {sensors.map(s => (
          <SensorRow key={s.key} sensor={s} deviceName={deviceMap[s.host_ip] ?? s.host_ip} />
        ))}
      </div>
    </div>
  )
}

export default function SensorPage() {
  const [activeTab, setActiveTab] = useState<SensorStatus>('down')
  const { data }       = useSWR<DashboardSummary>(api.dashboard.summary(), fetcher, { refreshInterval: 15000 })
  const { data: devs } = useSWR<Device[]>(api.devices.list(), fetcher, { refreshInterval: 60000 })

  const sensors = data?.sensors ?? []
  const deviceMap: Record<string, string> = {}
  for (const d of devs ?? []) deviceMap[d.host_ip] = d.display_name || d.host_ip

  const countByStatus = (st: SensorStatus) => sensors.filter(s => s.status === st).length
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
              }`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* 컬럼 헤더 */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-3 px-4 text-xs text-ink-muted/40 uppercase tracking-wider">
          <span className="w-2 flex-shrink-0" />
          <span className="w-32 flex-shrink-0">장비명</span>
          <span className="w-28 flex-shrink-0">IP</span>
          <span className="w-20 flex-shrink-0">종류</span>
          <span className="flex-1">센서명</span>
          <span className="w-32 text-right flex-shrink-0">수치</span>
          <span className="w-16 text-right flex-shrink-0">상태</span>
        </div>
      )}

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
            <TypeSection key={type} type={type} sensors={byType(type)} deviceMap={deviceMap} />
          ))}
        </div>
      )}
    </div>
  )
}
