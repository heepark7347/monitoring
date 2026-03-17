'use client'
import Link from 'next/link'
import useSWR from 'swr'
import { fetcher, api } from '@/lib/api'
import type { DashboardSummary, Device, Sensor, SensorStatus } from '@/lib/types'
import SensorStatusDonut from '@/components/charts/SensorStatusDonut'

const STATUS_CFG: Record<SensorStatus, { label: string; color: string; ring: string }> = {
  up:      { label: 'Up',      color: 'text-emerald-400', ring: 'border-emerald-500/40 bg-emerald-900/20' },
  down:    { label: 'Down',    color: 'text-red-400',     ring: 'border-red-500/40     bg-red-900/20'     },
  warning: { label: 'Warning', color: 'text-amber-400',   ring: 'border-amber-500/40  bg-amber-900/20'   },
  pause:   { label: 'Pause',   color: 'text-ink-muted',   ring: 'border-surface-border/25  bg-surface-card/30'   },
}

const LEGEND = [
  { status: 'up'      as SensorStatus, dot: 'bg-emerald-400' },
  { status: 'down'    as SensorStatus, dot: 'bg-red-400'     },
  { status: 'warning' as SensorStatus, dot: 'bg-amber-400'   },
  { status: 'pause'   as SensorStatus, dot: 'bg-slate-500'   },
]

const TYPE_ICON: Record<string, string> = {
  GPU: '▣', Node: '⬡', Disk: '◫', Network: '⇆', ICMP: '⟳', Port: '⇌',
}

const STATUS_DOT: Record<SensorStatus, string> = {
  up: 'bg-emerald-400', down: 'bg-red-400', warning: 'bg-amber-400', pause: 'bg-slate-500',
}

function worstStatus(statuses: SensorStatus[]): SensorStatus {
  if (statuses.includes('down'))    return 'down'
  if (statuses.includes('warning')) return 'warning'
  if (statuses.includes('pause'))   return 'pause'
  return 'up'
}

// 장비별 센서 타입 현황 배지
function TypeBadges({ sensors }: { sensors: Sensor[] }) {
  const typeMap = new Map<string, { total: number; down: number; warn: number }>()
  for (const s of sensors) {
    const t = s.type
    if (!typeMap.has(t)) typeMap.set(t, { total: 0, down: 0, warn: 0 })
    const e = typeMap.get(t)!
    e.total++
    if (s.status === 'down')    e.down++
    if (s.status === 'warning') e.warn++
  }
  const order = ['GPU', 'Node', 'Disk', 'Network', 'ICMP', 'Port']
  return (
    <div className="flex flex-wrap gap-1.5">
      {order.filter(t => typeMap.has(t)).map(t => {
        const e = typeMap.get(t)!
        const color = e.down > 0 ? 'text-red-400 border-red-500/30 bg-red-900/10'
          : e.warn > 0 ? 'text-amber-400 border-amber-500/30 bg-amber-900/10'
          : 'text-ink-muted/60 border-surface-border/30 bg-surface-card/30'
        return (
          <span key={t} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs border font-mono ${color}`}>
            {TYPE_ICON[t]}
            {t === 'GPU' || t === 'Disk' || t === 'Network' ? `×${e.total}` : ''}
            {e.down > 0 && <span className="text-red-400 font-bold">↓{e.down}</span>}
          </span>
        )
      })}
    </div>
  )
}

// 장비 행
function DeviceRow({ device, sensors }: { device: Device; sensors: Sensor[] }) {
  const statuses = sensors.map(s => s.status as SensorStatus)
  const status   = worstStatus(statuses)
  const downCnt  = statuses.filter(s => s === 'down').length
  const warnCnt  = statuses.filter(s => s === 'warning').length

  const gpuSensors  = sensors.filter(s => s.type === 'GPU' && s.sensor_name.endsWith('_utilization'))
  const cpuSensor   = sensors.find(s => s.type === 'Node' && s.sensor_name === 'cpu')
  const memSensor   = sensors.find(s => s.type === 'Node' && s.sensor_name === 'memory')

  const gpuUtils = gpuSensors.map(s => {
    const m = s.detail?.match(/([\d.]+)%/)
    return m ? parseFloat(m[1]) : null
  }).filter((v): v is number => v !== null)
  const avgGpu = gpuUtils.length ? gpuUtils.reduce((a, b) => a + b, 0) / gpuUtils.length : null
  const cpuPct = cpuSensor?.detail?.match(/([\d.]+)%/)?.[1]
  const memPct = memSensor?.detail?.match(/([\d.]+)%/)?.[1]

  return (
    <Link
      href={`/devices/${device.id}`}
      className="flex items-center gap-4 px-5 py-3.5 border-b border-surface-border/30 last:border-0 hover:bg-surface-card/50 transition-colors group"
    >
      {/* 상태 dot + 장비명 */}
      <div className="flex items-center gap-2.5 w-44 flex-shrink-0">
        <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[status]}`} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink/85 truncate group-hover:text-accent transition-colors">
            {device.display_name || device.host_ip}
          </p>
          <p className="text-xs text-ink-muted/50 font-mono">{device.host_ip}</p>
        </div>
      </div>

      {/* 센서 타입 배지 */}
      <div className="flex-1 min-w-0">
        {sensors.length > 0
          ? <TypeBadges sensors={sensors} />
          : <span className="text-xs text-ink-faint italic">센서 없음</span>
        }
      </div>

      {/* 핵심 지표 */}
      <div className="flex items-center gap-4 flex-shrink-0 text-xs font-mono">
        {avgGpu !== null && (
          <div className="text-right">
            <p className="text-ink-muted/40">GPU</p>
            <p className={`font-semibold ${avgGpu >= 90 ? 'text-red-400' : avgGpu >= 70 ? 'text-amber-400' : 'text-ink/70'}`}>
              {avgGpu.toFixed(0)}%
            </p>
          </div>
        )}
        {cpuPct && (
          <div className="text-right">
            <p className="text-ink-muted/40">CPU</p>
            <p className={`font-semibold ${parseFloat(cpuPct) >= 90 ? 'text-red-400' : parseFloat(cpuPct) >= 70 ? 'text-amber-400' : 'text-ink/70'}`}>
              {parseFloat(cpuPct).toFixed(0)}%
            </p>
          </div>
        )}
        {memPct && (
          <div className="text-right">
            <p className="text-ink-muted/40">MEM</p>
            <p className={`font-semibold ${parseFloat(memPct) >= 90 ? 'text-red-400' : parseFloat(memPct) >= 70 ? 'text-amber-400' : 'text-ink/70'}`}>
              {parseFloat(memPct).toFixed(0)}%
            </p>
          </div>
        )}
      </div>

      {/* 상태 배지 */}
      <div className="w-24 flex-shrink-0 text-right">
        {downCnt > 0 && (
          <span className="inline-block rounded-full bg-red-600/30 text-red-300 text-xs px-2 py-0.5 font-semibold font-mono">
            DOWN {downCnt}
          </span>
        )}
        {downCnt === 0 && warnCnt > 0 && (
          <span className="inline-block rounded-full bg-amber-600/30 text-amber-300 text-xs px-2 py-0.5 font-semibold font-mono">
            WARN {warnCnt}
          </span>
        )}
        {downCnt === 0 && warnCnt === 0 && sensors.length > 0 && (
          <span className="inline-block rounded-full bg-emerald-600/20 text-emerald-400 text-xs px-2 py-0.5 font-semibold font-mono">
            정상
          </span>
        )}
      </div>
    </Link>
  )
}

export default function DashboardPage() {
  const { data }       = useSWR<DashboardSummary>(api.dashboard.summary(), fetcher, { refreshInterval: 30000 })
  const { data: devs } = useSWR<Device[]>(api.devices.list(), fetcher, { refreshInterval: 60000 })
  const c = data?.counts

  // 장비별 센서 맵
  const deviceSensorMap = new Map<string, Sensor[]>()
  for (const s of data?.sensors ?? []) {
    if (!deviceSensorMap.has(s.host_ip)) deviceSensorMap.set(s.host_ip, [])
    deviceSensorMap.get(s.host_ip)!.push(s)
  }

  // 클러스터 요약 통계
  const totalDevices = devs?.length ?? 0
  const totalGpus    = new Set(
    (data?.sensors ?? []).filter(s => s.type === 'GPU' && s.sensor_name.endsWith('_utilization')).map(s => `${s.host_ip}:${s.sensor_name.split('_')[0]}`)
  ).size
  const downDevices  = (devs ?? []).filter(d => {
    const ss = deviceSensorMap.get(d.host_ip) ?? []
    return ss.some(s => s.status === 'down')
  }).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
        <p className="text-sm text-ink-muted/60 mt-0.5">전체 센서 상태 요약</p>
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
                <span className="text-sm text-ink-muted w-20">{cfg.label}</span>
                <div className="flex-1 h-1.5 bg-surface-border/40 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${dot}`} style={{ width: `${pct}%` }} />
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
              <p className="text-xs text-ink-muted/60 mt-1">
                {c?.total ? `전체의 ${Math.round((count / c.total) * 100)}%` : '—'}
              </p>
            </div>
          )
        })}
      </div>

      {/* ── 클러스터 현황 ──────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink/85">Cluster Status</h2>
          {/* 요약 스탯 */}
          <div className="flex items-center gap-5 text-xs font-mono">
            <span className="text-ink-muted/60">
              장비 <span className="text-ink/70 font-semibold">{totalDevices}</span>
            </span>
            {totalGpus > 0 && (
              <span className="text-ink-muted/60">
                GPU <span className="text-ink/70 font-semibold">{totalGpus}</span>
              </span>
            )}
            <span className="text-ink-muted/60">
              센서 <span className="text-ink/70 font-semibold">{c?.total ?? 0}</span>
            </span>
            {downDevices > 0 && (
              <span className="text-red-400 font-semibold">
                ⚠ 장애 장비 {downDevices}대
              </span>
            )}
          </div>
        </div>

        <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
          {/* 컬럼 헤더 */}
          <div className="flex items-center gap-4 px-5 py-2 border-b border-surface-border/50 text-xs text-ink-muted/40 uppercase tracking-wider">
            <span className="w-44 flex-shrink-0">장비</span>
            <span className="flex-1">센서</span>
            <span className="w-36 flex-shrink-0 text-right">지표</span>
            <span className="w-24 flex-shrink-0 text-right">상태</span>
          </div>

          {!devs ? (
            <p className="text-xs text-ink-faint py-8 text-center">로딩 중...</p>
          ) : devs.length === 0 ? (
            <p className="text-xs text-ink-faint py-8 text-center">등록된 장비가 없습니다</p>
          ) : (
            devs.map(d => (
              <DeviceRow
                key={d.host_ip}
                device={d}
                sensors={deviceSensorMap.get(d.host_ip) ?? []}
              />
            ))
          )}
        </div>
      </div>

      <p className="text-xs text-ink-faint text-right">
        총 <span className="text-ink-muted">{c?.total ?? 0}</span>개 센서 · 30초마다 갱신
      </p>
    </div>
  )
}
