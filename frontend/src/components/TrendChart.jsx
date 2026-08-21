const W = 440
const H = 190
const PAD = { top: 12, right: 10, bottom: 26, left: 34 }

export default function TrendChart({ data = [], color = '#2563eb', height = 'auto' }) {
  if (!data.length) return <p className="muted">No data.</p>

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const counts = data.map((d) => d.count)
  const max = Math.max(...counts, 1)

  const x = (i) => PAD.left + (data.length === 1 ? innerW / 2 : (i * innerW) / (data.length - 1))
  const y = (v) => PAD.top + innerH * (1 - v / max)

  const points = data.map((d, i) => `${x(i)},${y(d.count)}`)
  const linePath = `M${points.join(' L')}`
  const baseY = PAD.top + innerH
  const areaPath = `${linePath} L${x(data.length - 1)},${baseY} L${x(0)},${baseY} Z`

  const gridVals = [max, max / 2, 0]
  const labelEvery = Math.ceil(data.length / 6)

  return (
    <svg className="trend-svg" viewBox={`0 0 ${W} ${H}`} style={{ height }} role="img">
      {gridVals.map((v) => (
        <g key={v}>
          <line
            x1={PAD.left} x2={W - PAD.right}
            y1={y(v)} y2={y(v)}
            stroke="var(--border)" strokeWidth="1"
            strokeDasharray={v === 0 ? 'none' : '3 4'}
          />
          <text x={PAD.left - 6} y={y(v) + 3.5} textAnchor="end" fontSize="9.5" fill="var(--text-dim)">
            {Math.round(v)}
          </text>
        </g>
      ))}

      <path d={areaPath} fill={color} opacity="0.13" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      {data.map((d, i) => (
        <g key={d.label}>
          <circle cx={x(i)} cy={y(d.count)} r="3" fill={color}>
            <title>{`${d.label}: ${d.count}`}</title>
          </circle>
          {(i % labelEvery === 0 || i === data.length - 1) && (
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="9.5" fill="var(--text-dim)">
              {d.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}
