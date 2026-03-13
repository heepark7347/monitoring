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

    // viewBox 설정으로 컨테이너 크기와 무관하게 렌더링
    sel.attr('viewBox', `0 0 ${VW} ${height}`)
       .attr('preserveAspectRatio', 'xMidYMid meet')

    if (allPoints.length === 0) {
      // 데이터 없을 때 빈 배경만 표시
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

  }, [series, unit, height, yMin, yMax])

  return (
    <svg
      ref={svgRef}
      style={{ width: '100%', height: `${height}px`, display: 'block' }}
    />
  )
}
