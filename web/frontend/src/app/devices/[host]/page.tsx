'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { fetcher, api } from '@/lib/api'
import type { DashboardSummary, SensorStatus } from '@/lib/types'

import GpuTab    from '@/app/gpu/page'
import SystemTab from '@/app/system/page'
import NetworkTab from '@/app/network/page'
import DiskTab   from '@/app/disk/page'

type TabKey = 'gpu' | 'system' | 'network' | 'disk'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'gpu',     label: 'GPU' },
  { key: 'system',  label: 'System' },
  { key: 'network', label: 'Network' },
  { key: 'disk',    label: 'Disk' },
]

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

export default function DeviceDetailPage() {
  const params  = useParams()
  const hostIp  = decodeURIComponent(params.host as string)
  const [tab, setTab] = useState<TabKey>('gpu')

  const { data: summary } = useSWR<DashboardSummary>(api.dashboard.summary(), fetcher, { refreshInterval: 30000 })

  const sensors  = (summary?.sensors ?? []).filter(s => s.host_ip === hostIp)
  const statuses = sensors.map(s => s.status)
  const status   = worstStatus(statuses as SensorStatus[])

  const downCnt = statuses.filter(s => s === 'down').length
  const warnCnt = statuses.filter(s => s === 'warning').length

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/devices" className="hover:text-slate-300 transition-colors">Devices</Link>
        <span>/</span>
        <span className="text-slate-200 font-mono">{hostIp}</span>
      </div>

      {/* Device header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${STATUS_DOT[status]}`} />
          <h1 className="text-xl font-semibold text-slate-100 font-mono">{hostIp}</h1>
          <div className="flex gap-1.5">
            {downCnt > 0 && (
              <span className="rounded-full bg-red-600/30 text-red-300 text-xs px-2 py-0.5 font-semibold">DOWN {downCnt}</span>
            )}
            {warnCnt > 0 && (
              <span className="rounded-full bg-amber-600/30 text-amber-300 text-xs px-2 py-0.5 font-semibold">WARN {warnCnt}</span>
            )}
            {downCnt === 0 && warnCnt === 0 && (
              <span className="rounded-full bg-emerald-600/20 text-emerald-400 text-xs px-2 py-0.5 font-semibold">정상</span>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-surface-border">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'gpu'     && <GpuTab />}
        {tab === 'system'  && <SystemTab />}
        {tab === 'network' && <NetworkTab />}
        {tab === 'disk'    && <DiskTab />}
      </div>
    </div>
  )
}
