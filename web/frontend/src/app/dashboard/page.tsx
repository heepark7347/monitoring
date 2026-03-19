'use client'
import useSWR from 'swr'
import { fetcher, api } from '@/lib/api'
import type { DashboardSummary, SensorStatus, K8sNode, K8sNodesResponse, Device } from '@/lib/types'
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

// ── K8s Cluster Status ────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const isMaster = role === 'control-plane' || role === 'master'
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono font-semibold border ${
      isMaster
        ? 'text-violet-300 border-violet-500/40 bg-violet-900/20'
        : 'text-sky-300 border-sky-500/40 bg-sky-900/20'
    }`}>
      {isMaster ? '◈ Master' : '◇ Worker'}
    </span>
  )
}

function PressureBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono text-amber-300 border border-amber-500/40 bg-amber-900/15">
      ⚠ {label}
    </span>
  )
}

function NodeRow({ node }: { node: K8sNode }) {
  const isMaster = node.roles.some(r => r === 'control-plane' || r === 'master')
  const hasIssue = !node.ready || node.mem_pressure || node.disk_pressure || node.pid_pressure
  const memUsedPct = node.mem_allocatable_gb > 0
    ? ((node.mem_capacity_gb - node.mem_allocatable_gb) / node.mem_capacity_gb * 100)
    : null

  return (
    <div className={`flex items-center gap-4 px-5 py-3.5 border-b border-surface-border/30 last:border-0 ${
      hasIssue ? 'bg-red-950/10' : ''
    }`}>
      {/* 상태 dot + 노드명 + 역할 */}
      <div className="flex items-center gap-2.5 w-52 flex-shrink-0">
        <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${node.ready ? 'bg-emerald-400' : 'bg-red-400'}`} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink/85 truncate">{node.name}</p>
          <p className="text-xs text-ink-muted/50 font-mono">{node.internal_ip ?? '—'}</p>
        </div>
      </div>

      {/* 역할 배지 */}
      <div className="flex items-center gap-1.5 w-28 flex-shrink-0">
        {node.roles.map(r => <RoleBadge key={r} role={r} />)}
      </div>

      {/* 압박 상태 배지 */}
      <div className="flex-1 flex items-center gap-1.5 min-w-0">
        {node.unschedulable && !isMaster && (
          <PressureBadge label="Unschedulable" />
        )}
        {node.mem_pressure  && <PressureBadge label="MemPressure" />}
        {node.disk_pressure && <PressureBadge label="DiskPressure" />}
        {node.pid_pressure  && <PressureBadge label="PIDPressure" />}
        {!hasIssue && (
          <span className="text-xs text-ink-faint font-mono">—</span>
        )}
      </div>

      {/* 리소스 지표 */}
      <div className="flex items-center gap-5 flex-shrink-0 text-xs font-mono">
        <div className="text-right">
          <p className="text-ink-muted/40">CPU</p>
          <p className="text-ink/70 font-semibold">{node.cpu_allocatable}c</p>
        </div>
        <div className="text-right">
          <p className="text-ink-muted/40">MEM</p>
          <p className="text-ink/70 font-semibold">{node.mem_allocatable_gb.toFixed(1)}GB</p>
        </div>
        <div className="text-right">
          <p className="text-ink-muted/40">PODS</p>
          <p className={`font-semibold ${node.pods_running / node.pod_capacity > 0.8 ? 'text-amber-400' : 'text-ink/70'}`}>
            {node.pods_running}/{node.pod_capacity}
          </p>
        </div>
      </div>

      {/* Ready 상태 배지 */}
      <div className="w-20 flex-shrink-0 text-right">
        {node.ready ? (
          <span className="inline-block rounded-full bg-emerald-600/20 text-emerald-400 text-xs px-2 py-0.5 font-semibold font-mono">
            Ready
          </span>
        ) : (
          <span className="inline-block rounded-full bg-red-600/30 text-red-300 text-xs px-2 py-0.5 font-semibold font-mono">
            NotReady
          </span>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { data }       = useSWR<DashboardSummary>(api.dashboard.summary(), fetcher, { refreshInterval: 30000 })
  const { data: k8s }  = useSWR<K8sNodesResponse>(api.dashboard.k8sNodes(), fetcher, { refreshInterval: 30000 })
  const { data: devs } = useSWR<Device[]>(api.devices.list(), fetcher, { refreshInterval: 30000 })
  const c = data?.counts

  const nodes = k8s?.nodes ?? []
  const masterCount  = nodes.filter(n => n.roles.some(r => r === 'control-plane' || r === 'master')).length
  const workerCount  = nodes.length - masterCount
  const notReadyCount = nodes.filter(n => !n.ready).length
  const totalPods    = nodes.reduce((a, n) => a + n.pods_running, 0)

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
      <div className="grid grid-cols-4 gap-2">
        {LEGEND.map(({ status, dot }) => {
          const cfg   = STATUS_CFG[status]
          const count = c?.[status] ?? 0
          return (
            <div key={status} className={`rounded-lg border px-3 py-2 ${cfg.ring}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                <p className={`text-xs font-semibold uppercase tracking-widest ${cfg.color}`}>{cfg.label}</p>
              </div>
              <p className={`text-2xl font-bold font-mono ${cfg.color}`}>{count}</p>
              <p className="text-xs text-ink-muted/60 mt-0.5">
                {c?.total ? `${Math.round((count / c.total) * 100)}%` : '—'}
              </p>
            </div>
          )
        })}
      </div>

      {/* 센서 수 / 디바이스 수 요약 카드 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-surface-card border border-surface-border rounded-lg px-3 py-2 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-base flex-shrink-0">
            ◎
          </div>
          <div>
            <p className="text-xs text-ink-muted/50 uppercase tracking-widest font-mono">등록 센서</p>
            <p className="text-2xl font-bold font-mono text-ink leading-tight">{c?.total ?? '—'}</p>
            <p className="text-xs text-ink-muted/50 font-mono">
              UP {c?.up ?? 0} · DOWN {c?.down ?? 0} · WARN {c?.warning ?? 0}
            </p>
          </div>
        </div>
        <div className="bg-surface-card border border-surface-border rounded-lg px-3 py-2 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-base flex-shrink-0">
            ⬡
          </div>
          <div>
            <p className="text-xs text-ink-muted/50 uppercase tracking-widest font-mono">등록 디바이스</p>
            <p className="text-2xl font-bold font-mono text-ink leading-tight">{devs?.length ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* ── K8s Cluster Status ───────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink/85">Monitoring Cluster</h2>
          <div className="flex items-center gap-5 text-xs font-mono">
            <span className="text-ink-muted/60">
              Master <span className="text-violet-300 font-semibold">{masterCount}</span>
            </span>
            <span className="text-ink-muted/60">
              Worker <span className="text-sky-300 font-semibold">{workerCount}</span>
            </span>
            <span className="text-ink-muted/60">
              Pods <span className="text-ink/70 font-semibold">{totalPods}</span>
            </span>
            {notReadyCount > 0 && (
              <span className="text-red-400 font-semibold">
                ⚠ NotReady {notReadyCount}
              </span>
            )}
          </div>
        </div>

        <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
          {/* 컬럼 헤더 */}
          <div className="flex items-center gap-4 px-5 py-2 border-b border-surface-border/50 text-xs text-ink-muted/40 uppercase tracking-wider">
            <span className="w-52 flex-shrink-0">노드</span>
            <span className="w-28 flex-shrink-0">역할</span>
            <span className="flex-1">이슈</span>
            <span className="w-36 flex-shrink-0 text-right">리소스</span>
            <span className="w-20 flex-shrink-0 text-right">상태</span>
          </div>

          {!k8s ? (
            <p className="text-xs text-ink-faint py-8 text-center">로딩 중...</p>
          ) : nodes.length === 0 ? (
            <p className="text-xs text-ink-faint py-8 text-center">
              {k8s.error ? `오류: ${k8s.error}` : '노드 정보 없음'}
            </p>
          ) : (
            nodes.map(n => <NodeRow key={n.name} node={n} />)
          )}
        </div>

      </div>
    </div>
  )
}
