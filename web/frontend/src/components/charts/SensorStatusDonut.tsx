'use client'
import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

interface Segment {
  label: string
  value: number
  color: string
}

interface Props {
  up: number
  down: number
  warning: number
  pause: number
  size?: number
}

const SEGMENTS = (up: number, down: number, warning: number, pause: number): Segment[] => [
  { label: 'Up',      value: up,      color: '#10b981' },
  { label: 'Down',    value: down,    color: '#ef4444' },
  { label: 'Warning', value: warning, color: '#f59e0b' },
  { label: 'Pause',   value: pause,   color: '#64748b' },
]

export default function SensorStatusDonut({ up, down, warning, pause, size = 200 }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const total = up + down + warning + pause

  useEffect(() => {
    if (!ref.current) return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()

    const cx = size / 2
    const cy = size / 2
    const outerR = size * 0.42
    const innerR = outerR - size * 0.12
    const segs   = SEGMENTS(up, down, warning, pause).filter(s => s.value > 0)

    if (total === 0) {
      // 빈 링
      svg.append('circle')
        .attr('cx', cx).attr('cy', cy)
        .attr('r', outerR).attr('fill', 'none')
        .attr('stroke', '#334155').attr('stroke-width', size * 0.12)
      svg.append('text')
        .attr('x', cx).attr('y', cy + 5)
        .attr('text-anchor', 'middle')
        .attr('font-size', size * 0.14).attr('font-family', 'monospace')
        .attr('fill', '#64748b')
        .text('—')
      return
    }

    const pie = d3.pie<Segment>().value(d => d.value).sort(null).padAngle(0.025)
    const arc = d3.arc<d3.PieArcDatum<Segment>>()
      .innerRadius(innerR).outerRadius(outerR)

    const g = svg.append('g').attr('transform', `translate(${cx},${cy})`)

    g.selectAll('path')
      .data(pie(segs))
      .enter().append('path')
      .attr('d', arc)
      .attr('fill', d => d.data.color)
      .attr('stroke', '#0f172a')
      .attr('stroke-width', 1.5)

    // 중앙 텍스트
    svg.append('text')
      .attr('x', cx).attr('y', cy - size * 0.05)
      .attr('text-anchor', 'middle')
      .attr('font-size', size * 0.2).attr('font-weight', 'bold').attr('font-family', 'monospace')
      .attr('fill', '#f1f5f9')
      .text(total)

    svg.append('text')
      .attr('x', cx).attr('y', cy + size * 0.1)
      .attr('text-anchor', 'middle')
      .attr('font-size', size * 0.08).attr('fill', '#64748b')
      .text('sensors')
  }, [up, down, warning, pause, size, total])

  return <svg ref={ref} width={size} height={size} style={{ display: 'block' }} />
}
