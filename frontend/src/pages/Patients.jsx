import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api.js'
import Loading from '../components/Loading.jsx'
import ErrorState from '../components/ErrorState.jsx'
import EmptyState from '../components/EmptyState.jsx'

export default function Patients() {
  const [q, setQ] = useState('')
  const [patients, setPatients] = useState(null)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const load = (query = '') => {
    setError(null)
    setPatients(null)
    api
      .get(`/patients?limit=50${query ? `&q=${encodeURIComponent(query)}` : ''}`)
      .then((d) => setPatients(d.patients))
      .catch(setError)
  }
  useEffect(() => load(), [])

  if (error) return <ErrorState error={error} onRetry={() => load(q)} />
  return (
    <div>
      <div className="page-header">
        <h1>Patients</h1>
        <p>Synthetic clinical records in the knowledge graph</p>
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
          placeholder="Search patients by name or id…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, maxWidth: 420 }}
        />
        <button className="btn" type="submit">Search</button>
      </form>

      {!patients ? (
        <Loading />
      ) : patients.length === 0 ? (
        <EmptyState title="No patients found" hint="Try a different search term." />
      ) : (
        <div className="panel">
          <table className="data-table">
            <thead>
              <tr><th>ID</th><th>Name</th><th>Age</th><th>Gender</th><th>Blood type</th></tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => navigate(`/patients/${p.id}`)}>
                  <td className="muted">{p.id}</td>
                  <td>{p.name}</td>
                  <td className="num">{p.age}</td>
                  <td>{p.gender}</td>
                  <td>{p.blood_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
