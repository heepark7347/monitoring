'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { fetcher, api } from '@/lib/api'
import type { DeviceDetail, DashboardSummary, Sensor, SensorStatus, TimeRange } from '@/lib/types'
import TimeRangePicker, { rangeToHours } from '@/components/ui/TimeRangePicker'
import GaugeChart from '@/components/charts/GaugeChart'
import LineChart from '@/components/charts/LineChart'
import DonutChart from '@/components/charts/DonutChart'
import MetricCard from '@/components/ui/MetricCard'

const STATUS_DOT: Record<SensorStatus, string> = {
  up:      'bg-emerald-400',
  down:    'bg-red-400',
  warning: 'bg-amber-400',
  pause:   'bg-slate-500',
}

function fmtBytes(b: number | null) {
  if (!b) return '—'
  if (b >= 1e12) return `${(b / 1e12).toFixed(1)} TB`
  if (b >= 1e9)  return `${(b / 1e9).toFixed(1)} GB`
  return `${(b / 1e6).toFixed(1)} MB`
}

function fmtRate(bps: number | null) {
  if (bps === null || bps === undefined) return '—'
  if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(2)} MB/s`
  if (bps >= 1024)        return `${(bps / 1024).toFixed(2)} kB/s`
  return `${bps.toFixed(2)} B/s`
}

function fmtUptime(sec: number | null) {
  if (!sec) return '—'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${d}d ${h}h ${m}m`
}

// MiB 또는 Bytes → GB 자동 변환 (1M 이상이면 bytes로 간주)
function mbToGb(raw: number): number {
  return raw > 1_000_000 ? raw / (1024 * 1024 * 1024) : raw / 1024
}

// ── GPU sensor detail ──────────────────────────────────────────
function GpuSensorDetail({ hostIp, sensorName, range, setRange }: {
  hostIp: string; sensorName: string; range: TimeRange; setRange: (r: TimeRange) => void
}) {
  const hours = rangeToHours(range)
  const parts  = sensorName.split('_', 2)
  const metric = parts[1] ?? ''

  const { data: history } = useSWR(
    api.gpu.sensorDetail(hostIp, sensorName, hours), fetcher, { refreshInterval: 60000 }
  )
  const latest = history?.[history.length - 1]

  if (metric === 'utilization') {
    const val = (latest?.gpu_utilization as number) ?? 0
    const series = [{
      name: 'Utilization', color: '#3b82f6',
      data: (history ?? []).map((h: Record<string, unknown>) => ({ t: new Date(h.collected_at as string), v: (h.gpu_utilization as number) ?? 0 })),
    }]
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-4">
          <MetricCard label="GPU Utilization" value={val.toFixed(1)} unit="%"
            accent={val >= 98 ? 'text-red-400' : val >= 90 ? 'text-amber-400' : 'text-emerald-400'} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col items-center gap-2">
            <p className="text-xs text-ink-muted/60 uppercase tracking-wider">Utilization</p>
            <GaugeChart value={val} unit="%" thresholds={[90, 98]} />
          </div>
          <div className="bg-surface-card border border-surface-border rounded-xl p-5">
            <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">History</p>
            <LineChart series={series} unit="%" yMin={0} yMax={100} />
          </div>
        </div>
      </div>
    )
  }

  if (metric === 'memory') {
    const usedMb = (latest?.memory_used_mb as number) ?? 0
    const freeMb = (latest?.memory_free_mb as number) ?? 0
    const totalMb = usedMb + freeMb
    const pct = totalMb > 0 ? (usedMb / totalMb) * 100 : 0
    const usedGb = usedMb / 1024
    const totalGb = totalMb / 1024
    const series = [{
      name: 'Memory Used (GB)', color: '#8b5cf6',
      data: (history ?? []).map((h: Record<string, unknown>) => ({
        t: new Date(h.collected_at as string),
        v: ((h.memory_used_mb as number) ?? 0) / 1024,
      })),
    }]
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-4">
          <MetricCard label="Memory Used" value={usedGb.toFixed(1)} unit=" GB"
            sub={totalGb > 0 ? `/ ${totalGb.toFixed(1)} GB (${pct.toFixed(1)}%)` : undefined} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col items-center gap-2">
            <p className="text-xs text-ink-muted/60 uppercase tracking-wider">Memory Usage</p>
            <GaugeChart value={pct} unit="%" thresholds={[85, 98]} />
            <p className="text-xs text-ink-muted/60">{usedGb.toFixed(1)} GB / {totalGb.toFixed(1)} GB</p>
          </div>
          <div className="bg-surface-card border border-surface-border rounded-xl p-5">
            <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">History (GB)</p>
            <LineChart series={series} unit=" GB" />
          </div>
        </div>
      </div>
    )
  }

  if (metric === 'temperature') {
    const val = (latest?.temperature_celsius as number) ?? 0
    const series = [{
      name: 'Temperature', color: '#f59e0b',
      data: (history ?? []).map((h: Record<string, unknown>) => ({ t: new Date(h.collected_at as string), v: (h.temperature_celsius as number) ?? 0 })),
    }]
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-4">
          <MetricCard label="Temperature" value={val.toFixed(1)} unit="°C"
            accent={val >= 90 ? 'text-red-400' : val >= 80 ? 'text-amber-400' : 'text-emerald-400'} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col items-center gap-2">
            <p className="text-xs text-ink-muted/60 uppercase tracking-wider">Temperature</p>
            <GaugeChart value={val} unit="°C" max={100} thresholds={[80, 90]} />
          </div>
          <div className="bg-surface-card border border-surface-border rounded-xl p-5">
            <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">History</p>
            <LineChart series={series} unit="°C" />
          </div>
        </div>
      </div>
    )
  }

  if (metric === 'power') {
    const val = (latest?.power_usage_watts as number) ?? 0
    const series = [{
      name: 'Power', color: '#10b981',
      data: (history ?? []).map((h: Record<string, unknown>) => ({ t: new Date(h.collected_at as string), v: (h.power_usage_watts as number) ?? 0 })),
    }]
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-4">
          <MetricCard label="Power Usage" value={val.toFixed(1)} unit=" W" />
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">Power History</p>
          <LineChart series={series} unit=" W" />
        </div>
      </div>
    )
  }

  if (metric === 'health') {
    const xid  = (latest?.xid_errors as number) ?? 0
    const sbe  = (latest?.ecc_sbe as number) ?? 0
    const dbe  = (latest?.ecc_dbe as number) ?? 0
    const pcie = (latest?.pcie_replay as number) ?? 0
    const pwrV = (latest?.power_violation as number) ?? 0
    const thrV = (latest?.thermal_violation as number) ?? 0
    const xidSeries = [{
      name: 'XID Errors', color: '#ef4444',
      data: (history ?? []).map((h: Record<string, unknown>) => ({ t: new Date(h.collected_at as string), v: (h.xid_errors as number) ?? 0 })),
    }]
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-4">
          <div className={`bg-surface-card border rounded-xl p-5 ${xid > 0 ? 'border-red-500/40' : 'border-surface-border'}`}>
            <p className="text-xs text-ink-muted/60">XID Errors</p>
            <p className={`text-3xl font-bold font-mono mt-2 ${xid > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{xid}</p>
          </div>
          <div className={`bg-surface-card border rounded-xl p-5 ${dbe > 0 ? 'border-red-500/40' : sbe > 0 ? 'border-amber-500/40' : 'border-surface-border'}`}>
            <p className="text-xs text-ink-muted/60">ECC SBE / DBE</p>
            <p className={`text-3xl font-bold font-mono mt-2 ${dbe > 0 ? 'text-red-400' : sbe > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{sbe} / {dbe}</p>
          </div>
          <div className="bg-surface-card border border-surface-border rounded-xl p-5">
            <p className="text-xs text-ink-muted/60">PCIe Replay / Throttle</p>
            <p className="text-3xl font-bold font-mono mt-2 text-ink">{pcie}</p>
            <p className="text-xs text-ink-muted/60 mt-1">Pwr Violation: {pwrV} · Therm: {thrV}</p>
          </div>
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">XID Error History</p>
          <LineChart series={xidSeries} unit="" />
        </div>
      </div>
    )
  }

  if (metric === 'clock') {
    const sm  = (latest?.sm_clock_mhz as number) ?? 0
    const mem = (latest?.mem_clock_mhz as number) ?? 0
    const series = [
      { name: 'SM Clock', color: '#3b82f6',  data: (history ?? []).map((h: Record<string, unknown>) => ({ t: new Date(h.collected_at as string), v: (h.sm_clock_mhz as number) ?? 0 })) },
      { name: 'MEM Clock', color: '#8b5cf6', data: (history ?? []).map((h: Record<string, unknown>) => ({ t: new Date(h.collected_at as string), v: (h.mem_clock_mhz as number) ?? 0 })) },
    ]
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <MetricCard label="SM Clock"  value={String(Math.round(sm))}  unit=" MHz" />
          <MetricCard label="MEM Clock" value={String(Math.round(mem))} unit=" MHz" />
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">Clock History</p>
          <LineChart series={series} unit=" MHz" />
        </div>
      </div>
    )
  }

  return <p className="text-ink-muted/60 text-sm">Unknown GPU metric: {metric}</p>
}

// ── GPU 인덱스 전체 현황 (클릭시 보이는 페이지) ──────────────────
function GpuIndexOverview({ hostIp, gpuIdx, range, setRange }: {
  hostIp: string; gpuIdx: number; range: TimeRange; setRange: (r: TimeRange) => void
}) {
  const hours = rangeToHours(range)
  const { data: latest }  = useSWR(api.gpu.latest(), fetcher, { refreshInterval: 60000 })
  const { data: history } = useSWR(api.gpu.history(hours, gpuIdx, hostIp), fetcher, { refreshInterval: 60000 })

  const gpu = (latest as Record<string, unknown>[] | undefined)
    ?.find((g) => g.host_ip === hostIp && g.gpu_index === gpuIdx) as Record<string, number | string | null> | undefined

  const hist = (history as Record<string, unknown>[] ?? [])

  const memUsedRaw  = (gpu?.memory_used_mb  as number) ?? 0
  const memFreeRaw  = (gpu?.memory_free_mb  as number) ?? 0
  const memTotalRaw = memUsedRaw + memFreeRaw
  const memPct      = memTotalRaw > 0 ? (memUsedRaw / memTotalRaw) * 100 : 0
  const memUsedMb   = memUsedRaw  // keep alias for series
  const memUsedGb   = mbToGb(memUsedRaw)
  const memTotalGb  = mbToGb(memTotalRaw)
  const memScale    = memUsedRaw > 1_000_000 ? 1/(1024*1024*1024) : 1/1024
  const utilPct    = (gpu?.gpu_utilization   as number) ?? 0
  const tempC      = (gpu?.temperature_celsius as number) ?? 0
  const powerW     = (gpu?.power_usage_watts as number) ?? 0
  const smMhz      = (gpu?.sm_clock_mhz     as number) ?? 0
  const memMhz     = (gpu?.mem_clock_mhz    as number) ?? 0
  const xid        = (gpu?.xid_errors       as number) ?? 0
  const sbe        = (gpu?.ecc_sbe          as number) ?? 0
  const dbe        = (gpu?.ecc_dbe          as number) ?? 0
  const pcie       = (gpu?.pcie_replay      as number) ?? 0

  const hasError = xid > 0 || dbe > 0

  const mkSeries = (key: string, name: string, color: string, scale = 1) => [{
    name, color,
    data: hist.map((h) => ({ t: new Date(h.collected_at as string), v: ((h[key] as number) ?? 0) * scale })),
  }]

  return (
    <div className="space-y-5">
      {hasError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-900/30 px-5 py-4">
          <span className="text-red-400 text-lg mt-0.5">⚠</span>
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-red-300">GPU 오류 감지됨</p>
            {xid > 0 && <p className="text-red-200">XID Error: <span className="font-mono font-bold">{xid}</span></p>}
            {dbe > 0 && <p className="text-red-200">ECC DBE: <span className="font-mono font-bold">{dbe}</span> — 메모리 교체 권장</p>}
            {sbe > 0 && !dbe && <p className="text-amber-300">ECC SBE: <span className="font-mono font-bold">{sbe}</span></p>}
          </div>
        </div>
      )}

      {/* 현재값 요약 카드 */}
      <div className="grid grid-cols-5 gap-4">
        <MetricCard label="GPU Util"    value={utilPct.toFixed(1)} unit="%"
          accent={utilPct >= 98 ? 'text-red-400' : utilPct >= 90 ? 'text-amber-400' : 'text-emerald-400'} />
        <MetricCard label="Memory Used" value={memUsedGb.toFixed(1)} unit=" GB"
          sub={`/ ${memTotalGb.toFixed(1)} GB (${memPct.toFixed(1)}%)`}
          accent={memPct >= 98 ? 'text-red-400' : memPct >= 85 ? 'text-amber-400' : 'text-emerald-400'} />
        <MetricCard label="Temperature" value={tempC.toFixed(1)}   unit="°C"
          accent={tempC >= 90 ? 'text-red-400' : tempC >= 80 ? 'text-amber-400' : 'text-emerald-400'} />
        <MetricCard label="Power"       value={powerW.toFixed(1)}  unit=" W" />
        <MetricCard label="Model"       value={gpu?.model_name as string ?? '—'} />
      </div>

      {/* Gauges: Util + Memory */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col items-center gap-2">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider">GPU Utilization</p>
          <GaugeChart value={utilPct} unit="%" thresholds={[90, 98]} />
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col items-center gap-2">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider">Memory Usage</p>
          <GaugeChart value={memPct} unit="%" thresholds={[85, 98]} />
          <p className="text-xs text-ink-muted/60">{memUsedGb.toFixed(1)} GB / {memTotalGb.toFixed(1)} GB</p>
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-5 space-y-4">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider">Clock Speeds</p>
          <div>
            <p className="text-xs text-ink-muted/60">SM Clock</p>
            <p className="text-xl font-bold font-mono text-ink">{smMhz ? Math.round(smMhz) : '—'}<span className="text-sm font-normal text-ink-muted ml-1">MHz</span></p>
          </div>
          <div>
            <p className="text-xs text-ink-muted/60">MEM Clock</p>
            <p className="text-xl font-bold font-mono text-ink">{memMhz ? Math.round(memMhz) : '—'}<span className="text-sm font-normal text-ink-muted ml-1">MHz</span></p>
          </div>
        </div>
      </div>

      {/* Health counters */}
      <div className="bg-surface-card border border-surface-border rounded-xl p-5">
        <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-4">GPU Health</p>
        <div className="grid grid-cols-4 gap-4">
          <div className={`rounded-lg px-4 py-3 border ${xid > 0 ? 'bg-red-900/30 border-red-500/40' : 'bg-surface-card/50 border-surface-border/50'}`}>
            <p className="text-xs text-ink-muted/60">XID Errors</p>
            <p className={`text-2xl font-bold font-mono mt-1 ${xid > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{xid}</p>
          </div>
          <div className={`rounded-lg px-4 py-3 border ${dbe > 0 ? 'bg-red-900/30 border-red-500/40' : sbe > 0 ? 'bg-amber-900/30 border-amber-500/40' : 'bg-surface-card/50 border-surface-border/50'}`}>
            <p className="text-xs text-ink-muted/60">ECC SBE / DBE</p>
            <p className={`text-2xl font-bold font-mono mt-1 ${dbe > 0 ? 'text-red-400' : sbe > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{sbe} / {dbe}</p>
          </div>
          <div className="rounded-lg px-4 py-3 border bg-surface-card/50 border-surface-border/50">
            <p className="text-xs text-ink-muted/60">PCIe Replay</p>
            <p className="text-2xl font-bold font-mono mt-1 text-ink">{pcie}</p>
          </div>
          <div className="rounded-lg px-4 py-3 border bg-surface-card/50 border-surface-border/50">
            <p className="text-xs text-ink-muted/60">Temperature</p>
            <p className={`text-2xl font-bold font-mono mt-1 ${tempC >= 90 ? 'text-red-400' : tempC >= 80 ? 'text-amber-400' : 'text-ink'}`}>{tempC.toFixed(1)}°C</p>
          </div>
        </div>
      </div>

      {/* Line charts grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">GPU Utilization</p>
          <LineChart series={mkSeries('gpu_utilization', 'Util %', '#3b82f6')} unit="%" yMin={0} yMax={100} />
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">Memory Used</p>
          <LineChart series={mkSeries('memory_used_mb', 'Mem GB', '#8b5cf6', memScale)} unit=" GB" />
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">Temperature</p>
          <LineChart series={mkSeries('temperature_celsius', 'Temp °C', '#f59e0b')} unit="°C" />
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">Power Usage</p>
          <LineChart series={mkSeries('power_usage_watts', 'Power W', '#10b981')} unit=" W" />
        </div>
      </div>
    </div>
  )
}

// ── Disk sensor detail ─────────────────────────────────────────
function DiskSensorDetail({ hostIp, sensorName, range, setRange }: {
  hostIp: string; sensorName: string; range: TimeRange; setRange: (r: TimeRange) => void
}) {
  const hours = rangeToHours(range)
  const { data: latest }  = useSWR(api.disk.latest(), fetcher, { refreshInterval: 60000 })
  const { data: history } = useSWR(api.disk.history(hours, sensorName), fetcher, { refreshInterval: 60000 })

  const disk = (latest as Record<string, unknown>[] | undefined)?.find(
    (d) => d.host_ip === hostIp && d.mountpoint === sensorName
  ) as Record<string, number | string | null> | undefined

  const totalBytes = (disk?.total_bytes as number) ?? 0
  const availBytes = (disk?.avail_bytes as number) ?? 0
  const usedBytes  = totalBytes - availBytes
  const pct        = (disk?.usage_percent as number) ?? 0

  const series = [{
    name: 'Usage %', color: pct >= 95 ? '#ef4444' : pct >= 85 ? '#f59e0b' : '#10b981',
    data: (history as Record<string, unknown>[] ?? [])
      .filter((h) => h.host_ip === hostIp)
      .map((h) => ({ t: new Date(h.collected_at as string), v: (h.usage_percent as number) ?? 0 })),
  }]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Usage"       value={pct.toFixed(1)}       unit="%"   accent={pct >= 95 ? 'text-red-400' : pct >= 85 ? 'text-amber-400' : 'text-emerald-400'} />
        <MetricCard label="Used"        value={fmtBytes(usedBytes)}              />
        <MetricCard label="Total"       value={fmtBytes(totalBytes)}             />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col items-center gap-2">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider">{disk?.device as string ?? sensorName}</p>
          <DonutChart used={usedBytes} total={totalBytes} size={180} />
          <p className="text-xs text-ink-muted/60">{fmtBytes(availBytes)} free</p>
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">Usage History</p>
          <LineChart series={series} unit="%" yMin={0} yMax={100} />
        </div>
      </div>
      {disk && (
        <div className="bg-surface-card border border-surface-border rounded-xl p-4 grid grid-cols-3 gap-4 text-sm">
          <div><p className="text-xs text-ink-muted/60">Filesystem</p><p className="font-mono text-ink/85">{disk.fstype as string}</p></div>
          <div><p className="text-xs text-ink-muted/60">Device</p><p className="font-mono text-ink/85">{disk.device as string}</p></div>
          <div><p className="text-xs text-ink-muted/60">Available</p><p className="font-mono text-ink/85">{fmtBytes(availBytes)}</p></div>
        </div>
      )}
    </div>
  )
}

// ── Network sensor detail ──────────────────────────────────────
function NetworkSensorDetail({ hostIp, sensorName, range, setRange }: {
  hostIp: string; sensorName: string; range: TimeRange; setRange: (r: TimeRange) => void
}) {
  const hours = rangeToHours(range)
  const { data: latest }  = useSWR(api.network.latest(), fetcher, { refreshInterval: 60000 })
  const { data: history } = useSWR(api.network.history(hours, sensorName), fetcher, { refreshInterval: 60000 })

  const iface = (latest as Record<string, unknown>[] | undefined)?.find(
    (i) => i.host_ip === hostIp && i.if_descr === sensorName
  ) as Record<string, number | string | null> | undefined

  const inRate   = (iface?.if_in_octets_rate  as number) ?? 0
  const outRate  = (iface?.if_out_octets_rate as number) ?? 0
  const totalRate = inRate + outRate
  const isUp     = (iface?.if_oper_status as number) === 1

  const filteredHist = (history as Record<string, unknown>[] ?? [])
    .filter((h) => h.if_descr === sensorName)

  const traffSeries = [
    { name: 'In',  color: '#3b82f6', data: filteredHist.map((h) => ({ t: new Date(h.collected_at as string), v: (h.if_in_octets_rate  as number) ?? 0 })) },
    { name: 'Out', color: '#10b981', data: filteredHist.map((h) => ({ t: new Date(h.collected_at as string), v: (h.if_out_octets_rate as number) ?? 0 })) },
    { name: 'Total', color: '#f59e0b', data: filteredHist.map((h) => ({ t: new Date(h.collected_at as string), v: ((h.if_in_octets_rate as number) ?? 0) + ((h.if_out_octets_rate as number) ?? 0) })) },
  ]
  const errSeries = [
    { name: 'RX Err', color: '#ef4444', data: filteredHist.map((h) => ({ t: new Date(h.collected_at as string), v: (h.if_in_errors_rate  as number) ?? 0 })) },
    { name: 'TX Err', color: '#f59e0b', data: filteredHist.map((h) => ({ t: new Date(h.collected_at as string), v: (h.if_out_errors_rate as number) ?? 0 })) },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-ink-muted/60">Link Status</p>
          <p className={`text-2xl font-bold font-mono mt-2 ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>{isUp ? 'UP' : 'DOWN'}</p>
          {iface?.if_speed_mbps != null && <p className="text-xs text-ink-muted/60 mt-1">{iface.if_speed_mbps} Mbps</p>}
        </div>
        <MetricCard label="In (RX)"    value={fmtRate(inRate)}    />
        <MetricCard label="Out (TX)"   value={fmtRate(outRate)}   />
        <MetricCard label="Total"      value={fmtRate(totalRate)} />
      </div>
      <div className="bg-surface-card border border-surface-border rounded-xl p-5">
        <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">Traffic — In / Out / Total (B/s)</p>
        <LineChart series={traffSeries} unit=" B/s" />
      </div>
      <div className="bg-surface-card border border-surface-border rounded-xl p-5">
        <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">Error Rate (pps)</p>
        <LineChart series={errSeries} unit=" pps" />
      </div>
    </div>
  )
}

// ── Node sensor detail ─────────────────────────────────────────
function NodeSensorDetail({ hostIp, sensorName, range, setRange }: {
  hostIp: string; sensorName: string; range: TimeRange; setRange: (r: TimeRange) => void
}) {
  const hours = rangeToHours(range)
  const { data: latest }  = useSWR(api.node.latest(), fetcher, { refreshInterval: 60000 })
  const { data: history } = useSWR(api.node.history(hours), fetcher, { refreshInterval: 60000 })

  const node = (latest as Record<string, unknown>[] | undefined)?.find(
    (n) => n.host_ip === hostIp
  ) as Record<string, number | string | null> | undefined

  const cpuPct   = (node?.cpu_usage_percent   as number) ?? 0
  const memPct   = (node?.memory_usage_percent as number) ?? 0
  const uptimeSec = node?.uptime_seconds as number | null

  const filteredHist = (history as Record<string, unknown>[] ?? [])
    .filter((h) => h.host_ip === hostIp)

  const cpuSeries = [{ name: 'CPU %', color: '#3b82f6',
    data: filteredHist.map((h) => ({ t: new Date(h.collected_at as string), v: (h.cpu_usage_percent as number) ?? 0 })) }]
  const memSeries = [{ name: 'Memory %', color: '#8b5cf6',
    data: filteredHist.map((h) => ({ t: new Date(h.collected_at as string), v: (h.memory_usage_percent as number) ?? 0 })) }]
  const loadSeries = [
    { name: '1m',  color: '#3b82f6', data: filteredHist.map((h) => ({ t: new Date(h.collected_at as string), v: (h.load_1m  as number) ?? 0 })) },
    { name: '5m',  color: '#10b981', data: filteredHist.map((h) => ({ t: new Date(h.collected_at as string), v: (h.load_5m  as number) ?? 0 })) },
    { name: '15m', color: '#f59e0b', data: filteredHist.map((h) => ({ t: new Date(h.collected_at as string), v: (h.load_15m as number) ?? 0 })) },
  ]

  // CPU 서브타입
  if (sensorName === 'cpu') return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="CPU Usage" value={cpuPct.toFixed(1)} unit="%"
          accent={cpuPct >= 95 ? 'text-red-400' : cpuPct >= 80 ? 'text-amber-400' : 'text-emerald-400'} />
        <MetricCard label="Load 1m"  value={(node?.load_1m  as number)?.toFixed(2) ?? null} />
        <MetricCard label="Load 5m"  value={(node?.load_5m  as number)?.toFixed(2) ?? null} />
      </div>
      <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col items-center gap-2">
        <p className="text-xs text-ink-muted/60 uppercase tracking-wider">CPU Utilization</p>
        <GaugeChart value={cpuPct} unit="%" thresholds={[80, 95]} />
      </div>
      <div className="bg-surface-card border border-surface-border rounded-xl p-5">
        <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">CPU History</p>
        <LineChart series={cpuSeries} unit="%" yMin={0} yMax={100} />
      </div>
      <div className="bg-surface-card border border-surface-border rounded-xl p-5">
        <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">Load Average</p>
        <LineChart series={loadSeries} unit="" />
      </div>
    </div>
  )

  // Memory 서브타입
  if (sensorName === 'memory') return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Memory Usage" value={memPct.toFixed(1)} unit="%"
          accent={memPct >= 95 ? 'text-red-400' : memPct >= 80 ? 'text-amber-400' : 'text-emerald-400'} />
        <MetricCard label="Total"    value={fmtBytes(node?.memory_total_bytes     as number)} />
        <MetricCard label="Available" value={fmtBytes(node?.memory_available_bytes as number)} />
      </div>
      <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col items-center gap-2">
        <p className="text-xs text-ink-muted/60 uppercase tracking-wider">Memory Usage</p>
        <GaugeChart value={memPct} unit="%" thresholds={[80, 95]} />
      </div>
      <div className="bg-surface-card border border-surface-border rounded-xl p-5">
        <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">Memory History</p>
        <LineChart series={memSeries} unit="%" yMin={0} yMax={100} />
      </div>
    </div>
  )

  // Uptime 서브타입
  if (sensorName === 'uptime') return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <MetricCard label="Uptime"    value={fmtUptime(uptimeSec)} />
        <MetricCard label="Uptime (s)" value={uptimeSec ? Math.round(uptimeSec).toString() : null} unit=" s" />
      </div>
    </div>
  )

  // legacy 'system' — 전체 표시
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="CPU Usage"  value={cpuPct.toFixed(1)} unit="%"
          accent={cpuPct >= 95 ? 'text-red-400' : cpuPct >= 80 ? 'text-amber-400' : 'text-emerald-400'} />
        <MetricCard label="Memory"     value={memPct.toFixed(1)} unit="%"
          accent={memPct >= 95 ? 'text-red-400' : memPct >= 80 ? 'text-amber-400' : 'text-emerald-400'} />
        <MetricCard label="Mem Total"  value={fmtBytes(node?.memory_total_bytes as number)} />
        <MetricCard label="Uptime"     value={fmtUptime(uptimeSec)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col items-center gap-2">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider">CPU Usage</p>
          <GaugeChart value={cpuPct} unit="%" thresholds={[80, 95]} />
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col items-center gap-2">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider">Memory Usage</p>
          <GaugeChart value={memPct} unit="%" thresholds={[80, 95]} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">CPU History</p>
          <LineChart series={cpuSeries} unit="%" yMin={0} yMax={100} />
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">Memory History</p>
          <LineChart series={memSeries} unit="%" yMin={0} yMax={100} />
        </div>
      </div>
      <div className="bg-surface-card border border-surface-border rounded-xl p-5">
        <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">Load Average</p>
        <LineChart series={loadSeries} unit="" />
      </div>
    </div>
  )
}

// ── Connectivity sensor detail ─────────────────────────────────
function ConnSensorDetail({ hostIp, sensorType, sensorName, range, setRange }: {
  hostIp: string; sensorType: string; sensorName: string; range: TimeRange; setRange: (r: TimeRange) => void
}) {
  const hours = rangeToHours(range)
  const { data: history } = useSWR(
    api.dashboard.connectivityHistory(hostIp, sensorType, sensorName, hours),
    fetcher, { refreshInterval: 30000 }
  )

  const latest  = (history as Record<string, unknown>[] | undefined)?.[
    ((history as unknown[]) ?? []).length - 1
  ] as Record<string, unknown> | undefined

  const reachable = latest?.is_reachable as boolean | undefined
  const latency   = latest?.latency_ms as number | undefined
  const errMsg    = latest?.error_msg as string | undefined

  const latencySeries = [{
    name: 'Latency (ms)', color: '#3b82f6',
    data: (history as Record<string, unknown>[] ?? [])
      .filter((h) => h.is_reachable)
      .map((h) => ({ t: new Date(h.collected_at as string), v: (h.latency_ms as number) ?? 0 })),
  }]
  const upSeries = [{
    name: 'Reachable', color: '#10b981',
    data: (history as Record<string, unknown>[] ?? []).map((h) => ({
      t: new Date(h.collected_at as string), v: h.is_reachable ? 1 : 0,
    })),
  }]

  const upCount   = (history as Record<string, unknown>[] ?? []).filter((h) => h.is_reachable).length
  const totalCnt  = (history as unknown[] ?? []).length
  const upPct     = totalCnt > 0 ? ((upCount / totalCnt) * 100).toFixed(1) : '—'
  const label     = sensorType === 'icmp' ? 'ICMP Ping' : `TCP:${sensorName}`

  const packetLoss = latest?.packet_loss_pct as number | undefined

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <div className={`bg-surface-card border rounded-xl p-5 ${reachable === false ? 'border-red-500/40' : reachable ? 'border-emerald-500/20' : 'border-surface-border'}`}>
          <p className="text-xs text-ink-muted/60">{label}</p>
          <p className={`text-3xl font-bold font-mono mt-2 ${reachable === false ? 'text-red-400' : reachable ? 'text-emerald-400' : 'text-ink-muted'}`}>
            {reachable === undefined ? '—' : reachable ? 'UP' : 'DOWN'}
          </p>
          {errMsg && <p className="text-xs text-red-400/80 mt-1 truncate">{errMsg}</p>}
        </div>
        <MetricCard label="Latency (avg)" value={latency != null ? latency.toFixed(1) : null} unit=" ms" />
        <MetricCard
          label="Packet Loss"
          value={packetLoss != null ? packetLoss.toFixed(0) : null}
          unit="%"
          accent={packetLoss != null && packetLoss > 0 ? (packetLoss >= 50 ? 'text-red-400' : 'text-amber-400') : 'text-emerald-400'}
        />
        <MetricCard label={`Uptime (${hours}h)`} value={upPct} unit="%" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">Latency (ms)</p>
          <LineChart series={latencySeries} unit=" ms" />
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">Packet Loss (%)</p>
          <LineChart series={[{
            name: 'Packet Loss', color: '#ef4444',
            data: (history as Record<string, unknown>[] ?? [])
              .map((h) => ({ t: new Date(h.collected_at as string), v: (h.packet_loss_pct as number) ?? 0 })),
          }]} unit="%" yMin={0} yMax={100} />
        </div>
      </div>
      <div className="bg-surface-card border border-surface-border rounded-xl p-5">
        <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">Reachability (1=up, 0=down)</p>
        <LineChart series={upSeries} unit="" yMin={0} yMax={1} />
      </div>
    </div>
  )
}

// ── 메인 페이지 ────────────────────────────────────────────────
export default function SensorDetailPage() {
  const params     = useParams()
  const deviceId   = Number(params.id)
  const sensorType = params.type as string
  const sensorName = decodeURIComponent(params.name as string)
  const [range, setRange] = useState<TimeRange>('1H')

  const { data: device }  = useSWR<DeviceDetail>(api.devices.byId(deviceId), fetcher)
  const { data: summary } = useSWR<DashboardSummary>(api.dashboard.summary(), fetcher, { refreshInterval: 30000 })

  const hostIp = device?.host_ip ?? ''
  const sensor = summary?.sensors?.find(
    (s: Sensor) => s.host_ip === hostIp &&
      (s.type.toLowerCase() === sensorType || s.type === sensorType) &&
      s.sensor_name === sensorName
  )

  const status = (sensor?.status ?? 'up') as SensorStatus
  const deviceLabel = device?.display_name || hostIp

  const TYPE_LABEL: Record<string, string> = {
    gpu: 'GPU', node: 'System', disk: 'Disk', network: 'Network', icmp: 'ICMP', port: 'Port',
  }

  function renderContent() {
    if (!hostIp) return <p className="text-ink-muted/60 text-sm">Loading...</p>
    if (sensorType === 'gpu') {
      if (/^\d+$/.test(sensorName)) {
        return <GpuIndexOverview hostIp={hostIp} gpuIdx={Number(sensorName)} range={range} setRange={setRange} />
      }
      return <GpuSensorDetail hostIp={hostIp} sensorName={sensorName} range={range} setRange={setRange} />
    }
    if (sensorType === 'disk')
      return <DiskSensorDetail hostIp={hostIp} sensorName={sensorName} range={range} setRange={setRange} />
    if (sensorType === 'network')
      return <NetworkSensorDetail hostIp={hostIp} sensorName={sensorName} range={range} setRange={setRange} />
    if (sensorType === 'node')
      return <NodeSensorDetail hostIp={hostIp} sensorName={sensorName} range={range} setRange={setRange} />
    if (sensorType === 'icmp' || sensorType === 'port')
      return <ConnSensorDetail hostIp={hostIp} sensorType={sensorType} sensorName={sensorName} range={range} setRange={setRange} />
    return <p className="text-ink-muted/60 text-sm">Unknown sensor type: {sensorType}</p>
  }

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-ink-muted/60">
        <Link href="/devices" className="hover:text-ink/70 transition-colors">Devices</Link>
        <span>/</span>
        <Link href={`/devices/${deviceId}`} className="hover:text-ink/70 transition-colors font-mono">{deviceLabel}</Link>
        <span>/</span>
        <span className="text-ink-muted/40">{TYPE_LABEL[sensorType] ?? sensorType}</span>
        <span>/</span>
        <span className="text-ink/85 font-mono">{sensorName}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${STATUS_DOT[status]}`} />
          <div>
            <h1 className="text-xl font-semibold text-ink">
              {sensorType === 'gpu' && /^\d+$/.test(sensorName)
                ? `GPU ${sensorName}`
                : sensor?.name ?? `${TYPE_LABEL[sensorType] ?? sensorType} · ${sensorName}`}
            </h1>
            <p className="text-sm text-ink-muted/60 font-mono mt-0.5">{hostIp}</p>
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold font-mono ${
            status === 'down'    ? 'bg-red-600/30 text-red-300' :
            status === 'warning' ? 'bg-amber-600/30 text-amber-300' :
            status === 'pause'   ? 'bg-slate-600/30 text-slate-300' :
            'bg-emerald-600/20 text-emerald-400'
          }`}>{status.toUpperCase()}</span>
          {sensor?.detail && (
            <span className="text-xs text-ink-muted/60 font-mono">{sensor.detail}</span>
          )}
        </div>
        <TimeRangePicker value={range} onChange={setRange} />
      </div>

      {renderContent()}
    </div>
  )
}
