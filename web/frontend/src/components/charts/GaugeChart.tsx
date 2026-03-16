'use client'
import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

interface Props {
  value: number
  max?: number
  unit?: string
  size?: number
  thresholds?: [number, number]
}

export default function GaugeChart({
  value,
  max = 100,
  unit = '%',
  size = 160,
  thresholds = [70, 90],
}: Props) {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!ref.current) return

    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    svg.attr('viewBox', `0 0 ${size} ${size}`)
       .attr('preserveAspectRatio', 'xMidYMid meet')

    const cx = size / 2
    const cy = size / 2
    const r  = size * 0.38
    const arc = d3.arc()

    const style = getComputedStyle(document.documentElement)
    const cText    = style.getPropertyValue('--c-text').trim()
    const cMuted   = style.getPropertyValue('--c-muted').trim()
    const cBorder  = style.getPropertyValue('--c-border').trim()

    // 배경 트랙
    svg.append('path')
      .attr('transform', `translate(${cx},${cy})`)
      .attr('d', arc({ innerRadius: r - 14, outerRadius: r, startAngle: -Math.PI * 0.75, endAngle: Math.PI * 0.75 }) as string)
      .attr('fill', `rgb(${cBorder})`)

    const pct = Math.min(value / max, 1)
    const color =
      pct >= thresholds[1] / 100 ? '#ef4444' :
      pct >= thresholds[0] / 100 ? '#f59e0b' :
      '#10b981'

    // 값 아크
    if (pct > 0) {
      const endAngle = -Math.PI * 0.75 + pct * Math.PI * 1.5
      svg.append('path')
        .attr('transform', `translate(${cx},${cy})`)
        .attr('d', arc({ innerRadius: r - 14, outerRadius: r, startAngle: -Math.PI * 0.75, endAngle }) as string)
        .attr('fill', color)
    }

    svg.append('text')
      .attr('x', cx).attr('y', cy + 8)
      .attr('text-anchor', 'middle')
      .attr('font-size', size * 0.18)
      .attr('font-weight', 'bold')
      .attr('font-family', 'monospace')
      .attr('fill', `rgb(${cText})`)
      .text(`${Math.round(value)}`)

    svg.append('text')
      .attr('x', cx).attr('y', cy + 8 + size * 0.13)
      .attr('text-anchor', 'middle')
      .attr('font-size', size * 0.1)
      .attr('fill', `rgb(${cMuted})`)
      .text(unit)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, max, unit, size, thresholds])

  return <svg ref={ref} width={size} height={size} style={{ display: 'block' }} />
}
