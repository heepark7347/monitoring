'use client'
import useSWR from 'swr'
import Link from 'next/link'
import { fetcher, api } from '@/lib/api'
import type { Device, DashboardSummary, SensorStatus } from '@/lib/types'

const TYPE_LABEL: Record<string, string> = {
  gpu: 'GPU', node: 'System', disk: 'Disk', network: 'Network',
}

const STATUS_DOT: Record<SensorStatus, string> = {
  up:      'bg-emerald-400',
  down:    'bg-red-400',
  warning: 'bg-amber-400',
  pause:   'bg-slate-500',
}

function worstStatus(statuses: SensorStatus[]): SensorStatus {
  if (statuses.includes('down'))    return 'down'
  if (statuses.includes('warning')) return 'warning'
  if (statuses.includes('pause'))   return 'pause'
  return 'up'
}

export default function DevicesPage() {
  const { data: devices }  = useSWR<Device[]>(api.devices.list(), fetcher, { refreshInterval: 30000 })
  const { data: summary }  = useSWR<DashboardSummary>(api.dashboard.summary(), fetcher, { refreshInterval: 30000 })

  // host_ip별 센서 상태 맵
  const hostStatusMap: Record<string, SensorStatus[]> = {}
  for (const s of summary?.sensors ?? []) {
    if (!hostStatusMap[s.host_ip]) hostStatusMap[s.host_ip] = []
    hostStatusMap[s.host_ip].push(s.status)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Devices</h1>
        <p className="text-sm text-ink-muted/60 mt-0.5">등록된 모니터링 디바이스</p>
      </div>

      {!devices ? (
        <p className="text-ink-muted/60 text-sm">로딩 중...</p>
      ) : devices.length === 0 ? (
        <p className="text-ink-muted/60 text-sm">등록된 디바이스가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {devices.map(d => {
            const statuses = hostStatusMap[d.host_ip] ?? []
            const status   = worstStatus(statuses as SensorStatus[])
            const dot      = STATUS_DOT[status]
            const downCnt  = statuses.filter(s => s === 'down').length
            const warnCnt  = statuses.filter(s => s === 'warning').length

            return (
              <Link
                key={d.host_ip}
                href={`/devices/${encodeURIComponent(d.host_ip)}`}
                className="block bg-surface-card border border-surface-border rounded-xl p-5 hover:border-accent/30 hover:bg-surface-card/60 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                    <p className="font-mono text-ink font-semibold">{d.host_ip}</p>
                  </div>
                  <div className="flex gap-1.5">
                    {downCnt > 0 && (
                      <span className="rounded-full bg-red-600/30 text-red-300 text-xs px-2 py-0.5 font-semibold">
                        DOWN {downCnt}
                      </span>
                    )}
                    {warnCnt > 0 && (
                      <span className="rounded-full bg-amber-600/30 text-amber-300 text-xs px-2 py-0.5 font-semibold">
                        WARN {warnCnt}
                      </span>
                    )}
                    {downCnt === 0 && warnCnt === 0 && (
                      <span className="rounded-full bg-emerald-600/20 text-emerald-400 text-xs px-2 py-0.5 font-semibold">
                        정상
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {d.sensor_types.map(t => (
                    <span key={t} className="rounded bg-surface-border/40 text-ink/70 text-xs px-2.5 py-1">
                      {TYPE_LABEL[t] ?? t}
                    </span>
                  ))}
                </div>

                <p className="text-xs text-ink-muted/60 mt-3">
                  {statuses.length}개 센서 · 클릭하여 상세 보기
                </p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
