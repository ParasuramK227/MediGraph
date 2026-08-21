export default function ErrorState({ error, onRetry }) {
  return (
    <div className="state-block error-block">
      <h3>Something went wrong</h3>
      <p>{error?.message || 'Unexpected error'}</p>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}
