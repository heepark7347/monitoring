'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import * as d3 from 'd3'

export interface PingSeriesDef {
  key:   string
  label: string
  color: string
  axis:  'left' | 'right'   // left = ms, right = %
  data:  { t: Date; v: number | null }[]
}

interface Props {
  series: PingSeriesDef[]
  height?: number
}

const VW = 560

export default function PingComboChart({ series, height = 240 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  function toggle(key: string) {
    setHidden(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const visible = series.filter(s => !hidden.has(s.key))
    const sel = d3.select(svg)
    sel.selectAll('*').remove()
    sel.attr('viewBox', `0 0 ${VW} ${height}`).attr('preserveAspectRatio', 'xMidYMid meet')

    const allPoints = visible.flatMap(s => s.data.filter(d => d.v != null))
    if (allPoints.length === 0) {
      sel.append('text')
        .attr('x', VW / 2).attr('y', height / 2)
        .attr('text-anchor', 'middle').attr('fill', '#475569').attr('font-size', 13)
        .text('데이터 없음')
      return
    }

    const margin = { top: 12, right: 50, bottom: 30, left: 52 }
    const iw = VW    - margin.left - margin.right
    const ih = height - margin.top  - margin.bottom

    const g = sel.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    // X 축
    const allTimes = allPoints.map(d => d.t as Date)
    const x = d3.scaleTime()
      .domain([d3.min(allTimes)!, d3.max(allTimes)!])
      .range([0, iw])

    // 왼쪽 Y축 (ms)
    const leftVisible = visible.filter(s => s.axis === 'left')
    const leftMax = d3.max(leftVisible.flatMap(s =>
      s.data.filter(d => d.v != null).map(d => d.v as number)
    )) ?? 10
    const yLeft = d3.scaleLinear().domain([0, leftMax * 1.2 || 1]).range([ih, 0])

    // 오른쪽 Y축 (%)
    const yRight = d3.scaleLinear().domain([0, 100]).range([ih, 0])

    // 그리드 (왼쪽 기준)
    g.append('g')
      .call(d3.axisLeft(yLeft).ticks(4).tickSize(-iw).tickFormat(() => ''))
      .call(ag => {
        ag.select('.domain').remove()
        ag.selectAll('line').attr('stroke', '#334155').attr('stroke-dasharray', '3,3')
      })

    // X축
    g.append('g')
      .attr('transform', `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => d3.timeFormat('%H:%M')(d as Date)))
      .call(ag => {
        ag.select('.domain').attr('stroke', '#475569')
        ag.selectAll('text').attr('fill', '#64748b').attr('font-size', 11)
        ag.selectAll('.tick line').remove()
      })

    // 왼쪽 Y축 레이블 (ms)
    g.append('g')
      .call(d3.axisLeft(yLeft).ticks(4).tickFormat(d => `${d}ms`))
      .call(ag => {
        ag.select('.domain').remove()
        ag.selectAll('text').attr('fill', '#64748b').attr('font-size', 11)
        ag.selectAll('.tick line').remove()
      })

    // 오른쪽 Y축 레이블 (%)
    const rightVisible = visible.filter(s => s.axis === 'right')
    if (rightVisible.length > 0) {
      g.append('g')
        .attr('transform', `translate(${iw},0)`)
        .call(d3.axisRight(yRight).ticks(4).tickFormat(d => `${d}%`))
        .call(ag => {
          ag.select('.domain').remove()
          ag.selectAll('text').attr('fill', '#64748b').attr('font-size', 11)
          ag.selectAll('.tick line').remove()
        })
    }

    // 시리즈 그리기
    for (const s of visible) {
      const yScale = s.axis === 'left' ? yLeft : yRight
      const validData = s.data.filter(d => d.v != null) as { t: Date; v: number }[]
      if (validData.length === 0) continue

      const area = d3.area<{ t: Date; v: number }>()
        .x(d => x(d.t)).y0(ih).y1(d => yScale(d.v)).curve(d3.curveMonotoneX)
      const line = d3.line<{ t: Date; v: number }>()
        .x(d => x(d.t)).y(d => yScale(d.v)).curve(d3.curveMonotoneX)

      g.append('path').datum(validData)
        .attr('fill', s.color).attr('fill-opacity', 0.08).attr('d', area)
      g.append('path').datum(validData)
        .attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', 1.5).attr('d', line)
    }

    // 툴팁
    const bisect = d3.bisector((d: { t: Date; v: number | null }) => d.t).left
    const vLine = g.append('line')
      .attr('stroke', '#64748b').attr('stroke-width', 1).attr('stroke-dasharray', '4,2')
      .attr('y1', 0).attr('y2', ih).attr('visibility', 'hidden')
    const tip = sel.append('g').attr('visibility', 'hidden')

    g.append('rect')
      .attr('width', iw).attr('height', ih)
      .attr('fill', 'none').attr('pointer-events', 'all')
      .on('mousemove', function(event: MouseEvent) {
        const [mx] = d3.pointer(event)
        const dateAtX = x.invert(mx)

        const pts: { label: string; color: string; v: number | null; unit: string; t: Date }[] = []
        for (const s of visible) {
          if (s.data.length === 0) continue
          const idx = Math.min(bisect(s.data, dateAtX, 1), s.data.length - 1)
          const a = s.data[idx - 1], b = s.data[idx]
          const pt = (!a || (b && dateAtX.getTime() - a.t.getTime() > b.t.getTime() - dateAtX.getTime())) ? b : a
          if (pt) pts.push({ label: s.label, color: s.color, v: pt.v, unit: s.axis === 'left' ? 'ms' : '%', t: pt.t })
        }
        if (pts.length === 0) return

        const timeStr = d3.timeFormat('%Y-%m-%d %H:%M:%S')(pts[0].t)
        const lines = [
          timeStr,
          ...pts.map(p => `${p.label}: ${p.v != null ? (Number.isInteger(p.v) ? p.v : p.v.toFixed(2)) + p.unit : '—'}`)
        ]
        const PAD = 7, LH = 15
        const boxW = Math.max(...lines.map(l => l.length)) * 6.5 + PAD * 2
        const boxH = lines.length * LH + PAD * 2

        tip.selectAll('*').remove()
        tip.append('rect')
          .attr('fill', '#0f172a').attr('stroke', '#334155').attr('rx', 5)
          .attr('width', boxW).attr('height', boxH).attr('opacity', 0.95)
        lines.forEach((line, i) => {
          tip.append('text')
            .attr('x', PAD).attr('y', PAD + (i + 1) * LH - 3)
            .attr('fill', i === 0 ? '#94a3b8' : (pts[i - 1]?.color ?? '#e2e8f0'))
            .attr('font-size', 11).attr('font-family', 'monospace')
            .text(line)
        })

        const tx = mx + margin.left + 12
        const adjustedX = tx + boxW > VW ? mx + margin.left - boxW - 10 : tx
        tip.attr('transform', `translate(${adjustedX},${margin.top + 4})`).attr('visibility', 'visible')
        vLine.attr('x1', mx).attr('x2', mx).attr('visibility', 'visible')
      })
      .on('mouseleave', function() {
        tip.attr('visibility', 'hidden')
        vLine.attr('visibility', 'hidden')
      })

  }, [series, hidden, height])

  // 테이블용: 수집 시각별 행 구성
  const tableRows = useMemo(() => {
    // 모든 시리즈의 타임스탬프 합집합 (ms 기준 dedup)
    const tsSet = new Map<number, Date>()
    for (const s of series) {
      for (const d of s.data) tsSet.set(d.t.getTime(), d.t)
    }
    const times = Array.from(tsSet.values()).sort((a, b) => b.getTime() - a.getTime())

    // 각 시리즈의 데이터를 Map<ms, value>으로 인덱싱
    const seriesMaps = series.map(s => {
      const m = new Map<number, number | null>()
      for (const d of s.data) m.set(d.t.getTime(), d.v)
      return m
    })

    return times.map(t => ({
      t,
      values: seriesMaps.map(m => m.get(t.getTime()) ?? null),
    }))
  }, [series])

  function fmtVal(v: number | null, axis: 'left' | 'right') {
    if (v == null) return '—'
    const num = Number.isInteger(v) ? String(v) : v.toFixed(2)
    return num + (axis === 'left' ? ' ms' : '%')
  }

  return (
    <div>
      <svg ref={svgRef} style={{ width: '100%', height: `${height}px`, display: 'block' }} />
      {/* 토글 버튼 */}
      <div className="flex flex-wrap gap-2 mt-4">
        {series.map(s => {
          const isOn = !hidden.has(s.key)
          return (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono border transition-all ${
                isOn
                  ? 'border-transparent font-semibold'
                  : 'bg-transparent border-surface-border/50 text-ink-muted/50 hover:text-ink-muted'
              }`}
              style={isOn ? { backgroundColor: s.color + '22', borderColor: s.color + '80', color: s.color } : {}}
            >
              <span
                className="h-2 w-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: isOn ? s.color : '#475569' }}
              />
              {s.label}
              <span className="opacity-50">{s.axis === 'left' ? 'ms' : '%'}</span>
            </button>
          )
        })}
      </div>

      {/* 수집 데이터 테이블 */}
      {tableRows.length > 0 && (
        <div className="mt-4 overflow-auto max-h-64 rounded-lg border border-surface-border">
          <table className="w-full text-xs font-mono border-collapse">
            <thead className="sticky top-0 bg-surface-card z-10">
              <tr>
                <th className="text-left px-3 py-2 text-ink-muted/60 font-normal border-b border-surface-border whitespace-nowrap">
                  수집 시각
                </th>
                {series.map(s => (
                  <th
                    key={s.key}
                    className="text-right px-3 py-2 font-normal border-b border-surface-border whitespace-nowrap"
                    style={{ color: s.color }}
                  >
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, i) => (
                <tr key={row.t.getTime()} className={i % 2 === 0 ? 'bg-surface-base/30' : ''}>
                  <td className="px-3 py-1.5 text-ink-muted/60 whitespace-nowrap">
                    {d3.timeFormat('%m-%d %H:%M:%S')(row.t)}
                  </td>
                  {series.map((s, si) => (
                    <td
                      key={s.key}
                      className="px-3 py-1.5 text-right whitespace-nowrap"
                      style={{ color: row.values[si] != null ? s.color : '#475569' }}
                    >
                      {fmtVal(row.values[si], s.axis)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
