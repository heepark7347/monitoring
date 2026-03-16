'use client'
import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { fetcher, jsonFetch, api } from '@/lib/api'
import type { RegisteredDevice, SensorConfig } from '@/lib/types'

const PRESET_HOST = '183.111.14.6'

const TYPE_LABEL: Record<string, string> = {
  gpu: 'GPU', node: 'System', disk: 'Disk', network: 'Network',
}
const TYPE_ICON: Record<string, string> = {
  gpu: '▣', node: '⬡', disk: '◫', network: '⇆',
}

// ── 토글 스위치 ────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        on ? 'bg-blue-600' : 'bg-slate-600'
      }`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
        on ? 'translate-x-4' : 'translate-x-0.5'
      }`} />
    </button>
  )
}

// ── 센서 행 ────────────────────────────────────────────────────
function SensorRow({ sensor, onToggle }: {
  sensor: SensorConfig
  onToggle: (id: number, enabled: boolean) => void
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm transition-colors ${
      sensor.enabled
        ? 'border-slate-700/60 bg-slate-800/30'
        : 'border-slate-800/40 bg-slate-900/20 opacity-50'
    }`}>
      <span className="text-slate-500 w-4 text-center">{TYPE_ICON[sensor.sensor_type]}</span>
      <span className="text-slate-400 w-16 text-xs">{TYPE_LABEL[sensor.sensor_type]}</span>
      <span className="flex-1 font-mono text-slate-200 text-xs">{sensor.sensor_name}</span>
      <Toggle on={sensor.enabled} onChange={v => onToggle(sensor.id, v)} />
    </div>
  )
}

// ── 장비 카드 ──────────────────────────────────────────────────
function DeviceCard({
  device, devicesKey, onDelete,
}: {
  device: RegisteredDevice
  devicesKey: string
  onDelete?: () => void
}) {
  const isPreset = device.host_ip === PRESET_HOST
  const [name, setName] = useState(device.display_name)
  const [editingName, setEditingName] = useState(false)
  const [discovering, setDiscovering] = useState(false)

  const sensorsKey = api.settings.sensors.list(device.host_ip)
  const { data: sensors, mutate: mutateSensors } = useSWR<SensorConfig[]>(sensorsKey, fetcher)

  async function saveName() {
    await jsonFetch(api.settings.devices.update(device.host_ip), 'PATCH', { display_name: name })
    setEditingName(false)
    mutate(devicesKey)
  }

  async function toggleSensor(id: number, enabled: boolean) {
    await jsonFetch(api.settings.sensors.update(id), 'PATCH', { enabled })
    mutateSensors()
  }

  async function discover() {
    setDiscovering(true)
    try {
      await jsonFetch(api.settings.devices.discover(device.host_ip), 'POST')
      mutateSensors()
    } finally {
      setDiscovering(false)
    }
  }

  const enabledCnt  = sensors?.filter(s => s.enabled).length ?? 0
  const totalCnt    = sensors?.length ?? 0

  return (
    <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
      {/* 카드 헤더 */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-border">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono text-slate-300 text-sm">{device.host_ip}</span>
            {isPreset && (
              <span className="text-xs bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded px-1.5 py-0.5">
                기본 등록
              </span>
            )}
          </div>

          {/* 장비명 인라인 편집 */}
          {editingName ? (
            <div className="flex items-center gap-2 mt-1">
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
                className="bg-slate-700 border border-slate-500 rounded px-2 py-0.5 text-sm text-slate-100 outline-none w-48"
                placeholder="장비명 입력"
              />
              <button onClick={saveName} className="text-xs text-blue-400 hover:text-blue-300">저장</button>
              <button onClick={() => { setName(device.display_name); setEditingName(false) }}
                className="text-xs text-slate-500 hover:text-slate-300">취소</button>
            </div>
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="text-sm text-slate-400 hover:text-slate-200 transition-colors mt-0.5 flex items-center gap-1.5"
            >
              {device.display_name || <span className="italic text-slate-600">장비명 없음</span>}
              <span className="text-xs text-slate-600">✎</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{enabledCnt}/{totalCnt} 센서 활성</span>
          <button
            onClick={discover}
            disabled={discovering}
            className="text-xs bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
          >
            {discovering ? '탐색 중...' : '센서 갱신'}
          </button>
          {!isPreset && onDelete && (
            <button
              onClick={onDelete}
              className="text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 px-3 py-1.5 rounded transition-colors"
            >
              삭제
            </button>
          )}
        </div>
      </div>

      {/* 센서 목록 */}
      <div className="p-4 space-y-1.5">
        {!sensors ? (
          <p className="text-xs text-slate-600 py-2 text-center">로딩 중...</p>
        ) : sensors.length === 0 ? (
          <p className="text-xs text-slate-600 py-2 text-center">
            발견된 센서가 없습니다. 수집 데이터가 있으면 &apos;센서 갱신&apos;을 눌러주세요.
          </p>
        ) : (
          sensors.map(s => (
            <SensorRow key={s.id} sensor={s} onToggle={toggleSensor} />
          ))
        )}
      </div>
    </div>
  )
}

// ── 장비 추가 폼 ───────────────────────────────────────────────
function AddDeviceForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen]       = useState(false)
  const [hostIp, setHostIp]   = useState('')
  const [dispName, setDispName] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!hostIp.trim()) return
    setLoading(true); setError('')
    try {
      await jsonFetch(api.settings.devices.add(), 'POST', {
        host_ip: hostIp.trim(),
        display_name: dispName.trim(),
      })
      setOpen(false); setHostIp(''); setDispName('')
      onAdded()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '등록 실패')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-dashed border-slate-600 px-4 py-3 text-sm text-slate-400 hover:border-blue-500/50 hover:text-blue-400 transition-colors w-full"
      >
        <span className="text-lg leading-none">+</span>
        장비 추가
      </button>
    )
  }

  return (
    <div className="bg-surface-card border border-blue-500/30 rounded-xl p-5 space-y-4">
      <p className="text-sm font-semibold text-slate-200">새 장비 등록</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">IP 주소 *</label>
          <input
            value={hostIp}
            onChange={e => setHostIp(e.target.value)}
            placeholder="예) 192.168.0.1"
            className="w-full bg-slate-700/60 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 font-mono"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">장비명</label>
          <input
            value={dispName}
            onChange={e => setDispName(e.target.value)}
            placeholder="예) 서울-서버-01"
            className="w-full bg-slate-700/60 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <p className="text-xs text-slate-500">
        해당 IP의 수집 데이터가 DB에 있어야 등록할 수 있습니다. 등록 후 센서가 자동으로 발견됩니다.
      </p>
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={loading || !hostIp.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded transition-colors"
        >
          {loading ? '등록 중...' : '등록'}
        </button>
        <button
          onClick={() => { setOpen(false); setHostIp(''); setDispName(''); setError('') }}
          className="text-sm text-slate-400 hover:text-slate-200 px-4 py-2"
        >
          취소
        </button>
      </div>
    </div>
  )
}

// ── 메인 페이지 ────────────────────────────────────────────────
export default function SettingsPage() {
  const devicesKey = api.settings.devices.list()
  const { data: devices } = useSWR<RegisteredDevice[]>(devicesKey, fetcher)

  async function deleteDevice(hostIp: string) {
    if (!confirm(`${hostIp} 장비를 삭제하시겠습니까?`)) return
    await jsonFetch(api.settings.devices.remove(hostIp), 'DELETE')
    mutate(devicesKey)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">장비 및 센서 관리</p>
      </div>

      <div className="space-y-4">
        {!devices ? (
          <p className="text-sm text-slate-500">로딩 중...</p>
        ) : (
          devices.map(d => (
            <DeviceCard
              key={d.host_ip}
              device={d}
              devicesKey={devicesKey}
              onDelete={() => deleteDevice(d.host_ip)}
            />
          ))
        )}

        <AddDeviceForm onAdded={() => mutate(devicesKey)} />
      </div>
    </div>
  )
}
