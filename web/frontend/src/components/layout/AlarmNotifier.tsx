'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { fetcher, api } from '@/lib/api'
import type { DashboardSummary, Sensor } from '@/lib/types'

export default function AlarmNotifier() {
  const router  = useRouter()
  const { data } = useSWR<DashboardSummary>(api.dashboard.summary(), fetcher, { refreshInterval: 15000 })
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [toastList, setToastList]  = useState<Sensor[]>([])
  const prevDownKeys = useRef<Set<string>>(new Set())

  const downSensors = (data?.sensors ?? []).filter(s => s.status === 'down')
  const downCount   = downSensors.length

  // 새로운 DOWN 센서 감지 시 토스트 추가
  useEffect(() => {
    const currentKeys = new Set(downSensors.map(s => s.key))
    const newDown = downSensors.filter(s => !prevDownKeys.current.has(s.key) && !dismissed.has(s.key))
    if (newDown.length > 0) {
      setToastList(prev => {
        const merged = [...prev, ...newDown]
        return merged.slice(-4) // 최대 4개
      })
    }
    prevDownKeys.current = currentKeys
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  function dismissToast(key: string) {
    setDismissed(prev => new Set([...prev, key]))
    setToastList(prev => prev.filter(s => s.key !== key))
  }

  function goToAlerts() {
    router.push('/alerts')
  }

  return (
    <>
      {/* ── 우측 상단 알람 벨 ── */}
      {downCount > 0 && (
        <button
          onClick={goToAlerts}
          className="fixed top-4 right-5 z-50 flex items-center gap-2 bg-red-600/90 hover:bg-red-600 text-white rounded-full px-3 py-1.5 text-xs font-mono font-semibold shadow-lg shadow-red-900/40 animate-pulse transition-all"
          title={`${downCount}개 센서 DOWN — 클릭하여 확인`}
        >
          <span className="text-sm">⚠</span>
          DOWN {downCount}
        </button>
      )}

      {/* ── 우측 하단 토스트 팝업 ── */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end pointer-events-none">
        {toastList.map(s => (
          <div
            key={s.key}
            className="pointer-events-auto flex items-start gap-3 bg-surface-card border border-red-500/40 rounded-xl px-4 py-3 shadow-xl shadow-black/40 max-w-sm animate-in slide-in-from-right-4 fade-in duration-300"
          >
            <span className="text-red-400 mt-0.5 flex-shrink-0">⚠</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-red-300 font-mono">DOWN</p>
              <p className="text-sm text-ink/85 font-mono truncate">{s.name}</p>
              <p className="text-xs text-ink-muted/60 font-mono">{s.host_ip}</p>
              {s.detail && <p className="text-xs text-ink-muted/50 mt-0.5 truncate">{s.detail}</p>}
            </div>
            <button
              onClick={() => dismissToast(s.key)}
              className="text-ink-muted/50 hover:text-ink/70 text-sm flex-shrink-0 ml-1"
            >✕</button>
          </div>
        ))}
      </div>
    </>
  )
}
