import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '../services/api.js'
import Loading from '../components/Loading.jsx'
import ErrorState from '../components/ErrorState.jsx'
import EmptyState from '../components/EmptyState.jsx'
import GraphCanvas from '../components/GraphCanvas.jsx'

export default function SupplyChain() {
  const [params, setParams] = useSearchParams()
  const selected = params.get('medicine') || ''
  const [meds, setMeds] = useState(null)
  const [trace, setTrace] = useState(null)
  const [error, setError] = useState(null)
  const [fitKey, setFitKey] = useState(0)

  useEffect(() => {
    api.get('/medicines?limit=100').then((d) => setMeds(d.medications)).catch(setError)
  }, [])

  useEffect(() => {
    if (!selected) {
      setTrace(null)
      return
    }
    setTrace(null)
    setError(null)
    api.get(`/medicines/${selected}/supply-chain`).then((d) => {
      setTrace(d)
      setFitKey((k) => k + 1)
    }).catch(setError)
  }, [selected])

  return (
    <div>
      <div className="page-header">
        <h1>Supply Chain</h1>
        <p>Graph-based tracing: manufacturer → supplier → distributor → warehouse → facility</p>
      </div>

      <div className="search-row">
        <select
          value={selected}
          onChange={(e) => setParams(e.target.value ? { medicine: e.target.value } : {})}
          style={{ minWidth: 280 }}
        >
          <option value="">Select a medicine…</option>
          {(meds || []).map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {error && <ErrorState error={error} />}
      {!selected && !error && <EmptyState title="Select a medicine to trace its supply chain" />}
      {selected && !trace && !error && <Loading label="Traversing the graph…" />}

      {trace && (
        <>
          <div className="panel" style={{ height: '52vh', padding: 0 }}>
            <GraphCanvas
              nodes={trace.graph.nodes}
              edges={trace.graph.edges}
              layoutName="breadthfirst"
              fitKey={fitKey}
            />
          </div>
          <p className="muted section-gap">
            Medicine: <strong>{trace.medicine.name}</strong> · {trace.graph.nodes.length} nodes ·{' '}
            {trace.graph.edges.length} relationships · Method: {trace.method} ·{' '}
            <Link className="chip" to={`/knowledge-graph?entity=${trace.medicine.id}`}>
              Open in Knowledge Graph →
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
