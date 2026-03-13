'use client'
import useSWR from 'swr'
import { useState } from 'react'
import { fetcher, api } from '@/lib/api'
import type { DiskLatest, TimeRange } from '@/lib/types'
import TimeRangePicker, { rangeToHours } from '@/components/ui/TimeRangePicker'
import DonutChart from '@/components/charts/DonutChart'
import LineChart from '@/components/charts/LineChart'

function fmtBytes(b: number | null) {
  if (!b) return '—'
  if (b >= 1e12) return `${(b / 1e12).toFixed(1)} TB`
  if (b >= 1e9)  return `${(b / 1e9).toFixed(1)} GB`
  return `${(b / 1e6).toFixed(1)} MB`
}

export default function DiskPage() {
  const [range,      setRange]      = useState<TimeRange>('24H')
  const [mountpoint, setMountpoint] = useState('/')

  const hours = rangeToHours(range)

  const { data: latest }  = useSWR<DiskLatest[]>(api.disk.latest(),              fetcher, { refreshInterval: 60000 })
  const { data: history } = useSWR(api.disk.history(hours, mountpoint), fetcher, { refreshInterval: 60000 })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Disk Usage</h1>
          <p className="text-sm text-slate-500 mt-0.5">파티션별 스토리지 현황</p>
        </div>
        <TimeRangePicker value={range} onChange={setRange} />
      </div>

      {/* Partition cards */}
      <div className="grid grid-cols-3 gap-4">
        {(latest ?? []).map(d => (
          <button
            key={d.mountpoint}
            onClick={() => setMountpoint(d.mountpoint)}
            className={`bg-surface-card border rounded-xl p-5 flex items-center gap-5 transition-colors text-left ${
              mountpoint === d.mountpoint
                ? 'border-blue-500'
                : 'border-surface-border hover:border-slate-600'
            }`}
          >
            <DonutChart
              used={d.total_bytes! - (d.avail_bytes ?? 0)}
              total={d.total_bytes ?? 1}
              size={100}
            />
            <div className="flex-1 min-w-0">
              <p className="font-mono text-slate-200 text-sm truncate">{d.mountpoint}</p>
              <p className="text-xs text-slate-500 mt-0.5">{d.device} · {d.fstype}</p>
              <div className="mt-3 space-y-0.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Total</span>
                  <span className="font-mono text-slate-300">{fmtBytes(d.total_bytes)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Used</span>
                  <span className={`font-mono ${(d.usage_percent ?? 0) >= 90 ? 'text-red-400' : (d.usage_percent ?? 0) >= 70 ? 'text-amber-400' : 'text-slate-300'}`}>
                    {fmtBytes(d.total_bytes != null && d.avail_bytes != null ? d.total_bytes - d.avail_bytes : null)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Avail</span>
                  <span className="font-mono text-emerald-400">{fmtBytes(d.avail_bytes)}</span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* History chart */}
      <div className="bg-surface-card border border-surface-border rounded-xl p-5">
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">
          Usage History — <span className="font-mono text-slate-300">{mountpoint}</span>
        </p>
        <LineChart
          series={[{
            name: 'Usage %', color: '#3b82f6',
            data: (history ?? []).map((r: any) => ({ t: new Date(r.collected_at), v: r.usage_percent ?? 0 })),
          }]}
          unit="%" yMin={0} yMax={100} height={200}
        />
      </div>

      {/* Summary table */}
      <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-border">
          <p className="text-xs text-slate-500 uppercase tracking-wider">전체 파티션 요약</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-surface-border">
              <th className="text-left px-5 py-2">Mountpoint</th>
              <th className="text-left px-4 py-2">Device</th>
              <th className="text-left px-4 py-2">FS</th>
              <th className="text-right px-4 py-2">Total</th>
              <th className="text-right px-4 py-2">Used</th>
              <th className="text-right px-4 py-2">Avail</th>
              <th className="text-right px-5 py-2">Usage</th>
            </tr>
          </thead>
          <tbody>
            {(latest ?? []).map(d => (
              <tr
                key={d.mountpoint}
                onClick={() => setMountpoint(d.mountpoint)}
                className="border-b border-surface-border/50 cursor-pointer hover:bg-slate-700/30 transition-colors"
              >
                <td className="px-5 py-2.5 font-mono text-slate-300">{d.mountpoint}</td>
                <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{d.device}</td>
                <td className="px-4 py-2.5 text-slate-500">{d.fstype}</td>
                <td className="px-4 py-2.5 text-right font-mono text-slate-300">{fmtBytes(d.total_bytes)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                  {fmtBytes(d.total_bytes != null && d.avail_bytes != null ? d.total_bytes - d.avail_bytes : null)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-emerald-400">{fmtBytes(d.avail_bytes)}</td>
                <td className="px-5 py-2.5 text-right">
                  <span className={`font-mono font-bold ${
                    (d.usage_percent ?? 0) >= 90 ? 'text-red-400' :
                    (d.usage_percent ?? 0) >= 70 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {d.usage_percent?.toFixed(1) ?? '—'}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
