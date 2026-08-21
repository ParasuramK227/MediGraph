export default function EmptyState({ title = 'No results', hint }) {
  return (
    <div className="state-block empty-block">
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
    </div>
  )
}
