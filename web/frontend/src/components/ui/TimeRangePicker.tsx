'use client'
import type { TimeRange } from '@/lib/types'

const OPTIONS: TimeRange[] = ['1H', '6H', '24H', '7D']

interface Props {
  value: TimeRange
  onChange: (v: TimeRange) => void
}

export default function TimeRangePicker({ value, onChange }: Props) {
  return (
    <div className="flex gap-1 bg-surface-card border border-surface-border rounded-lg p-1">
      {OPTIONS.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            value === opt
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

export function rangeToHours(range: TimeRange): number {
  return { '1H': 1, '6H': 6, '24H': 24, '7D': 168 }[range]
}
