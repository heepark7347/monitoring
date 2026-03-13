'use client'
import useSWR from 'swr'
import { useState } from 'react'
import { fetcher, api } from '@/lib/api'
import type { GpuLatest, GpuHistory, TimeRange } from '@/lib/types'
import MetricCard from '@/components/ui/MetricCard'
import TimeRangePicker, { rangeToHours } from '@/components/ui/TimeRangePicker'
import GaugeChart from '@/components/charts/GaugeChart'
import LineChart from '@/components/charts/LineChart'

function toSeries(history: GpuHistory[], key: keyof GpuHistory, color: string, name: string) {
  return [{
    name,
    color,
    data: history.map(h => ({ t: new Date(h.collected_at), v: (h[key] as number) ?? 0 })),
  }]
}

export default function GpuPage() {
  const [range, setRange] = useState<TimeRange>('1H')
  const hours = rangeToHours(range)

  const { data: latest } = useSWR<GpuLatest[]>(api.gpu.latest(), fetcher, { refreshInterval: 60000 })
  const { data: history } = useSWR<GpuHistory[]>(api.gpu.history(hours, 0), fetcher, { refreshInterval: 60000 })

  const gpu = latest?.[0]

  const memTotal = (gpu?.memory_used_mb ?? 0) + (gpu?.memory_free_mb ?? 0)
  const memPct   = memTotal > 0 ? ((gpu?.memory_used_mb ?? 0) / memTotal) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">GPU Health &amp; Utilization</h1>
          <p className="text-sm text-slate-500 mt-0.5">{gpu?.model_name ?? '—'}</p>
        </div>
        <TimeRangePicker value={range} onChange={setRange} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          label="GPU Utilization"
          value={gpu?.gpu_utilization?.toFixed(1) ?? null}
          unit="%"
          accent={
            (gpu?.gpu_utilization ?? 0) >= 90 ? 'text-red-400' :
            (gpu?.gpu_utilization ?? 0) >= 70 ? 'text-amber-400' : 'text-emerald-400'
          }
        />
        <MetricCard
          label="Memory Used"
          value={gpu?.memory_used_mb ? `${(gpu.memory_used_mb / 1024).toFixed(1)}` : null}
          unit="GB"
          sub={memTotal > 0 ? `/ ${(memTotal / 1024).toFixed(1)} GB (${memPct.toFixed(1)}%)` : undefined}
        />
        <MetricCard
          label="Temperature"
          value={gpu?.temperature_celsius?.toFixed(1) ?? null}
          unit="°C"
          accent={(gpu?.temperature_celsius ?? 0) >= 80 ? 'text-red-400' : 'text-slate-100'}
        />
        <MetricCard
          label="Power Usage"
          value={gpu?.power_usage_watts?.toFixed(1) ?? null}
          unit="W"
        />
      </div>

      {/* Gauges + clocks */}
      <div className="grid grid-cols-3 gap-4">
        {/* GPU Utilization Gauge */}
        <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col items-center gap-2">
          <p className="text-xs text-slate-500 uppercase tracking-wider">GPU Utilization</p>
          <GaugeChart value={gpu?.gpu_utilization ?? 0} unit="%" />
        </div>

        {/* Memory Gauge */}
        <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col items-center gap-2">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Memory Usage</p>
          <GaugeChart value={memPct} unit="%" thresholds={[75, 90]} />
          <p className="text-xs text-slate-500">
            {gpu?.memory_used_mb ? `${(gpu.memory_used_mb / 1024).toFixed(1)}` : '—'} /
            {memTotal > 0 ? ` ${(memTotal / 1024).toFixed(1)} GB` : ' — GB'}
          </p>
        </div>

        {/* Clock speeds */}
        <div className="bg-surface-card border border-surface-border rounded-xl p-5 space-y-4">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Clock Speeds</p>
          <div>
            <p className="text-xs text-slate-500">SM Clock</p>
            <p className="text-xl font-bold font-mono text-slate-100">
              {gpu?.sm_clock_mhz ? `${gpu.sm_clock_mhz}` : '—'}
              <span className="text-sm font-normal text-slate-400 ml-1">MHz</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">MEM Clock</p>
            <p className="text-xl font-bold font-mono text-slate-100">
              {gpu?.mem_clock_mhz ? `${gpu.mem_clock_mhz}` : '—'}
              <span className="text-sm font-normal text-slate-400 ml-1">MHz</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">GPU UUID</p>
            <p className="text-xs font-mono text-slate-400 truncate mt-0.5">{gpu?.gpu_uuid ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* Time series charts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">GPU Utilization</p>
          <LineChart
            series={toSeries(history ?? [], 'gpu_utilization', '#3b82f6', 'Util')}
            unit="%" yMin={0} yMax={100}
          />
        </div>

        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Memory Used</p>
          <LineChart
            series={toSeries(history ?? [], 'memory_used_mb', '#8b5cf6', 'Mem Used')}
            unit=" MB"
          />
        </div>

        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Temperature</p>
          <LineChart
            series={toSeries(history ?? [], 'temperature_celsius', '#f59e0b', 'Temp')}
            unit="°C"
          />
        </div>

        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Power Usage</p>
          <LineChart
            series={toSeries(history ?? [], 'power_usage_watts', '#10b981', 'Power')}
            unit=" W"
          />
        </div>
      </div>
    </div>
  )
}
