'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import useSWR, { mutate as globalMutate } from 'swr'
import { fetcher, jsonFetch, api } from '@/lib/api'
import type { DashboardSummary, SensorStatus, SensorConfig, AvailableSensor } from '@/lib/types'

import GpuTab    from '@/app/gpu/page'
import SystemTab from '@/app/system/page'
import NetworkTab from '@/app/network/page'
import DiskTab   from '@/app/disk/page'

type TabKey = 'gpu' | 'system' | 'network' | 'disk' | 'settings'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'gpu',      label: 'GPU'    },
  { key: 'system',   label: 'System' },
  { key: 'network',  label: 'Network'},
  { key: 'disk',     label: 'Disk'   },
  { key: 'settings', label: '⚙ 설정' },
]

const STATUS_DOT: Record<SensorStatus, string> = {
  up:      'bg-emerald-400',
  down:    'bg-red-400',
  warning: 'bg-amber-400',
  pause:   'bg-slate-500',
}

const TYPE_LABEL: Record<string, string> = {
  gpu: 'GPU', node: 'System', disk: 'Disk', network: 'Network',
}
const TYPE_ICON: Record<string, string> = {
  gpu: '▣', node: '⬡', disk: '◫', network: '⇆',
}

function worstStatus(statuses: SensorStatus[]): SensorStatus {
  if (statuses.includes('down'))    return 'down'
  if (statuses.includes('warning')) return 'warning'
  if (statuses.includes('pause'))   return 'pause'
  return 'up'
}

// ── 토글 스위치 ────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        on ? 'bg-accent' : 'bg-slate-600'
      }`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
        on ? 'translate-x-4' : 'translate-x-0.5'
      }`} />
    </button>
  )
}

// ── 센서 추가 모달 ─────────────────────────────────────────────
function AddSensorModal({
  hostIp, onClose, onAdded,
}: { hostIp: string; onClose: () => void; onAdded: () => void }) {
  const { data: available, isLoading } = useSWR<AvailableSensor[]>(
    api.settings.sensors.available(hostIp), fetcher
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading]   = useState(false)

  const unregistered = available?.filter(s => !s.registered) ?? []

  function toggle(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function sensorKey(s: AvailableSensor) {
    return `${s.sensor_type}::${s.sensor_name}`
  }

  async function submit() {
    const sensors = unregistered
      .filter(s => selected.has(sensorKey(s)))
      .map(s => ({ sensor_type: s.sensor_type, sensor_name: s.sensor_name }))
    if (!sensors.length) return
    setLoading(true)
    try {
      await jsonFetch(api.settings.sensors.register(), 'POST', { host_ip: hostIp, sensors })
      onAdded()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card border border-accent/20 rounded-xl p-6 w-full max-w-lg space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink/85 font-mono">센서 추가</p>
          <button onClick={onClose} className="text-ink-muted/60 hover:text-ink/70 text-lg leading-none">✕</button>
        </div>

        <p className="text-xs text-ink-muted/60">
          수집 중인 모든 센서 목록입니다. 추가할 센서를 선택하세요.
        </p>

        {isLoading ? (
          <p className="text-xs text-ink-muted/60 py-4 text-center">스캔 중...</p>
        ) : unregistered.length === 0 ? (
          <p className="text-xs text-ink-muted/60 py-4 text-center">
            {available?.length === 0
              ? '수집 데이터가 없습니다.'
              : '추가 가능한 센서가 없습니다. 모든 센서가 이미 등록되었습니다.'}
          </p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {unregistered.map(s => {
              const key = sensorKey(s)
              const on  = selected.has(key)
              return (
                <label
                  key={key}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                    on
                      ? 'border-accent/40 bg-accent/5'
                      : 'border-surface-border/50 bg-surface/10 hover:border-surface-border'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(key)}
                    className="accent-accent h-3.5 w-3.5"
                  />
                  <span className="text-ink-muted/60 w-5 text-center text-xs">{TYPE_ICON[s.sensor_type]}</span>
                  <span className="text-ink-muted w-16 text-xs">{TYPE_LABEL[s.sensor_type]}</span>
                  <span className="flex-1 font-mono text-ink/85 text-xs">{s.sensor_name}</span>
                </label>
              )
            })}
          </div>
        )}

        {/* 이미 등록된 센서 */}
        {(available?.filter(s => s.registered).length ?? 0) > 0 && (
          <details className="text-xs">
            <summary className="text-ink-muted/50 cursor-pointer hover:text-ink-muted transition-colors">
              이미 등록된 센서 {available!.filter(s => s.registered).length}개
            </summary>
            <div className="mt-2 space-y-1">
              {available!.filter(s => s.registered).map(s => (
                <div key={sensorKey(s)} className="flex items-center gap-3 px-4 py-1.5 rounded opacity-50">
                  <span className="w-5 text-center text-xs">{TYPE_ICON[s.sensor_type]}</span>
                  <span className="w-16 text-xs text-ink-muted">{TYPE_LABEL[s.sensor_type]}</span>
                  <span className="font-mono text-xs text-ink/60">{s.sensor_name}</span>
                  <span className="text-accent/60 text-xs ml-auto">등록됨</span>
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={submit}
            disabled={loading || selected.size === 0}
            className="bg-accent hover:bg-accent/80 disabled:opacity-50 text-black text-sm font-mono font-semibold px-4 py-2 rounded transition-colors"
          >
            {loading ? '등록 중...' : `선택 추가 (${selected.size})`}
          </button>
          <button onClick={onClose} className="text-sm text-ink-muted hover:text-ink/85 px-4 py-2">
            취소
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 설정 탭 (센서 관리) ────────────────────────────────────────
function SettingsTab({ hostIp }: { hostIp: string }) {
  const sensorsKey = api.settings.sensors.list(hostIp)
  const { data: sensors, mutate: mutateSensors } = useSWR<SensorConfig[]>(sensorsKey, fetcher)
  const [editingName, setEditingName]   = useState(false)
  const [dispName, setDispName]         = useState('')
  const [nameLoading, setNameLoading]   = useState(false)

  async function toggleSensor(id: number, enabled: boolean) {
    await jsonFetch(api.settings.sensors.update(id), 'PATCH', { enabled })
    mutateSensors()
  }

  async function deleteSensor(id: number, label: string) {
    if (!confirm(`"${label}" 센서를 삭제하시겠습니까?\n관련된 모든 이력 데이터도 삭제됩니다.`)) return
    await jsonFetch(api.settings.sensors.remove(id), 'DELETE')
    mutateSensors()
  }

  async function saveName() {
    setNameLoading(true)
    try {
      await jsonFetch(api.settings.devices.update(hostIp), 'PATCH', { display_name: dispName })
      setEditingName(false)
      globalMutate(api.settings.devices.list())
    } finally {
      setNameLoading(false)
    }
  }

  async function deleteDevice() {
    if (!confirm(`${hostIp} 장비를 삭제하시겠습니까?\n모든 센서 설정이 제거됩니다.`)) return
    await jsonFetch(api.settings.devices.remove(hostIp), 'DELETE')
    window.location.href = '/devices'
  }

  const enabledCnt = sensors?.filter(s => s.enabled).length ?? 0
  const totalCnt   = sensors?.length ?? 0

  return (
    <div className="space-y-5 max-w-2xl">
      {/* 장비 정보 */}
      <div className="bg-surface-card border border-surface-border rounded-xl p-5 space-y-4">
        <p className="text-xs text-ink-muted/60 uppercase tracking-wider">장비 설정</p>

        <div className="flex items-center gap-3">
          {editingName ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                autoFocus
                value={dispName}
                onChange={e => setDispName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
                className="bg-surface-border/60 border border-slate-500 rounded px-3 py-1.5 text-sm text-ink outline-none focus:border-accent flex-1"
                placeholder="장비명 입력"
              />
              <button
                onClick={saveName}
                disabled={nameLoading}
                className="text-xs text-accent hover:text-accent/80 px-2 py-1"
              >
                {nameLoading ? '...' : '저장'}
              </button>
              <button
                onClick={() => setEditingName(false)}
                className="text-xs text-ink-muted/60 hover:text-ink/70 px-2 py-1"
              >
                취소
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setDispName(''); setEditingName(true) }}
              className="text-sm text-ink-muted hover:text-ink/85 transition-colors flex items-center gap-2"
            >
              <span className="font-mono text-ink/70">{hostIp}</span>
              <span className="text-ink-faint text-xs">✎ 장비명 편집</span>
            </button>
          )}
        </div>

        <div className="pt-2 border-t border-surface-border/50">
          <button
            onClick={deleteDevice}
            className="text-xs bg-red-900/20 hover:bg-red-900/40 text-red-400 px-3 py-1.5 rounded transition-colors"
          >
            장비 삭제
          </button>
          <p className="text-xs text-ink-muted/40 mt-1">장비 삭제 시 모든 센서 설정이 제거됩니다. (수집 데이터는 유지)</p>
        </div>
      </div>

      {/* 센서 목록 */}
      <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-border">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider">
            등록된 센서
            <span className="ml-2 text-ink-muted font-mono">{enabledCnt}/{totalCnt} 활성</span>
          </p>
        </div>

        <div className="p-4 space-y-1.5">
          {!sensors ? (
            <p className="text-xs text-ink-faint py-2 text-center">로딩 중...</p>
          ) : sensors.length === 0 ? (
            <p className="text-xs text-ink-faint py-4 text-center">
              등록된 센서가 없습니다. 우측 상단의 &apos;센서 추가&apos;를 눌러 센서를 추가하세요.
            </p>
          ) : (
            sensors.map(s => (
              <div
                key={s.id}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm transition-colors ${
                  s.enabled
                    ? 'border-surface-border/50 bg-surface-card/30'
                    : 'border-slate-800/40 bg-surface/20 opacity-60'
                }`}
              >
                <span className="text-ink-muted/60 w-5 text-center">{TYPE_ICON[s.sensor_type]}</span>
                <span className="text-ink-muted w-16 text-xs">{TYPE_LABEL[s.sensor_type]}</span>
                <span className="flex-1 font-mono text-ink/85 text-xs">{s.sensor_name}</span>
                <Toggle on={s.enabled} onChange={v => toggleSensor(s.id, v)} />
                <button
                  onClick={() => deleteSensor(s.id, `${TYPE_LABEL[s.sensor_type]} · ${s.sensor_name}`)}
                  className="text-xs text-red-400/60 hover:text-red-400 transition-colors px-1.5"
                  title="센서 및 이력 데이터 삭제"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── 메인 페이지 ────────────────────────────────────────────────
export default function DeviceDetailPage() {
  const params  = useParams()
  const hostIp  = decodeURIComponent(params.host as string)
  const [tab, setTab]           = useState<TabKey>('gpu')
  const [showAddSensor, setShowAddSensor] = useState(false)

  const { data: summary } = useSWR<DashboardSummary>(api.dashboard.summary(), fetcher, { refreshInterval: 30000 })
  const sensorsKey = api.settings.sensors.list(hostIp)
  const { mutate: mutateSensors } = useSWR<SensorConfig[]>(sensorsKey, fetcher)

  const sensors  = (summary?.sensors ?? []).filter(s => s.host_ip === hostIp)
  const statuses = sensors.map(s => s.status)
  const status   = worstStatus(statuses as SensorStatus[])

  const downCnt = statuses.filter(s => s === 'down').length
  const warnCnt = statuses.filter(s => s === 'warning').length

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-ink-muted/60">
        <Link href="/devices" className="hover:text-ink/70 transition-colors">Devices</Link>
        <span>/</span>
        <span className="text-ink/85 font-mono">{hostIp}</span>
      </div>

      {/* Device header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${STATUS_DOT[status]}`} />
          <h1 className="text-xl font-semibold text-ink font-mono">{hostIp}</h1>
          <div className="flex gap-1.5">
            {downCnt > 0 && (
              <span className="rounded-full bg-red-600/30 text-red-300 text-xs px-2 py-0.5 font-semibold">DOWN {downCnt}</span>
            )}
            {warnCnt > 0 && (
              <span className="rounded-full bg-amber-600/30 text-amber-300 text-xs px-2 py-0.5 font-semibold">WARN {warnCnt}</span>
            )}
            {downCnt === 0 && warnCnt === 0 && statuses.length > 0 && (
              <span className="rounded-full bg-emerald-600/20 text-emerald-400 text-xs px-2 py-0.5 font-semibold">정상</span>
            )}
          </div>
        </div>

        {/* 센서 추가 버튼 */}
        <button
          onClick={() => setShowAddSensor(true)}
          className="flex items-center gap-1.5 bg-accent hover:bg-accent/80 text-black text-sm font-mono font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <span className="text-base leading-none">+</span>
          센서 추가
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-surface-border">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-muted hover:text-ink/85'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'gpu'      && <GpuTab />}
        {tab === 'system'   && <SystemTab />}
        {tab === 'network'  && <NetworkTab />}
        {tab === 'disk'     && <DiskTab />}
        {tab === 'settings' && <SettingsTab hostIp={hostIp} />}
      </div>

      {/* 센서 추가 모달 */}
      {showAddSensor && (
        <AddSensorModal
          hostIp={hostIp}
          onClose={() => setShowAddSensor(false)}
          onAdded={() => mutateSensors()}
        />
      )}
    </div>
  )
}
