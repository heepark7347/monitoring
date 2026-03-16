'use client'
import useSWR from 'swr'
import { useState } from 'react'
import { fetcher, api } from '@/lib/api'
import type { NodeLatest, SnmpSystemLatest, TimeRange } from '@/lib/types'
import MetricCard from '@/components/ui/MetricCard'
import TimeRangePicker, { rangeToHours } from '@/components/ui/TimeRangePicker'
import GaugeChart from '@/components/charts/GaugeChart'
import LineChart from '@/components/charts/LineChart'

function fmtUptime(sec: number | null) {
  if (!sec) return '—'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${d}d ${h}h ${m}m`
}

function fmtBytes(b: number | null) {
  if (!b) return '—'
  return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export default function SystemPage() {
  const [range, setRange] = useState<TimeRange>('1H')
  const hours = rangeToHours(range)

  const { data: node }   = useSWR<NodeLatest[]>(api.node.latest(),     fetcher, { refreshInterval: 60000 })
  const { data: snmp }   = useSWR<SnmpSystemLatest[]>(api.node.snmpLatest(), fetcher, { refreshInterval: 60000 })
  const { data: nodeHist } = useSWR(api.node.history(hours),     fetcher, { refreshInterval: 60000 })
  const { data: snmpHist } = useSWR(api.node.snmpHistory(hours), fetcher, { refreshInterval: 60000 })

  const n = node?.[0]
  const s = snmp?.[0]

  const memPct  = n?.memory_usage_percent ?? 0
  const cpuPct  = n?.cpu_usage_percent ?? s?.cpu_user_pct ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">System Status</h1>
          <p className="text-sm text-ink-muted/60 mt-0.5">
            Uptime: {fmtUptime(n?.uptime_seconds ?? s?.uptime_seconds ?? null)}
          </p>
        </div>
        <TimeRangePicker value={range} onChange={setRange} />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="CPU Usage"     value={cpuPct.toFixed(1)}   unit="%" />
        <MetricCard label="Memory Total"  value={fmtBytes(n?.memory_total_bytes ?? null)} />
        <MetricCard label="Memory Avail"  value={fmtBytes(n?.memory_available_bytes ?? null)} />
        <MetricCard label="Load Avg (1m)" value={n?.load_1m?.toFixed(2) ?? s?.load_1m?.toFixed(2) ?? null} />
      </div>

      {/* Gauges */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col items-center gap-2">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider">CPU Usage</p>
          <GaugeChart value={cpuPct} unit="%" />
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col items-center gap-2">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider">Memory Usage</p>
          <GaugeChart value={memPct} unit="%" thresholds={[75, 90]} />
          <p className="text-xs text-ink-muted/60">
            {fmtBytes(n?.memory_available_bytes ?? null)} free /
            {fmtBytes(n?.memory_total_bytes ?? null)}
          </p>
        </div>
      </div>

      {/* SNMP memory breakdown */}
      {s && (
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-4">Memory Breakdown (SNMP)</p>
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total',   kb: s.mem_total_kb },
              { label: 'Avail',   kb: s.mem_avail_kb },
              { label: 'Buffer',  kb: s.mem_buffer_kb },
              { label: 'Cached',  kb: s.mem_cached_kb },
              { label: 'Swap Total', kb: s.mem_swap_total_kb },
              { label: 'Swap Avail', kb: s.mem_swap_avail_kb },
            ].map(({ label, kb }) => (
              <div key={label}>
                <p className="text-xs text-ink-muted/60">{label}</p>
                <p className="text-lg font-mono font-bold text-ink">
                  {kb ? `${(kb / 1024 / 1024).toFixed(1)}` : '—'}
                  <span className="text-xs text-ink-muted ml-1">GB</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Time series */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">CPU Usage</p>
          <LineChart
            series={[{
              name: 'CPU %', color: '#3b82f6',
              data: (nodeHist ?? []).map((r: any) => ({ t: new Date(r.collected_at), v: r.cpu_usage_percent ?? 0 })),
            }]}
            unit="%" yMin={0} yMax={100}
          />
        </div>

        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">Memory Usage</p>
          <LineChart
            series={[{
              name: 'Mem %', color: '#8b5cf6',
              data: (nodeHist ?? []).map((r: any) => ({ t: new Date(r.collected_at), v: r.memory_usage_percent ?? 0 })),
            }]}
            unit="%" yMin={0} yMax={100}
          />
        </div>

        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">Load Average</p>
          <LineChart
            series={[
              { name: '1m',  color: '#10b981', data: (nodeHist ?? []).map((r: any) => ({ t: new Date(r.collected_at), v: r.load_1m ?? 0 })) },
              { name: '5m',  color: '#f59e0b', data: (nodeHist ?? []).map((r: any) => ({ t: new Date(r.collected_at), v: r.load_5m ?? 0 })) },
              { name: '15m', color: '#ef4444', data: (nodeHist ?? []).map((r: any) => ({ t: new Date(r.collected_at), v: r.load_15m ?? 0 })) },
            ]}
          />
        </div>

        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">Network (Node Exporter)</p>
          <LineChart
            series={[
              { name: 'RX B/s', color: '#3b82f6', data: (nodeHist ?? []).map((r: any) => ({ t: new Date(r.collected_at), v: r.net_receive_bytes ?? 0 })) },
              { name: 'TX B/s', color: '#f59e0b', data: (nodeHist ?? []).map((r: any) => ({ t: new Date(r.collected_at), v: r.net_transmit_bytes ?? 0 })) },
            ]}
            unit=" B/s"
          />
        </div>
      </div>
    </div>
  )
}
