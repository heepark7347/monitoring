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

export default function LineChart({ series, unit = '', height = 180, yMin, yMax }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef       = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return
    const allPoints = series.flatMap(s => s.data)
    if (allPoints.length === 0) return

    const width  = containerRef.current.clientWidth
    const margin = { top: 8, right: 16, bottom: 28, left: 52 }
    const iw     = width  - margin.left - margin.right
    const ih     = height - margin.top  - margin.bottom

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', width).attr('height', height)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const xDomain = d3.extent(allPoints, d => d.t) as [Date, Date]
    const rawMax  = d3.max(allPoints, d => d.v) ?? 1
    const yDomain: [number, number] = [yMin ?? 0, yMax ?? rawMax * 1.15 || 1]

    const x = d3.scaleTime().domain(xDomain).range([0, iw])
    const y = d3.scaleLinear().domain(yDomain).range([ih, 0])

    // grid
    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(() => ''))
      .call(ag => { ag.select('.domain').remove(); ag.selectAll('line').attr('stroke', '#1e293b') })

    // axes
    g.append('g')
      .attr('transform', `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => d3.timeFormat('%H:%M')(d as Date)))
      .call(ag => {
        ag.select('.domain').attr('stroke', '#334155')
        ag.selectAll('text').attr('fill', '#64748b').attr('font-size', '10px')
        ag.selectAll('.tick line').remove()
      })

    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat(d => `${d}${unit}`))
      .call(ag => {
        ag.select('.domain').remove()
        ag.selectAll('text').attr('fill', '#64748b').attr('font-size', '10px')
        ag.selectAll('.tick line').remove()
      })

    // series
    series.forEach(s => {
      if (s.data.length === 0) return

      const area = d3.area<{ t: Date; v: number }>()
        .x(d => x(d.t)).y0(ih).y1(d => y(d.v)).curve(d3.curveMonotoneX)
      const line = d3.line<{ t: Date; v: number }>()
        .x(d => x(d.t)).y(d => y(d.v)).curve(d3.curveMonotoneX)

      g.append('path').datum(s.data)
        .attr('fill', s.color).attr('fill-opacity', 0.08).attr('d', area)
      g.append('path').datum(s.data)
        .attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', 1.5).attr('d', line)
    })

    // legend (if multiple series)
    if (series.length > 1) {
      const lg = svg.append('g').attr('transform', `translate(${margin.left + iw - series.length * 80},8)`)
      series.forEach((s, i) => {
        lg.append('rect').attr('x', i * 80).attr('y', 0).attr('width', 10).attr('height', 3).attr('fill', s.color)
        lg.append('text').attr('x', i * 80 + 14).attr('y', 4).attr('fill', '#94a3b8').attr('font-size', '10px').text(s.name)
      })
    }

  }, [series, unit, height, yMin, yMax])

  return (
    <div ref={containerRef} className="w-full">
      <svg ref={svgRef} />
    </div>
  )
}
