export default function StatCard({ label, value, tone, hint, accent }) {
  return (
    <div
      className={`stat-card${tone ? ` stat-${tone}` : ''}`}
      style={accent ? { '--stat-accent': accent } : undefined}
    >
      <div className="stat-value">{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  )
}
