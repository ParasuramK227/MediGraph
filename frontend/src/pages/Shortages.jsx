import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api.js'
import Loading from '../components/Loading.jsx'
import ErrorState from '../components/ErrorState.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Badge from '../components/Badge.jsx'
import StatCard from '../components/StatCard.jsx'

export default function Shortages() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const load = () => {
    setError(null)
    api.get('/supply-chain/shortages').then(setData).catch(setError)
  }
  useEffect(load, [])

  if (error) return <ErrorState error={error} onRetry={load} />
  if (!data) return <Loading label="Detecting shortages…" />

  return (
    <div>
      <div className="page-header">
        <h1>Drug Shortages</h1>
        <p>Deterministic detection over valid (non-expired) stock across the network</p>
      </div>

      <div className="grid-stats">
        <StatCard
          label="Out of stock"
          value={data.out_of_stock_count}
          tone={data.out_of_stock_count > 0 ? 'bad' : undefined}
        />
        <StatCard
          label="Low stock"
          value={data.low_stock_count}
          tone={data.low_stock_count > 0 ? 'warn' : undefined}
        />
      </div>

      {data.shortages.length === 0 ? (
        <EmptyState title="No shortages detected" hint="All medicines are above the low-stock threshold." />
      ) : (
        <div className="panel">
          <table className="data-table">
            <thead>
              <tr><th>Medicine</th><th>Category</th><th className="num">Retail</th><th className="num">Warehouse</th><th className="num">Total</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {data.shortages.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="muted">{s.category}</td>
                  <td className="num">{s.retail_stock}</td>
                  <td className="num">{s.warehouse_stock}</td>
                  <td className="num"><strong>{s.total_stock}</strong></td>
                  <td><Badge value={s.status} /></td>
                  <td>
                    <Link className="btn btn-secondary btn-small" to={`/medicines/${s.id}`}>
                      Inspect
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted section-gap">Method: {data.provenance.method}</p>
        </div>
      )}
    </div>
  )
}
