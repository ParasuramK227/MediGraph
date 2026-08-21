import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../services/api.js'
import Loading from '../components/Loading.jsx'
import ErrorState from '../components/ErrorState.jsx'
import Badge from '../components/Badge.jsx'
import StatCard from '../components/StatCard.jsx'

export default function MedicineDetail() {
  const { medicationId } = useParams()
  const [availability, setAvailability] = useState(null)
  const [alternatives, setAlternatives] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setAvailability(null)
    setAlternatives(null)
    setError(null)
    api.get(`/medicines/${medicationId}/availability`).then(setAvailability).catch(setError)
    api.get(`/medicines/${medicationId}/alternatives`)
      .then((d) => setAlternatives(d.alternatives)).catch(() => {})
  }, [medicationId])

  if (error) return <ErrorState error={error} />
  if (!availability) return <Loading label="Checking availability…" />

  const med = availability.medication
  return (
    <div>
      <div className="page-header">
        <h1>{med.name}</h1>
        <p>{med.generic_name} · {med.form} · {med.strength} · as of {availability.as_of}</p>
      </div>

      <div className="grid-stats">
        <StatCard
          label="Total valid stock"
          value={availability.total_quantity}
          tone={availability.status === 'out' ? 'bad' : availability.status === 'low' ? 'warn' : undefined}
          hint={<Badge value={availability.status} />}
        />
        <StatCard label="Hospitals stocking" value={availability.hospital_count} />
        <StatCard label="Pharmacies stocking" value={availability.pharmacy_count} />
        <StatCard label="Warehouses holding" value={availability.warehouse_count} />
      </div>

      <div className="panel">
        <h3>Availability by facility <span className="muted">(expired stock excluded)</span></h3>
        {availability.facilities.length === 0 ? (
          <p className="muted">No valid stock anywhere in the network.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Facility</th><th>Type</th><th className="num">Quantity</th><th>Earliest expiry</th><th>Last updated</th><th>Batches</th></tr>
            </thead>
            <tbody>
              {availability.facilities.map((f) => (
                <tr key={f.facility_id}>
                  <td>{f.facility_name}</td>
                  <td className="muted">{f.facility_type}</td>
                  <td className="num">
                    <Badge value={f.quantity === 0 ? 'out' : f.quantity < 20 ? 'low' : 'ok'}>
                      {f.quantity}
                    </Badge>
                  </td>
                  <td className="muted">{f.expiry_date || '—'}</td>
                  <td className="muted">{f.last_updated || '—'}</td>
                  <td className="muted">{f.batch_ids?.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid-2 section-gap">
        <div className="panel">
          <h3>Alternative medicines (graph-declared)</h3>
          {!alternatives ? (
            <Loading label="Loading…" />
          ) : alternatives.length === 0 ? (
            <p className="muted">No ALTERNATIVE_TO relationships for this medicine.</p>
          ) : (
            <table className="data-table">
              <thead><tr><th>Medicine</th><th className="num">Stock</th><th>Status</th></tr></thead>
              <tbody>
                {alternatives.map((a) => (
                  <tr key={a.id}>
                    <td><Link to={`/medicines/${a.id}`}>{a.name}</Link></td>
                    <td className="num">{a.total_quantity}</td>
                    <td><Badge value={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel">
          <h3>Explore further</h3>
          <p style={{ lineHeight: 2.2 }}>
            <Link className="chip" to={`/supply-chain?medicine=${medicationId}`}>
              Trace supply chain →
            </Link>{' '}
            <Link className="chip" to={`/knowledge-graph?entity=${medicationId}`}>
              Open in Knowledge Graph →
            </Link>{' '}
            <Link className="chip" to="/shortages">Shortage overview →</Link>
          </p>
          <p className="muted">Method: {availability.method}</p>
        </div>
      </div>
    </div>
  )
}
