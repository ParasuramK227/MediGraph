const TONES = {
  ok: 'badge-ok',
  available: 'badge-ok',
  success: 'badge-ok',
  low: 'badge-warn',
  partial: 'badge-warn',
  warning: 'badge-warn',
  out: 'badge-bad',
  failure: 'badge-bad',
  expired: 'badge-bad',
}

export default function Badge({ value, children }) {
  const key = String(value ?? '').toLowerCase()
  return <span className={`badge ${TONES[key] || 'badge-neutral'}`}>{children ?? value}</span>
}
