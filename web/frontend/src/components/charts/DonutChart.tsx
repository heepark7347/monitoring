'use client'
import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

interface Props {
  used: number
  total: number
  size?: number
  label?: string
}

export default function DonutChart({ used, total, size = 140, label }: Props) {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!ref.current || total === 0) return
    const pct   = used / total
    const color = pct >= 0.9 ? '#ef4444' : pct >= 0.7 ? '#f59e0b' : '#3b82f6'

    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()

    const cx = size / 2
    const cy = size / 2
    const r  = size * 0.38
    const arc = d3.arc()

    // bg
    svg.append('path')
      .attr('transform', `translate(${cx},${cy})`)
      .attr('d', arc({ innerRadius: r - 16, outerRadius: r, startAngle: 0, endAngle: Math.PI * 2 }) as string)
      .attr('fill', '#1e293b')

    // used
    svg.append('path')
      .attr('transform', `translate(${cx},${cy})`)
      .attr('d', arc({ innerRadius: r - 16, outerRadius: r, startAngle: 0, endAngle: Math.PI * 2 * pct }) as string)
      .attr('fill', color)

    // center pct
    svg.append('text')
      .attr('x', cx).attr('y', cy + 5)
      .attr('text-anchor', 'middle')
      .attr('font-size', size * 0.16).attr('font-weight', 'bold').attr('font-family', 'monospace')
      .attr('fill', '#f1f5f9')
      .text(`${Math.round(pct * 100)}%`)

    if (label) {
      svg.append('text')
        .attr('x', cx).attr('y', cy + 5 + size * 0.13)
        .attr('text-anchor', 'middle')
        .attr('font-size', size * 0.09).attr('fill', '#64748b')
        .text(label)
    }
  }, [used, total, size, label])

  return <svg ref={ref} width={size} height={size} />
}
