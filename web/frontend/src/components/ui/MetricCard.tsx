interface MetricCardProps {
  label: string
  value: string | number | null
  unit?: string
  sub?: string
  accent?: string  // tailwind color class for value
}

export default function MetricCard({ label, value, unit, sub, accent = 'text-slate-100' }: MetricCardProps) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-4">
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold font-mono ${accent}`}>
        {value === null || value === undefined ? '—' : value}
        {unit && <span className="text-sm font-normal text-slate-400 ml-1">{unit}</span>}
      </p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}
