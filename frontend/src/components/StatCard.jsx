export default function StatCard({ label, value, tone, hint }) {
  return (
    <div className={`stat-card${tone ? ` stat-${tone}` : ''}`}>
      <div className="stat-value">{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  )
}
