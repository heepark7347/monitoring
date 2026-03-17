'use client'
import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

export interface Series {
  name: string
  color: string
  data: { t: Date; v: number }[]
}

interface Props {
  series: Series[]
  unit?: string
  height?: number
  yMin?: number
  yMax?: number
}

const VW = 560  // viewBox 가상 너비 (고정)

export default function LineChart({ series, unit = '', height = 180, yMin, yMax }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const allPoints = series.flatMap(s => s.data)

    const sel = d3.select(svg)
    sel.selectAll('*').remove()

    sel.attr('viewBox', `0 0 ${VW} ${height}`)
       .attr('preserveAspectRatio', 'xMidYMid meet')

    if (allPoints.length === 0) {
      sel.append('text')
        .attr('x', VW / 2).attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#475569').attr('font-size', 13)
        .text('데이터 로딩 중...')
      return
    }

    const margin = { top: 10, right: 20, bottom: 30, left: 50 }
    const iw = VW    - margin.left - margin.right
    const ih = height - margin.top  - margin.bottom

    const g = sel.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const xDomain = d3.extent(allPoints, d => d.t) as [Date, Date]
    const rawMax  = d3.max(allPoints, d => d.v) ?? 1
    const yDomain: [number, number] = [yMin ?? 0, yMax ?? (rawMax * 1.15 || 1)]

    const x = d3.scaleTime().domain(xDomain).range([0, iw])
    const y = d3.scaleLinear().domain(yDomain).range([ih, 0])

    // 그리드
    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(() => ''))
      .call(ag => {
        ag.select('.domain').remove()
        ag.selectAll('line').attr('stroke', '#334155').attr('stroke-dasharray', '3,3')
      })

    // x축
    g.append('g')
      .attr('transform', `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => d3.timeFormat('%H:%M')(d as Date)))
      .call(ag => {
        ag.select('.domain').attr('stroke', '#475569')
        ag.selectAll('text').attr('fill', '#64748b').attr('font-size', 11)
        ag.selectAll('.tick line').remove()
      })

    // y축
    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat(d => `${d}${unit}`))
      .call(ag => {
        ag.select('.domain').remove()
        ag.selectAll('text').attr('fill', '#64748b').attr('font-size', 11)
        ag.selectAll('.tick line').remove()
      })

    // 시리즈 그리기
    series.forEach(s => {
      if (s.data.length === 0) return

      const area = d3.area<{ t: Date; v: number }>()
        .x(d => x(d.t)).y0(ih).y1(d => y(d.v)).curve(d3.curveMonotoneX)
      const line = d3.line<{ t: Date; v: number }>()
        .x(d => x(d.t)).y(d => y(d.v)).curve(d3.curveMonotoneX)

      g.append('path').datum(s.data)
        .attr('fill', s.color).attr('fill-opacity', 0.12).attr('d', area)
      g.append('path').datum(s.data)
        .attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', 2).attr('d', line)
    })

    // 범례
    if (series.length > 1) {
      const lg = sel.append('g').attr('transform', `translate(${margin.left + iw - series.length * 76}, 6)`)
      series.forEach((s, i) => {
        lg.append('rect').attr('x', i * 76).attr('y', 0).attr('width', 10).attr('height', 3).attr('fill', s.color)
        lg.append('text').attr('x', i * 76 + 14).attr('y', 4).attr('fill', '#94a3b8').attr('font-size', 11).text(s.name)
      })
    }

    // ── 툴팁 ───────────────────────────────────────────────────
    const bisect = d3.bisector((d: { t: Date; v: number }) => d.t).left

    // 수직선
    const vLine = g.append('line')
      .attr('stroke', '#64748b').attr('stroke-width', 1).attr('stroke-dasharray', '4,2')
      .attr('y1', 0).attr('y2', ih)
      .attr('visibility', 'hidden')

    // 툴팁 그룹
    const tip = sel.append('g').attr('visibility', 'hidden')

    // 마우스 이벤트 오버레이
    g.append('rect')
      .attr('width', iw).attr('height', ih)
      .attr('fill', 'none').attr('pointer-events', 'all')
      .on('mousemove', function(event: MouseEvent) {
        const [mx] = d3.pointer(event)
        const dateAtX = x.invert(mx)

        // 각 시리즈에서 가장 가까운 포인트 찾기
        const pts: { name: string; color: string; v: number; t: Date }[] = []
        for (const s of series) {
          if (s.data.length === 0) continue
          const idx = Math.min(bisect(s.data, dateAtX, 1), s.data.length - 1)
          const a = s.data[idx - 1], b = s.data[idx]
          const pt = (!a || (b && dateAtX.getTime() - a.t.getTime() > b.t.getTime() - dateAtX.getTime())) ? b : a
          if (pt) pts.push({ name: s.name, color: s.color, v: pt.v, t: pt.t })
        }
        if (pts.length === 0) return

        const timeStr = d3.timeFormat('%Y-%m-%d %H:%M:%S')(pts[0].t)
        const lines = [timeStr, ...pts.map(p => `${p.name}: ${p.v % 1 === 0 ? p.v : p.v.toFixed(2)}${unit}`)]

        const PAD = 7, LH = 15
        const boxW = Math.max(...lines.map(l => l.length)) * 6.5 + PAD * 2
        const boxH = lines.length * LH + PAD * 2

        tip.selectAll('*').remove()
        tip.append('rect')
          .attr('fill', '#0f172a').attr('stroke', '#334155').attr('rx', 5)
          .attr('width', boxW).attr('height', boxH).attr('opacity', 0.95)
        lines.forEach((line, i) => {
          const isTime = i === 0
          tip.append('text')
            .attr('x', PAD).attr('y', PAD + (i + 1) * LH - 3)
            .attr('fill', isTime ? '#94a3b8' : pts[i - 1]?.color ?? '#e2e8f0')
            .attr('font-size', 11).attr('font-family', 'monospace')
            .text(line)
        })

        // 툴팁 위치 조정 (화면 밖 넘치지 않도록)
        const tx = mx + margin.left + 12
        const adjustedX = tx + boxW > VW ? mx + margin.left - boxW - 10 : tx
        const adjustedY = margin.top + 4

        tip.attr('transform', `translate(${adjustedX},${adjustedY})`).attr('visibility', 'visible')
        vLine.attr('x1', mx).attr('x2', mx).attr('visibility', 'visible')
      })
      .on('mouseleave', function() {
        tip.attr('visibility', 'hidden')
        vLine.attr('visibility', 'hidden')
      })

  }, [series, unit, height, yMin, yMax])

  return (
    <svg
      ref={svgRef}
      style={{ width: '100%', height: `${height}px`, display: 'block' }}
    />
  )
}
