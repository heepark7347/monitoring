'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import useSWR, { mutate as globalMutate } from 'swr'
import { fetcher, jsonFetch, api } from '@/lib/api'
import type { DashboardSummary, SensorStatus, SensorConfig, AvailableSensor, DeviceDetail, Sensor } from '@/lib/types'

type TabKey = 'sensors' | 'settings'

const STATUS_DOT: Record<SensorStatus, string> = {
  up:      'bg-emerald-400',
  down:    'bg-red-400',
  warning: 'bg-amber-400',
  pause:   'bg-slate-500',
}
const STATUS_BG: Record<SensorStatus, string> = {
  up:      'border-emerald-500/20 bg-emerald-900/10',
  down:    'border-red-500/30 bg-red-900/20',
  warning: 'border-amber-500/30 bg-amber-900/20',
  pause:   'border-slate-600/30 bg-slate-800/20',
}
const TYPE_ICON: Record<string, string> = {
  gpu: '▣', node: '⬡', disk: '◫', network: '⇆', icmp: '⟳', port: '⇌',
}
const TYPE_LABEL: Record<string, string> = {
  gpu: 'GPU', node: 'System', disk: 'Disk', network: 'Network', icmp: 'ICMP', port: 'Port',
}
const SENSOR_TYPE_MAP: Record<string, string> = {
  GPU: 'gpu', Disk: 'disk', Network: 'network', Node: 'node', ICMP: 'icmp', Port: 'port',
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
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${on ? 'bg-accent' : 'bg-slate-600'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

// ── 센서 표시 이름 ─────────────────────────────────────────────
const NODE_LABEL: Record<string, { name: string; desc: string }> = {
  cpu:    { name: 'CPU Utilization',  desc: 'CPU 사용률 및 Load Average' },
  memory: { name: 'Memory Usage',     desc: '메모리 사용률 및 가용량' },
  uptime: { name: 'Uptime',           desc: '시스템 가동 시간' },
  system: { name: 'System (legacy)',  desc: 'CPU + Memory 통합' },
}
const GPU_METRIC_LABEL: Record<string, { name: string; desc: string }> = {
  utilization: { name: 'GPU Utilization', desc: 'GPU 코어 사용률 (%)' },
  memory:      { name: 'GPU Memory',      desc: 'VRAM 사용량 및 여유' },
  temperature: { name: 'Temperature',     desc: 'GPU 온도 (°C)' },
  power:       { name: 'Power Usage',     desc: '소비 전력 (W)' },
  health:      { name: 'Health / ECC',    desc: 'XID 에러, ECC, PCIe 상태' },
  clock:       { name: 'Clock Speed',     desc: 'SM · MEM 클럭 (MHz)' },
}

function sensorDisplayName(type: string, name: string): { name: string; desc: string } {
  if (type === 'node') return NODE_LABEL[name] ?? { name, desc: '' }
  if (type === 'gpu') {
    const [idx, metric] = name.split('_', 2)
    if (!metric) return { name: `GPU ${idx}`, desc: 'GPU 전체 상태 (utilization · memory · temperature · power · health · clock)' }
    const lbl = GPU_METRIC_LABEL[metric] ?? { name: metric, desc: '' }
    return { name: `GPU ${idx} · ${lbl.name}`, desc: lbl.desc }
  }
  if (type === 'disk') return { name, desc: `디스크 사용률 — ${name}` }
  if (type === 'network') return { name, desc: `네트워크 인터페이스 — ${name}` }
  if (type === 'icmp') return { name: 'ICMP Ping', desc: 'ICMP 도달 여부 및 지연시간' }
  return { name, desc: '' }
}

// ── Add Sensor 모달 ────────────────────────────────────────────
function AddSensorModal({ hostIp, onClose, onAdded }: {
  hostIp: string; onClose: () => void; onAdded: () => void
}) {
  const { data: available, isLoading } = useSWR<AvailableSensor[]>(
    api.settings.sensors.available(hostIp), fetcher
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [portInput, setPortInput] = useState('')
  const [loading, setLoading]     = useState(false)

  const unregistered = available?.filter(s => !s.registered) ?? []
  const registeredList = available?.filter(s => s.registered) ?? []
  function sKey(s: AvailableSensor) { return `${s.sensor_type}::${s.sensor_name}` }

  function toggle(key: string) {
    setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  async function submit() {
    const sensors = unregistered
      .filter(s => selected.has(sKey(s)))
      .map(s => ({ sensor_type: s.sensor_type, sensor_name: s.sensor_name }))
    if (portInput.trim()) sensors.push({ sensor_type: 'port', sensor_name: portInput.trim() })
    if (!sensors.length) return
    setLoading(true)
    try {
      await jsonFetch(api.settings.sensors.register(), 'POST', { host_ip: hostIp, sensors })
      onAdded(); onClose()
    } finally { setLoading(false) }
  }

  // 타입별 그룹
  const groups: { type: string; icon: string; label: string; sensors: AvailableSensor[] }[] = [
    { type: 'gpu',     icon: '▣', label: 'GPU',               sensors: unregistered.filter(s => s.sensor_type === 'gpu') },
    { type: 'node',    icon: '⬡', label: 'System',            sensors: unregistered.filter(s => s.sensor_type === 'node') },
    { type: 'disk',    icon: '◫', label: 'Disk',              sensors: unregistered.filter(s => s.sensor_type === 'disk') },
    { type: 'network', icon: '⇆', label: 'Network Interface', sensors: unregistered.filter(s => s.sensor_type === 'network') },
    { type: 'icmp',    icon: '⟳', label: 'ICMP Ping',         sensors: unregistered.filter(s => s.sensor_type === 'icmp') },
  ].filter(g => g.sensors.length > 0)

  const addCount = selected.size + (portInput.trim() ? 1 : 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card border border-accent/20 rounded-xl w-full max-w-xl shadow-2xl flex flex-col max-h-[88vh]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border/50">
          <div>
            <p className="text-sm font-semibold text-ink/85 font-mono">Add Sensor</p>
            <p className="text-xs text-ink-muted/50 font-mono mt-0.5">{hostIp}</p>
          </div>
          <button onClick={onClose} className="text-ink-muted/60 hover:text-ink/70 text-lg leading-none">✕</button>
        </div>

        {/* 콘텐츠 */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
          {isLoading ? (
            <p className="text-xs text-ink-muted/60 py-10 text-center">수집 가능한 센서 조회 중...</p>
          ) : (
            <>
              {groups.map(g => (
                <div key={g.type}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-ink-muted/60 uppercase tracking-wider">
                      {g.icon} {g.label}
                    </p>
                    <button
                      onClick={() => {
                        const keys = g.sensors.map(s => sKey(s))
                        const allOn = keys.every(k => selected.has(k))
                        setSelected(prev => {
                          const n = new Set(prev)
                          allOn ? keys.forEach(k => n.delete(k)) : keys.forEach(k => n.add(k))
                          return n
                        })
                      }}
                      className="text-xs text-ink-muted/40 hover:text-accent transition-colors"
                    >
                      {g.sensors.every(s => selected.has(sKey(s))) ? '전체 해제' : '전체 선택'}
                    </button>
                  </div>
                  <div className="space-y-1">
                    {g.sensors.map(s => {
                      const k   = sKey(s)
                      const on  = selected.has(k)
                      const lbl = sensorDisplayName(s.sensor_type, s.sensor_name)
                      return (
                        <label key={k} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${on ? 'border-accent/40 bg-accent/5' : 'border-surface-border/40 hover:border-surface-border/70'}`}>
                          <input type="checkbox" checked={on} onChange={() => toggle(k)} className="accent-accent h-3.5 w-3.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-ink/85 font-mono">{lbl.name}</p>
                            {lbl.desc && <p className="text-xs text-ink-muted/50 mt-0.5">{lbl.desc}</p>}
                          </div>
                          {on && <span className="text-accent text-xs flex-shrink-0">✓</span>}
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* TCP Port */}
              <div>
                <p className="text-xs font-semibold text-ink-muted/60 uppercase tracking-wider mb-2">⇌ TCP Port Check</p>
                <input
                  value={portInput}
                  onChange={e => setPortInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="포트 번호 입력 — 예) 22, 80, 443, 3306, 5432"
                  className="w-full bg-surface-border/40 border border-surface-border/40 rounded-lg px-4 py-2.5 text-sm text-ink font-mono outline-none focus:border-accent"
                  maxLength={5}
                />
                <p className="text-xs text-ink-muted/40 mt-1.5">22 SSH · 80 HTTP · 443 HTTPS · 3306 MySQL · 5432 PgSQL · 6379 Redis · 27017 MongoDB</p>
              </div>

              {/* 이미 등록된 센서 */}
              {registeredList.length > 0 && (
                <details className="text-xs">
                  <summary className="text-ink-muted/40 cursor-pointer hover:text-ink-muted select-none">
                    이미 등록된 센서 ({registeredList.length}개)
                  </summary>
                  <div className="mt-2 space-y-1 opacity-40 pointer-events-none">
                    {registeredList.map(s => {
                      const lbl = sensorDisplayName(s.sensor_type, s.sensor_name)
                      return (
                        <div key={sKey(s)} className="flex items-center gap-3 px-4 py-2 rounded border border-surface-border/30">
                          <span className="text-ink-muted/60">{TYPE_ICON[s.sensor_type]}</span>
                          <span className="flex-1 font-mono text-ink/60 text-xs">{lbl.name}</span>
                          <span className="text-emerald-500/60 text-xs">등록됨</span>
                        </div>
                      )
                    })}
                  </div>
                </details>
              )}

              {groups.length === 0 && !portInput && (
                <p className="text-xs text-ink-muted/60 py-6 text-center">
                  {available?.length === 0
                    ? '수집된 데이터가 없습니다. 에이전트가 실행 중인지 확인하세요.'
                    : '추가 가능한 센서가 없습니다. 모두 등록되어 있습니다.'}
                </p>
              )}
            </>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-surface-border/50">
          <button
            onClick={submit}
            disabled={loading || addCount === 0}
            className="bg-accent hover:bg-accent/80 disabled:opacity-40 text-black text-sm font-mono font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            {loading ? '추가 중...' : addCount > 0 ? `${addCount}개 센서 추가` : '센서를 선택하세요'}
          </button>
          <button onClick={onClose} className="text-sm text-ink-muted hover:text-ink/85 px-3 py-2">
            취소
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Settings 탭 ────────────────────────────────────────────────
function SettingsTab({ hostIp }: { hostIp: string }) {
  const sensorsKey = api.settings.sensors.list(hostIp)
  const { data: sensors, mutate: mutateSensors } = useSWR<SensorConfig[]>(sensorsKey, fetcher)
  const [editingName, setEditingName] = useState(false)
  const [dispName, setDispName]       = useState('')
  const [nameLoading, setNameLoading] = useState(false)

  async function toggleSensor(id: number, enabled: boolean) {
    await jsonFetch(api.settings.sensors.update(id), 'PATCH', { enabled }); mutateSensors()
  }
  async function deleteSensor(id: number, label: string) {
    if (!confirm(`"${label}" 센서를 삭제하시겠습니까?\n관련된 모든 이력 데이터도 삭제됩니다.`)) return
    await jsonFetch(api.settings.sensors.remove(id), 'DELETE'); mutateSensors()
  }
  async function saveName() {
    setNameLoading(true)
    try {
      await jsonFetch(api.settings.devices.update(hostIp), 'PATCH', { display_name: dispName })
      setEditingName(false)
      globalMutate(api.settings.devices.list())
      globalMutate(api.devices.list())
    } finally { setNameLoading(false) }
  }
  async function deleteDevice() {
    if (!confirm(`${hostIp} 장비를 삭제하시겠습니까?`)) return
    await jsonFetch(api.settings.devices.remove(hostIp), 'DELETE')
    window.location.href = '/devices'
  }

  const enabledCnt = sensors?.filter(s => s.enabled).length ?? 0
  const totalCnt   = sensors?.length ?? 0

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="bg-surface-card border border-surface-border rounded-xl p-5 space-y-4">
        <p className="text-xs text-ink-muted/60 uppercase tracking-wider">Device Settings</p>
        <div className="flex items-center gap-3">
          {editingName ? (
            <div className="flex items-center gap-2 flex-1">
              <input autoFocus value={dispName} onChange={e => setDispName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
                className="bg-surface-border/60 border border-slate-500 rounded px-3 py-1.5 text-sm text-ink outline-none focus:border-accent flex-1"
                placeholder="Device name" />
              <button onClick={saveName} disabled={nameLoading} className="text-xs text-accent hover:text-accent/80 px-2 py-1">{nameLoading ? '...' : 'Save'}</button>
              <button onClick={() => setEditingName(false)} className="text-xs text-ink-muted/60 hover:text-ink/70 px-2 py-1">Cancel</button>
            </div>
          ) : (
            <button onClick={() => { setDispName(''); setEditingName(true) }}
              className="text-sm text-ink-muted hover:text-ink/85 transition-colors flex items-center gap-2">
              <span className="font-mono text-ink/70">{hostIp}</span>
              <span className="text-ink-faint text-xs">✎ Edit name</span>
            </button>
          )}
        </div>
        <div className="pt-2 border-t border-surface-border/50">
          <button onClick={deleteDevice} className="text-xs bg-red-900/20 hover:bg-red-900/40 text-red-400 px-3 py-1.5 rounded transition-colors">Delete Device</button>
          <p className="text-xs text-ink-muted/40 mt-1">Removes all sensor configurations. Metric data is retained.</p>
        </div>
      </div>

      <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-border">
          <p className="text-xs text-ink-muted/60 uppercase tracking-wider">
            Registered Sensors <span className="ml-2 text-ink-muted font-mono">{enabledCnt}/{totalCnt} active</span>
          </p>
        </div>
        <div className="p-4 space-y-1.5">
          {!sensors ? (
            <p className="text-xs text-ink-faint py-2 text-center">Loading...</p>
          ) : sensors.length === 0 ? (
            <p className="text-xs text-ink-faint py-4 text-center">No sensors registered. Click &quot;+ Add Sensor&quot; to add.</p>
          ) : (
            sensors.map(s => (
              <div key={s.id} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm transition-colors ${s.enabled ? 'border-surface-border/50 bg-surface-card/30' : 'border-slate-800/40 bg-surface/20 opacity-60'}`}>
                <span className="text-ink-muted/60 w-5 text-center">{TYPE_ICON[s.sensor_type]}</span>
                <span className="text-ink-muted w-16 text-xs">{TYPE_LABEL[s.sensor_type]}</span>
                <span className="flex-1 font-mono text-ink/85 text-xs">{s.sensor_name}</span>
                <Toggle on={s.enabled} onChange={v => toggleSensor(s.id, v)} />
                <button onClick={() => deleteSensor(s.id, `${TYPE_LABEL[s.sensor_type]} · ${s.sensor_name}`)}
                  className="text-xs text-red-400/60 hover:text-red-400 transition-colors px-1.5" title="Delete sensor">✕</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── GPU 인덱스 카드 ────────────────────────────────────────────
function GpuIndexCard({ gpuIdx, sensors, deviceId }: {
  gpuIdx: string; sensors: Sensor[]; deviceId: number
}) {
  const status = worstStatus(sensors.map(s => s.status as SensorStatus))
  const href   = `/devices/${deviceId}/sensors/gpu/${gpuIdx}`

  // 신형: sensor_name이 인덱스만 (e.g. '0') — 센서 1개
  const isConsolidated = sensors.length === 1 && !sensors[0].sensor_name.includes('_')

  // 구형: 메트릭별 센서
  const util     = isConsolidated ? undefined : sensors.find(s => s.sensor_name.endsWith('_utilization'))
  const mem      = isConsolidated ? undefined : sensors.find(s => s.sensor_name.endsWith('_memory'))
  const temp     = isConsolidated ? undefined : sensors.find(s => s.sensor_name.endsWith('_temperature'))
  const health   = isConsolidated ? undefined : sensors.find(s => s.sensor_name.endsWith('_health'))
  const downList = isConsolidated ? [] : sensors.filter(s => s.status === 'down').map(s => s.sensor_name.split('_')[1])
  const warnList = isConsolidated ? [] : sensors.filter(s => s.status === 'warning').map(s => s.sensor_name.split('_')[1])

  return (
    <Link href={href} className={`block rounded-xl border px-3 py-2 transition-all hover:scale-[1.01] ${STATUS_BG[status]}`}>
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-ink-muted/60 text-sm">▣</span>
          <span className="text-sm font-semibold text-ink">GPU {gpuIdx}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
          <span className={`text-xs font-mono font-semibold ${
            status === 'down'    ? 'text-red-400' :
            status === 'warning' ? 'text-amber-400' :
            status === 'pause'   ? 'text-slate-400' : 'text-emerald-400'
          }`}>{status.toUpperCase()}</span>
        </div>
      </div>
      {isConsolidated ? (
        sensors[0].detail && <p className="text-xs font-mono text-ink-muted/60">{sensors[0].detail}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs font-mono mb-2">
            {util && <span><span className="text-ink-muted/60">Util </span><span className="text-ink/85">{util.detail}</span></span>}
            {mem  && <span><span className="text-ink-muted/60">Mem  </span><span className="text-ink/85">{mem.detail}</span></span>}
            {temp && <span><span className="text-ink-muted/60">Temp </span><span className="text-ink/85">{temp.detail}</span></span>}
            {health && health.status !== 'up' && (
              <span className={health.status === 'down' ? 'text-red-400' : 'text-amber-400'}>{health.detail}</span>
            )}
          </div>
          {(downList.length > 0 || warnList.length > 0) && (
            <div className="flex flex-wrap gap-1">
              {downList.map(m => <span key={m} className="text-xs bg-red-600/20 text-red-300 rounded px-1.5 py-0.5">{m}</span>)}
              {warnList.map(m => <span key={m} className="text-xs bg-amber-600/20 text-amber-300 rounded px-1.5 py-0.5">{m}</span>)}
            </div>
          )}
        </>
      )}
    </Link>
  )
}

// ── 센서 카드 ──────────────────────────────────────────────────
function SensorCard({ sensor, deviceId }: { sensor: Sensor; deviceId: number }) {
  const sensorType = SENSOR_TYPE_MAP[sensor.type] ?? sensor.type.toLowerCase()
  const href = `/devices/${deviceId}/sensors/${sensorType}/${encodeURIComponent(sensor.sensor_name)}`
  return (
    <Link href={href} className={`block rounded-xl border px-3 py-2 transition-all hover:scale-[1.01] ${STATUS_BG[sensor.status]}`}>
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-ink-muted/60 text-sm">{TYPE_ICON[sensorType] ?? '◎'}</span>
          <span className="text-xs text-ink-muted font-mono">{TYPE_LABEL[sensorType] ?? sensor.type}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[sensor.status]}`} />
          <span className={`text-xs font-mono font-semibold ${
            sensor.status === 'down' ? 'text-red-400' :
            sensor.status === 'warning' ? 'text-amber-400' :
            sensor.status === 'pause' ? 'text-slate-400' : 'text-emerald-400'
          }`}>{sensor.status.toUpperCase()}</span>
        </div>
      </div>
      <p className="font-mono text-ink/85 text-sm font-semibold truncate">{sensor.name}</p>
      {sensor.detail && <p className="text-xs text-ink-muted/60 font-mono truncate">{sensor.detail}</p>}
    </Link>
  )
}

// ── ICMP / Port 센서 카드 ──────────────────────────────────────
function IcmpSensorCard({ sensor, deviceId }: { sensor: Sensor; deviceId: number }) {
  const isIcmp  = sensor.type === 'ICMP'
  const sType   = isIcmp ? 'icmp' : 'port'
  const href    = `/devices/${deviceId}/sensors/${sType}/${encodeURIComponent(sensor.sensor_name)}`
  const status  = sensor.status
  const latency = sensor.latency_ms
  const loss    = sensor.packet_loss_pct
  const isUp    = status === 'up'

  return (
    <Link href={href} className={`block rounded-xl border px-3 py-2 transition-all hover:scale-[1.01] ${STATUS_BG[status]}`}>
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-ink-muted/60 text-sm">{isIcmp ? '⟳' : '⇌'}</span>
          <span className="text-xs text-ink-muted font-mono">{isIcmp ? 'ICMP' : 'Port'}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
          <span className={`text-xs font-mono font-semibold ${
            status === 'down' ? 'text-red-400' : status === 'warning' ? 'text-amber-400' :
            status === 'pause' ? 'text-slate-400' : 'text-emerald-400'
          }`}>{status.toUpperCase()}</span>
        </div>
      </div>
      <p className="font-mono text-ink/85 text-sm font-semibold truncate mb-0.5">
        {isIcmp ? 'ICMP Ping' : `TCP : ${sensor.sensor_name}`}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs font-mono">
        <span>
          <span className="text-ink-muted/60">RTT  </span>
          <span className="text-ink/85">{isUp && latency != null ? `${latency.toFixed(1)} ms` : '—'}</span>
        </span>
        {isIcmp && (
          <span>
            <span className="text-ink-muted/60">Loss </span>
            <span className={
              !isUp || loss == null ? 'text-ink-muted/40' :
              loss >= 50 ? 'text-red-400' : loss > 0 ? 'text-amber-400' : 'text-ink/85'
            }>{isUp && loss != null ? `${loss.toFixed(0)}%` : '—'}</span>
          </span>
        )}
      </div>
    </Link>
  )
}

// ── 메인 페이지 ────────────────────────────────────────────────
export default function DeviceDetailPage() {
  const params   = useParams()
  const deviceId = Number(params.id)
  const [tab, setTab]                     = useState<TabKey>('sensors')
  const [showAddSensor, setShowAddSensor] = useState(false)

  const { data: device }  = useSWR<DeviceDetail>(api.devices.byId(deviceId), fetcher)
  const { data: summary } = useSWR<DashboardSummary>(api.dashboard.summary(), fetcher, { refreshInterval: 30000 })
  const sensorsKey = device ? api.settings.sensors.list(device.host_ip) : null
  const { mutate: mutateSensors } = useSWR<SensorConfig[]>(sensorsKey, fetcher)

  const hostIp   = device?.host_ip ?? ''
  const sensors  = (summary?.sensors ?? []).filter(s => s.host_ip === hostIp)
  const statuses = sensors.map(s => s.status as SensorStatus)
  const status   = worstStatus(statuses)
  const downCnt  = statuses.filter(s => s === 'down').length
  const warnCnt  = statuses.filter(s => s === 'warning').length

  const gpuSensors  = sensors.filter(s => s.type === 'GPU')
  const nodeSensors = sensors.filter(s => s.type === 'Node')
  const diskSensors = sensors.filter(s => s.type === 'Disk')
  const netSensors  = sensors.filter(s => s.type === 'Network')
  const connSensors = sensors.filter(s => s.type === 'ICMP' || s.type === 'Port')

  const deviceLabel = device?.display_name || hostIp

  // Group GPU sensors by index (e.g. "0_utilization" → index "0")
  const gpuGroups: [string, Sensor[]][] = []
  const gpuIdxMap = new Map<string, Sensor[]>()
  for (const s of gpuSensors) {
    const idx = s.sensor_name.split('_')[0]
    if (!gpuIdxMap.has(idx)) gpuIdxMap.set(idx, [])
    gpuIdxMap.get(idx)!.push(s)
  }
  for (const [idx, ss] of gpuIdxMap) gpuGroups.push([idx, ss])
  gpuGroups.sort((a, b) => Number(a[0]) - Number(b[0]))

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-ink-muted/60">
        <Link href="/devices" className="hover:text-ink/70 transition-colors">Devices</Link>
        <span>/</span>
        <span className="text-ink/85 font-mono">{deviceLabel}</span>
      </div>

      {/* Device header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${STATUS_DOT[status]}`} />
          <div>
            {device?.display_name && <h1 className="text-xl font-semibold text-ink">{device.display_name}</h1>}
            <p className={`font-mono ${device?.display_name ? 'text-sm text-ink-muted/60' : 'text-xl font-semibold text-ink'}`}>{hostIp || '...'}</p>
          </div>
          <div className="flex gap-1.5">
            {downCnt > 0 && <span className="rounded-full bg-red-600/30 text-red-300 text-xs px-2 py-0.5 font-semibold">DOWN {downCnt}</span>}
            {warnCnt > 0 && <span className="rounded-full bg-amber-600/30 text-amber-300 text-xs px-2 py-0.5 font-semibold">WARN {warnCnt}</span>}
            {downCnt === 0 && warnCnt === 0 && sensors.length > 0 && <span className="rounded-full bg-emerald-600/20 text-emerald-400 text-xs px-2 py-0.5 font-semibold">정상</span>}
          </div>
        </div>
        <button onClick={() => setShowAddSensor(true)}
          className="flex items-center gap-1.5 bg-accent hover:bg-accent/80 text-black text-sm font-mono font-semibold px-4 py-2 rounded-lg transition-colors">
          <span className="text-base leading-none">+</span> Add Sensor
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-surface-border">
        {([['sensors', 'Sensors'], ['settings', '⚙ Settings']] as [TabKey, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === key ? 'border-accent text-accent' : 'border-transparent text-ink-muted hover:text-ink/85'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Sensors tab */}
      {tab === 'sensors' && (
        <div className="space-y-6">
          {sensors.length === 0 ? (
            <div className="text-center py-12 text-ink-muted/50">
              <p className="text-4xl mb-3">◎</p>
              <p className="text-sm">No sensors active.</p>
              <p className="text-xs mt-1">Click &quot;+ Add Sensor&quot; to start monitoring.</p>
            </div>
          ) : (
            <>
              {gpuGroups.length > 0 && (
                <div>
                  <p className="text-xs text-ink-muted/50 uppercase tracking-wider font-mono mb-3">▣ GPU</p>
                  <div className="grid grid-cols-4 gap-2">
                    {gpuGroups.map(([idx, ss]) => (
                      <GpuIndexCard key={idx} gpuIdx={idx} sensors={ss} deviceId={deviceId} />
                    ))}
                  </div>
                </div>
              )}
              {nodeSensors.length > 0 && (
                <div>
                  <p className="text-xs text-ink-muted/50 uppercase tracking-wider font-mono mb-3">⬡ System</p>
                  <div className="grid grid-cols-4 gap-2">{nodeSensors.map(s => <SensorCard key={s.key} sensor={s} deviceId={deviceId} />)}</div>
                </div>
              )}
              {diskSensors.length > 0 && (
                <div>
                  <p className="text-xs text-ink-muted/50 uppercase tracking-wider font-mono mb-3">◫ Disk</p>
                  <div className="grid grid-cols-4 gap-2">{diskSensors.map(s => <SensorCard key={s.key} sensor={s} deviceId={deviceId} />)}</div>
                </div>
              )}
              {netSensors.length > 0 && (
                <div>
                  <p className="text-xs text-ink-muted/50 uppercase tracking-wider font-mono mb-3">⇆ Network</p>
                  <div className="grid grid-cols-4 gap-2">{netSensors.map(s => <SensorCard key={s.key} sensor={s} deviceId={deviceId} />)}</div>
                </div>
              )}
              {connSensors.length > 0 && (
                <div>
                  <p className="text-xs text-ink-muted/50 uppercase tracking-wider font-mono mb-3">⟳ Connectivity</p>
                  <div className="grid grid-cols-4 gap-2">{connSensors.map(s => <IcmpSensorCard key={s.key} sensor={s} deviceId={deviceId} />)}</div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Settings tab */}
      {tab === 'settings' && device && <SettingsTab hostIp={device.host_ip} />}

      {/* Add Sensor modal */}
      {showAddSensor && device && (
        <AddSensorModal
          hostIp={device.host_ip}
          onClose={() => setShowAddSensor(false)}
          onAdded={() => { mutateSensors?.(); globalMutate(api.dashboard.summary()) }}
        />
      )}
    </div>
  )
}
