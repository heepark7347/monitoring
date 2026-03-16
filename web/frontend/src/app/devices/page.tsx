'use client'
import { useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import Link from 'next/link'
import { fetcher, jsonFetch, api } from '@/lib/api'
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

// ── 장비 추가 모달 ─────────────────────────────────────────────
function AddDeviceModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [hostIp, setHostIp]     = useState('')
  const [dispName, setDispName] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function submit() {
    if (!hostIp.trim() || !dispName.trim()) return
    setLoading(true); setError('')
    try {
      await jsonFetch(api.settings.devices.add(), 'POST', {
        host_ip:      hostIp.trim(),
        display_name: dispName.trim(),
      })
      onAdded()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '등록 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card border border-accent/20 rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink/85 font-mono">Add Device</p>
          <button onClick={onClose} className="text-ink-muted/60 hover:text-ink/70 text-lg leading-none">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-ink-muted/60 block mb-1">Device Name *</label>
            <input
              autoFocus
              value={dispName}
              onChange={e => setDispName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose() }}
              placeholder="e.g. Seoul-Server-01"
              className="w-full bg-surface-border/40 border border-surface-border/40 rounded px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs text-ink-muted/60 block mb-1">IPv4 Address *</label>
            <input
              value={hostIp}
              onChange={e => setHostIp(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose() }}
              placeholder="e.g. 192.168.0.1"
              className="w-full bg-surface-border/40 border border-surface-border/40 rounded px-3 py-2 text-sm text-ink outline-none focus:border-accent font-mono"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <p className="text-xs text-ink-muted/60">
          장비 등록은 통신이 필요하지 않습니다. 등록 후 장비 상세 페이지에서 센서를 추가하세요.
        </p>

        <div className="flex gap-2">
          <button
            onClick={submit}
            disabled={loading || !hostIp.trim() || !dispName.trim()}
            className="bg-accent hover:bg-accent/80 disabled:opacity-50 text-black text-sm px-4 py-2 rounded font-mono font-semibold transition-colors"
          >
            {loading ? 'Adding...' : 'Add Device'}
          </button>
          <button
            onClick={onClose}
            className="text-sm text-ink-muted hover:text-ink/85 px-4 py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 메인 페이지 ────────────────────────────────────────────────
export default function DevicesPage() {
  const devicesKey = api.devices.list()
  const { data: devices }  = useSWR<Device[]>(devicesKey, fetcher, { refreshInterval: 30000 })
  const { data: summary }  = useSWR<DashboardSummary>(api.dashboard.summary(), fetcher, { refreshInterval: 30000 })
  const [showAdd, setShowAdd] = useState(false)

  // host_ip별 센서 상태 맵
  const hostStatusMap: Record<string, SensorStatus[]> = {}
  for (const s of summary?.sensors ?? []) {
    if (!hostStatusMap[s.host_ip]) hostStatusMap[s.host_ip] = []
    hostStatusMap[s.host_ip].push(s.status)
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Devices</h1>
          <p className="text-sm text-ink-muted/60 mt-0.5">등록된 모니터링 디바이스</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-accent hover:bg-accent/80 text-black text-sm font-mono font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <span className="text-base leading-none">+</span>
          Add Device
        </button>
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
                href={`/devices/${d.id}`}
                className="block bg-surface-card border border-surface-border rounded-xl p-5 hover:border-accent/30 hover:bg-surface-card/60 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                    <div>
                      {d.display_name && <p className="text-ink font-semibold text-sm">{d.display_name}</p>}
                      <p className="font-mono text-ink-muted/70 text-xs">{d.host_ip}</p>
                    </div>
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
                    {downCnt === 0 && warnCnt === 0 && statuses.length > 0 && (
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
                  {d.sensor_types.length === 0 && (
                    <span className="text-xs text-ink-muted/40 italic">센서 없음 — 상세 페이지에서 추가</span>
                  )}
                </div>

                <p className="text-xs text-ink-muted/60 mt-3">
                  {statuses.length > 0 ? `${statuses.length}개 센서 ·` : ''} 클릭하여 상세 보기
                </p>
              </Link>
            )
          })}
        </div>
      )}

      {showAdd && (
        <AddDeviceModal
          onClose={() => setShowAdd(false)}
          onAdded={() => globalMutate(devicesKey)}
        />
      )}
    </div>
  )
}
