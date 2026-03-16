'use client'
import useSWR from 'swr'
import { useState } from 'react'
import { fetcher, api } from '@/lib/api'
import type { GpuLatest, GpuHistory, TimeRange } from '@/lib/types'
import MetricCard from '@/components/ui/MetricCard'
import TimeRangePicker, { rangeToHours } from '@/components/ui/TimeRangePicker'
import GaugeChart from '@/components/charts/GaugeChart'
import LineChart from '@/components/charts/LineChart'

const B_TO_GB = 1 / (1024 * 1024 * 1024)

function toSeries(history: GpuHistory[], key: keyof GpuHistory, color: string, name: string, scale = 1) {
  return [{
    name,
    color,
    data: history.map(h => ({ t: new Date(h.collected_at), v: ((h[key] as number) ?? 0) * scale })),
  }]
}

export default function GpuPage() {
  const [range, setRange] = useState<TimeRange>('1H')
  const hours = rangeToHours(range)

  const { data: latest }  = useSWR<GpuLatest[]>(api.gpu.latest(),           fetcher, { refreshInterval: 60000 })
  const { data: history } = useSWR<GpuHistory[]>(api.gpu.history(hours, 0), fetcher, { refreshInterval: 60000 })

  const gpu = latest?.[0]

  const memUsedGB  = (gpu?.memory_used_mb ?? 0) * B_TO_GB
  const memFreeGB  = (gpu?.memory_free_mb ?? 0) * B_TO_GB
  const memTotalGB = memUsedGB + memFreeGB
  const memPct     = memTotalGB > 0 ? (memUsedGB / memTotalGB) * 100 : 0

  const hasXid   = (gpu?.xid_errors ?? 0) > 0
  const hasDbe   = (gpu?.ecc_dbe ?? 0) > 0
  const hasSbe   = (gpu?.ecc_sbe ?? 0) > 0
  const hasError = hasXid || hasDbe

  return (
    <div className="space-y-6">
      {hasError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-900/30 px-5 py-4">
          <span className="mt-0.5 text-red-400 text-lg">&#9888;</span>
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-red-300">GPU 오류 감지됨</p>
            {hasXid && <p className="text-red-200">XID Error: <span className="font-mono font-bold">{gpu?.xid_errors}</span></p>}
            {hasDbe && <p className="text-red-200">ECC DBE: <span className="font-mono font-bold">{gpu?.ecc_dbe}</span> — 메모리 교체 권장</p>}
            {hasSbe && !hasDbe && <p className="text-amber-300">ECC SBE: <span className="font-mono font-bold">{gpu?.ecc_sbe}</span></p>}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">GPU Health &amp; Utilization</h1>
          <p className="text-sm text-slate-500 mt-0.5">{gpu?.model_name ?? '—'}</p>
        </div>
        <TimeRangePicker value={range} onChange={setRange} />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="GPU Utilization" value={gpu?.gpu_utilization?.toFixed(1) ?? null} unit="%"
          accent={(gpu?.gpu_utilization ?? 0) >= 90 ? 'text-red-400' : (gpu?.gpu_utilization ?? 0) >= 70 ? 'text-amber-400' : 'text-emerald-400'} />
        <MetricCard label="Memory Used" value={memUsedGB.toFixed(1)} unit="GB"
          sub={memTotalGB > 0 ? `/ ${memTotalGB.toFixed(1)} GB (${memPct.toFixed(1)}%)` : undefined} />
        <MetricCard label="Temperature" value={gpu?.temperature_celsius?.toFixed(1) ?? null} unit="°C"
          accent={(gpu?.temperature_celsius ?? 0) >= 80 ? 'text-red-400' : 'text-slate-100'} />
        <MetricCard label="Power Usage" value={gpu?.power_usage_watts?.toFixed(1) ?? null} unit="W" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col items-center gap-2">
          <p className="text-xs text-slate-500 uppercase tracking-wider">GPU Utilization</p>
          <GaugeChart value={gpu?.gpu_utilization ?? 0} unit="%" />
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col items-center gap-2">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Memory Usage</p>
          <GaugeChart value={memPct} unit="%" thresholds={[75, 90]} />
          <p className="text-xs text-slate-500">{memUsedGB.toFixed(1)} GB / {memTotalGB.toFixed(1)} GB</p>
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-5 space-y-4">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Clock Speeds</p>
          <div>
            <p className="text-xs text-slate-500">SM Clock</p>
            <p className="text-xl font-bold font-mono text-slate-100">{gpu?.sm_clock_mhz ?? '—'}<span className="text-sm font-normal text-slate-400 ml-1">MHz</span></p>
          </div>
          <div>
            <p className="text-xs text-slate-500">MEM Clock</p>
            <p className="text-xl font-bold font-mono text-slate-100">{gpu?.mem_clock_mhz ?? '—'}<span className="text-sm font-normal text-slate-400 ml-1">MHz</span></p>
          </div>
          <div>
            <p className="text-xs text-slate-500">GPU UUID</p>
            <p className="text-xs font-mono text-slate-400 truncate mt-0.5">{gpu?.gpu_uuid ?? '—'}</p>
          </div>
        </div>
      </div>

      <div className="bg-surface-card border border-surface-border rounded-xl p-5">
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">GPU Health Status</p>
        <div className="grid grid-cols-3 gap-4">
          <div className={`rounded-lg px-4 py-3 border ${hasXid ? 'bg-red-900/30 border-red-500/40' : 'bg-slate-800/50 border-slate-700'}`}>
            <p className="text-xs text-slate-500">XID Errors</p>
            <p className={`text-2xl font-bold font-mono mt-1 ${hasXid ? 'text-red-400' : 'text-emerald-400'}`}>{gpu?.xid_errors ?? '—'}</p>
          </div>
          <div className={`rounded-lg px-4 py-3 border ${hasDbe ? 'bg-red-900/30 border-red-500/40' : hasSbe ? 'bg-amber-900/30 border-amber-500/40' : 'bg-slate-800/50 border-slate-700'}`}>
            <p className="text-xs text-slate-500">ECC SBE / DBE</p>
            <p className={`text-2xl font-bold font-mono mt-1 ${hasDbe ? 'text-red-400' : hasSbe ? 'text-amber-400' : 'text-emerald-400'}`}>{gpu?.ecc_sbe ?? '—'} / {gpu?.ecc_dbe ?? '—'}</p>
          </div>
          <div className="rounded-lg px-4 py-3 border bg-slate-800/50 border-slate-700">
            <p className="text-xs text-slate-500">PCIe Replay</p>
            <p className="text-2xl font-bold font-mono mt-1 text-slate-100">{gpu?.pcie_replay ?? '—'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">GPU Utilization</p>
          <LineChart series={toSeries(history ?? [], 'gpu_utilization', '#3b82f6', 'Util %')} unit="%" yMin={0} yMax={100} />
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Memory Used</p>
          <LineChart series={toSeries(history ?? [], 'memory_used_mb', '#8b5cf6', 'Mem GB', B_TO_GB)} unit=" GB" />
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Temperature</p>
          <LineChart series={toSeries(history ?? [], 'temperature_celsius', '#f59e0b', 'Temp °C')} unit="°C" />
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Power Usage</p>
          <LineChart series={toSeries(history ?? [], 'power_usage_watts', '#10b981', 'Power W')} unit=" W" />
        </div>
      </div>
    </div>
  )
}
