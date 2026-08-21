import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api.js'
import Loading from '../components/Loading.jsx'
import ErrorState from '../components/ErrorState.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Badge from '../components/Badge.jsx'

export default function Medicines() {
  const [q, setQ] = useState('')
  const [meds, setMeds] = useState(null)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const load = (query = '') => {
    setError(null)
    setMeds(null)
    api
      .get(`/medicines?limit=100${query ? `&q=${encodeURIComponent(query)}` : ''}`)
      .then((d) => setMeds(d.medications))
      .catch(setError)
  }
  useEffect(() => load(), [])

  if (error) return <ErrorState error={error} onRetry={() => load(q)} />
  return (
    <div>
      <div className="page-header">
        <h1>Medicines</h1>
        <p>Search the formulary and inspect live availability</p>
      </div>
      <form
        className="search-row"
        onSubmit={(e) => {
          e.preventDefault()
          load(q)
        }}
      >
        <input
          type="text"
          placeholder="Search by brand or generic name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, maxWidth: 420 }}
        />
        <button className="btn" type="submit">Search</button>
      </form>

      {!meds ? (
        <Loading />
      ) : meds.length === 0 ? (
        <EmptyState title="No medicines found" />
      ) : (
        <div className="panel">
          <table className="data-table">
            <thead>
              <tr><th>Medicine</th><th>Generic</th><th>Form</th><th>Strength</th><th>Category</th></tr>
            </thead>
            <tbody>
              {meds.map((m) => (
                <tr key={m.id} className="clickable" onClick={() => navigate(`/medicines/${m.id}`)}>
                  <td>{m.name}</td>
                  <td className="muted">{m.generic_name}</td>
                  <td>{m.form}</td>
                  <td>{m.strength}</td>
                  <td><Badge value="neutral">{m.category}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
