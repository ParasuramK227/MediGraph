import { useEffect, useState } from 'react'
import { api } from '../services/api.js'
import Loading from '../components/Loading.jsx'
import ErrorState from '../components/ErrorState.jsx'
import StatCard from '../components/StatCard.jsx'
import Badge from '../components/Badge.jsx'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const load = () => {
    setError(null)
    api.get('/dashboard').then(setData).catch(setError)
  }
  useEffect(load, [])

  if (error) return <ErrorState error={error} onRetry={load} />
  if (!data) return <Loading label="Loading dashboard…" />

  const { counts, alerts, graph_totals } = data
  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>
          Healthcare knowledge graph overview — {graph_totals.nodes} nodes,{' '}
          {graph_totals.relationships} relationships
        </p>
      </div>

      <div className="grid-stats">
        <StatCard label="Patients" value={counts.patients} />
        <StatCard label="Diseases" value={counts.diseases} />
        <StatCard label="Medicines" value={counts.medications} />
        <StatCard label="Hospitals" value={counts.hospitals} />
        <StatCard label="Pharmacies" value={counts.pharmacies} />
        <StatCard label="Warehouses" value={counts.warehouses} />
        <StatCard label="Drug Batches" value={counts.drug_batches} />
      </div>

      <div className="grid-2">
        <div className="panel">
          <h3>Supply-chain alerts</h3>
          <p className="muted">
            Out of stock: <strong>{alerts.out_of_stock.length}</strong> · Low stock:{' '}
            <strong>{alerts.low_stock.length}</strong> · Expiring ≤90 days:{' '}
            <strong>{alerts.expiring_batches.length}</strong>
          </p>
          <table className="data-table">
            <thead>
              <tr><th>Medicine</th><th>Total stock</th><th>Status</th></tr>
            </thead>
            <tbody>
              {[...alerts.out_of_stock, ...alerts.low_stock].slice(0, 8).map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="num">{s.total_stock}</td>
                  <td><Badge value={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h3>Batches expiring within 90 days</h3>
          {alerts.expiring_batches.length === 0 ? (
            <p className="muted">No batches expiring soon.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Batch</th><th>Medicine</th><th>Expiry</th></tr>
              </thead>
              <tbody>
                {alerts.expiring_batches.slice(0, 8).map((b) => (
                  <tr key={b.batch_id}>
                    <td>{b.batch_id}</td>
                    <td>{b.medicine}</td>
                    <td><Badge value="warning">{b.expiry_date}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
