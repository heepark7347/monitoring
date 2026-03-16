'use client'
import useSWR from 'swr'
import { useState } from 'react'
import { fetcher, api } from '@/lib/api'
import type { NetworkLatest, NetworkHistory, TimeRange } from '@/lib/types'
import TimeRangePicker, { rangeToHours } from '@/components/ui/TimeRangePicker'
import LineChart from '@/components/charts/LineChart'

function fmtRate(bps: number | null) {
  if (bps === null || bps === undefined) return '—'
  if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(2)} MB/s`
  if (bps >= 1024)        return `${(bps / 1024).toFixed(2)} kB/s`
  return `${bps.toFixed(2)} B/s`
}

const PHYSICAL_IFACES = ['ens10f0', 'ens10f1', 'ens10f2', 'ens10f3', 'eth0', 'bond0']

export default function NetworkPage() {
  const [range,    setRange]    = useState<TimeRange>('1H')
  const [iface,    setIface]    = useState('ens10f0')

  const hours = rangeToHours(range)

  const { data: latest }  = useSWR<NetworkLatest[]>(api.network.latest(),           fetcher, { refreshInterval: 60000 })
  const { data: history } = useSWR<NetworkHistory[]>(api.network.history(hours, iface), fetcher, { refreshInterval: 60000 })
  const { data: ifList }  = useSWR<{ if_descr: string; is_up: boolean }[]>(api.network.interfaces(), fetcher)

  const selected = latest?.find(i => i.if_descr === iface)

  const inTotal  = history?.reduce((sum, r) => sum + (r.if_in_octets_rate  ?? 0), 0) ?? 0
  const outTotal = history?.reduce((sum, r) => sum + (r.if_out_octets_rate ?? 0), 0) ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Network Traffic</h1>
          <p className="text-sm text-ink-muted/60 mt-0.5">SNMP if_mib · 인터페이스별 트래픽</p>
        </div>
        <div className="flex items-center gap-3">
          <TimeRangePicker value={range} onChange={setRange} />
        </div>
      </div>

      {/* Interface selector */}
      <div className="bg-surface-card border border-surface-border rounded-xl p-4">
        <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">인터페이스 선택</p>
        <div className="flex flex-wrap gap-2">
          {(ifList ?? []).map(i => (
            <button
              key={i.if_descr}
              onClick={() => setIface(i.if_descr)}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors border ${
                iface === i.if_descr
                  ? 'border-accent bg-accent/10 text-accent/80'
                  : 'border-surface-border text-ink-muted hover:border-slate-500 hover:text-ink/85'
              }`}
            >
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${i.is_up ? 'bg-emerald-400' : 'bg-red-500'}`} />
              {i.if_descr}
            </button>
          ))}
        </div>
      </div>

      {/* Current stats for selected interface */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-surface-card border border-surface-border rounded-xl p-4">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-1">Status</p>
          <p className={`text-lg font-bold ${selected?.if_oper_status === 1 ? 'text-emerald-400' : 'text-red-400'}`}>
            {selected?.if_oper_status === 1 ? 'UP' : 'DOWN'}
          </p>
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-4">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-1">IN (현재)</p>
          <p className="text-lg font-bold font-mono text-accent">{fmtRate(selected?.if_in_octets_rate ?? null)}</p>
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-4">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-1">OUT (현재)</p>
          <p className="text-lg font-bold font-mono text-amber-400">{fmtRate(selected?.if_out_octets_rate ?? null)}</p>
        </div>
        <div className="bg-surface-card border border-surface-border rounded-xl p-4">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-1">Packets IN</p>
          <p className="text-lg font-bold font-mono text-ink">
            {selected?.if_in_ucast_pkts_rate != null ? `${selected.if_in_ucast_pkts_rate.toFixed(1)} pps` : '—'}
          </p>
        </div>
      </div>

      {/* Traffic charts */}
      <div className="bg-surface-card border border-surface-border rounded-xl p-5">
        <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">
          Traffic — <span className="font-mono text-ink/70">{iface}</span>
        </p>
        <LineChart
          series={[
            {
              name: 'IN', color: '#3b82f6',
              data: (history ?? []).map(r => ({ t: new Date(r.collected_at), v: r.if_in_octets_rate ?? 0 })),
            },
            {
              name: 'OUT', color: '#f59e0b',
              data: (history ?? []).map(r => ({ t: new Date(r.collected_at), v: r.if_out_octets_rate ?? 0 })),
            },
          ]}
          unit=" B/s"
          height={220}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">Packets (pps)</p>
          <LineChart
            series={[
              {
                name: 'IN pps', color: '#10b981',
                data: (history ?? []).map(r => ({ t: new Date(r.collected_at), v: r.if_in_ucast_pkts_rate ?? 0 })),
              },
              {
                name: 'OUT pps', color: '#8b5cf6',
                data: (history ?? []).map(r => ({ t: new Date(r.collected_at), v: r.if_out_ucast_pkts_rate ?? 0 })),
              },
            ]}
            unit=" pps"
          />
        </div>

        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider mb-3">Errors &amp; Discards</p>
          <LineChart
            series={[
              {
                name: 'IN Err',  color: '#ef4444',
                data: (history ?? []).map(r => ({ t: new Date(r.collected_at), v: r.if_in_errors_rate ?? 0 })),
              },
              {
                name: 'OUT Err', color: '#f97316',
                data: (history ?? []).map(r => ({ t: new Date(r.collected_at), v: r.if_out_errors_rate ?? 0 })),
              },
            ]}
            unit="/s"
          />
        </div>
      </div>

      {/* All interfaces table */}
      <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-surface-border">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider">전체 인터페이스 현황</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink-muted/60 border-b border-surface-border">
              <th className="text-left px-5 py-2">Interface</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">IN</th>
              <th className="text-right px-4 py-2">OUT</th>
              <th className="text-right px-4 py-2">IN pps</th>
              <th className="text-right px-4 py-2">OUT pps</th>
              <th className="text-right px-5 py-2">Errors</th>
            </tr>
          </thead>
          <tbody>
            {(latest ?? []).map(i => (
              <tr
                key={i.if_descr}
                onClick={() => setIface(i.if_descr)}
                className={`border-b border-surface-border/50 cursor-pointer transition-colors ${
                  iface === i.if_descr ? 'bg-accent/10' : 'hover:bg-surface-border/60/30'
                }`}
              >
                <td className="px-5 py-2.5 font-mono text-ink/70">{i.if_descr}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-medium ${i.if_oper_status === 1 ? 'text-emerald-400' : 'text-red-500'}`}>
                    {i.if_oper_status === 1 ? 'UP' : 'DOWN'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-accent/80">{fmtRate(i.if_in_octets_rate)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-amber-300">{fmtRate(i.if_out_octets_rate)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-ink-muted">
                  {i.if_in_ucast_pkts_rate != null ? `${i.if_in_ucast_pkts_rate.toFixed(1)}` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-ink-muted">
                  {i.if_out_ucast_pkts_rate != null ? `${i.if_out_ucast_pkts_rate.toFixed(1)}` : '—'}
                </td>
                <td className="px-5 py-2.5 text-right font-mono text-ink-muted/60">
                  {((i.if_in_errors_rate ?? 0) + (i.if_out_errors_rate ?? 0)).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
