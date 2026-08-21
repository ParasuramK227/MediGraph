import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api.js'
import Loading from '../components/Loading.jsx'
import ErrorState from '../components/ErrorState.jsx'
import StatCard from '../components/StatCard.jsx'
import Badge from '../components/Badge.jsx'
import TrendChart from '../components/TrendChart.jsx'

const STAT_ACCENTS = ['#2563eb', '#dc2626', '#7c3aed', '#0d9488', '#4f46e5', '#b45309', '#059669']

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

  const { counts, alerts, graph_totals, trends } = data
  const totalAlerts = alerts.out_of_stock.length + alerts.low_stock.length

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
        <StatCard label="Patients" value={counts.patients} accent={STAT_ACCENTS[0]} />
        <StatCard label="Diseases" value={counts.diseases} accent={STAT_ACCENTS[1]} />
        <StatCard label="Medicines" value={counts.medications} accent={STAT_ACCENTS[2]} />
        <StatCard label="Hospitals" value={counts.hospitals} accent={STAT_ACCENTS[3]} />
        <StatCard label="Pharmacies" value={counts.pharmacies} accent={STAT_ACCENTS[4]} />
        <StatCard label="Warehouses" value={counts.warehouses} accent={STAT_ACCENTS[5]} />
        <StatCard label="Drug Batches" value={counts.drug_batches} accent={STAT_ACCENTS[6]} />
      </div>

      {trends && (
        <div className="panel trend-panel">
          <h3>Activity trends</h3>
          <p className="trend-sub">
            Monthly aggregates computed directly from the knowledge graph
          </p>
          <div className="trend-grid">
            <div>
              <p className="trend-chart-title">Diagnoses per month — last 12 months</p>
              <TrendChart data={trends.diagnoses_per_month} color="#2563eb" />
            </div>
            <div>
              <p className="trend-chart-title">Batches expiring per month — next 12 months</p>
              <TrendChart data={trends.batches_expiring_per_month} color="#d97706" />
            </div>
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="panel">
          <h3>Supply-chain alerts</h3>
          <p className="muted">
            Out of stock: <strong>{alerts.out_of_stock.length}</strong> · Low stock:{' '}
            <strong>{alerts.low_stock.length}</strong> · Expiring ≤90 days:{' '}
            <strong>{alerts.expiring_batches.length}</strong>
          </p>
          {totalAlerts > 0 && (
            <p style={{ margin: '0 0 10px' }}>
              <Link to="/shortages" className="chip">
                View all shortages →
              </Link>
            </p>
          )}
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
            <>
              <p style={{ margin: '0 0 10px' }}>
                <Link to="/supply-chain" className="chip">
                  Open supply chain →
                </Link>
              </p>
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
