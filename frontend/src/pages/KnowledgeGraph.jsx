import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../services/api.js'
import Loading from '../components/Loading.jsx'
import ErrorState from '../components/ErrorState.jsx'
import GraphCanvas from '../components/GraphCanvas.jsx'

const TYPE_COLORS = {
  Patient: '#2563eb', Disease: '#dc2626', Symptom: '#f59e0b', Treatment: '#059669',
  Medication: '#7c3aed', DrugBatch: '#0d9488', Manufacturer: '#64748b',
  Supplier: '#94a3b8', Distributor: '#a8a29e', Warehouse: '#b45309',
  Hospital: '#1d4ed8', Pharmacy: '#4f46e5',
}

export default function KnowledgeGraph() {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [schema, setSchema] = useState(null)
  const [typeFilters, setTypeFilters] = useState(null)
  const [relFilters, setRelFilters] = useState(null)
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [selected, setSelected] = useState(null)
  const [details, setDetails] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fitKey, setFitKey] = useState(0)
  // Focus mode: panels hidden until toggled so the graph gets full space.
  const [showLeft, setShowLeft] = useState(false)
  const [showRight, setShowRight] = useState(false)

  // initial schema + focused subgraph (deep link ?entity=…)
  useEffect(() => {
    api.get('/graph/schema').then((s) => {
      setSchema(s)
      setTypeFilters(Object.fromEntries(s.searchable_types.map((t) => [t, true])))
    }).catch(setError)
    const entity = params.get('entity')
    if (entity) {
      loadSubgraph(entity)
    } else {
      // default focus: a medication with supply-chain links
      api.get('/medicines?limit=1').then((d) => {
        if (d.medications?.length) loadSubgraph(d.medications[0].id)
      }).catch(setError)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function loadSubgraph(entityId) {
    setLoading(true)
    setError(null)
    api.get(`/graph/entity/${encodeURIComponent(entityId)}/subgraph`)
      .then((d) => {
        setNodes(d.nodes)
        setEdges(d.edges)
        setSelected({ id: d.center })
        setFitKey((k) => k + 1)
        return api.get(`/graph/entity/${encodeURIComponent(entityId)}`)
      })
      .then((d) => d && setDetails(d))
      .catch(setError)
      .finally(() => setLoading(false))
    setParams({ entity: entityId })
  }

  const doSearch = useCallback((e) => {
    e?.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    api.get(`/graph/search?q=${encodeURIComponent(query.trim())}&limit=15`)
      .then((d) => {
        if (d.entities.length === 0) {
          setError(new Error(`No entities matching "${query}".`))
          return
        }
        loadSubgraph(d.entities[0].id)
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [query])

  async function expandNode(nodeId) {
    setLoading(true)
    try {
      const d = await api.get(`/graph/entity/${encodeURIComponent(nodeId)}/neighbors`)
      setNodes((prev) => mergeNodes(prev, d.nodes))
      setEdges((prev) => mergeEdges(prev, d.edges))
      setFitKey((k) => k + 1)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  function selectNode(node) {
    setSelected(node)
    setShowRight(true)
    api.get(`/graph/entity/${encodeURIComponent(node.id)}`).then(setDetails).catch(() => {})
  }

  const visibleNodes = useMemo(() => {
    if (!typeFilters) return nodes
    return nodes.filter((n) => typeFilters[n.type] !== false || n.id === selected?.id)
  }, [nodes, typeFilters, selected])

  const visibleEdges = useMemo(() => {
    if (!relFilters) return edges
    return edges.filter((e) => relFilters[e.type] !== false)
  }, [edges, relFilters])

  const nodeTypesInGraph = useMemo(
    () => [...new Set(nodes.map((n) => n.type))].sort(),
    [nodes],
  )
  const relTypesInGraph = useMemo(
    () => [...new Set(edges.map((e) => e.type))].sort(),
    [edges],
  )

  if (error && !nodes.length) return <ErrorState error={error} onRetry={() => window.location.reload()} />

  const layoutClass = `${showLeft ? '' : 'no-left'}${showRight ? '' : ' no-right'}`

  return (
    <div>
      <div className="kg-titlebar">
        <div>
          <h1>Knowledge Graph</h1>
          <p>
            Explore relationships across clinical and pharmaceutical data
            {schema && ` · ${schema.node_types.reduce((a, n) => a + n.count, 0)} nodes`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={`btn btn-small ${showLeft ? '' : 'btn-secondary'}`}
            onClick={() => setShowLeft((v) => !v)}
          >
            Search &amp; filters
          </button>
          <button
            type="button"
            className={`btn btn-small ${showRight ? '' : 'btn-secondary'}`}
            onClick={() => setShowRight((v) => !v)}
          >
            Details
          </button>
        </div>
      </div>

      <div className={`kg-layout ${layoutClass}`}>
        {/* left: search + filters */}
        {showLeft && (
          <div className="kg-panel">
            <form onSubmit={doSearch}>
              <input
                type="text"
                placeholder="Search entities…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ width: '100%', marginBottom: 8 }}
              />
              <button className="btn btn-small" style={{ width: '100%' }} type="submit">
                Search &amp; focus
              </button>
            </form>

            <div className="filter-group section-gap">
              <h4>Entity types in view</h4>
              {nodeTypesInGraph.map((t) => (
                <label key={t} className="check-row">
                  <input
                    type="checkbox"
                    checked={typeFilters ? typeFilters[t] !== false : true}
                    onChange={(e) =>
                      setTypeFilters((prev) => ({ ...prev, [t]: e.target.checked }))
                    }
                  />
                  <span className="legend-dot" style={{ background: TYPE_COLORS[t] || '#64748b' }} />
                  {t}
                </label>
              ))}
            </div>

            <div className="filter-group">
              <h4>Relationships in view</h4>
              {relTypesInGraph.length === 0 && <span className="muted">—</span>}
              {relTypesInGraph.map((t) => (
                <label key={t} className="check-row">
                  <input
                    type="checkbox"
                    checked={relFilters ? relFilters[t] !== false : true}
                    onChange={(e) =>
                      setRelFilters((prev) => ({ ...prev, [t]: e.target.checked }))
                    }
                  />
                  {t}
                </label>
              ))}
            </div>

            {schema && (
              <div className="filter-group">
                <h4>Graph schema</h4>
                <p className="muted" style={{ margin: 0 }}>
                  {schema.node_types.reduce((acc, n) => acc + n.count, 0)} nodes ·{' '}
                  {schema.relationship_types.reduce((acc, r) => acc + r.count, 0)} relationships
                </p>
              </div>
            )}
          </div>
        )}

        {/* center: canvas */}
        <div className="kg-canvas-wrap">
          <div className="kg-toolbar">
            <button
              className="btn btn-secondary btn-small"
              disabled={!selected}
              onClick={() => selected && expandNode(selected.id)}
            >
              Expand neighbors
            </button>
            <button className="btn btn-secondary btn-small" onClick={() => setFitKey((k) => k + 1)}>
              Re-layout
            </button>
          </div>
          {loading && <Loading label="Loading subgraph…" />}
          <GraphCanvas
            nodes={visibleNodes}
            edges={visibleEdges}
            onSelect={selectNode}
            fitKey={fitKey}
          />
        </div>

        {/* right: details */}
        {showRight && (
          <div className="kg-panel">
            {!details ? (
              <p className="muted">Click a node to inspect it.</p>
            ) : (
              <>
                <p className="detail-type">{details.type}</p>
                <h2 className="detail-title">{details.label}</h2>
                <button
                  className="btn btn-small section-gap"
                  onClick={() => expandNode(details.id)}
                >
                  Expand neighbors
                </button>

                <div className="filter-group section-gap">
                  <h4>Properties</h4>
                  <table className="props-table">
                    <tbody>
                      {Object.entries(details.properties || {})
                        .filter(([k]) => k !== 'id')
                        .map(([k, v]) => (
                          <tr key={k}><td>{k}</td><td>{String(v ?? '—')}</td></tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                <RelationshipList entityId={details.id} onJump={loadSubgraph} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function RelationshipList({ entityId, onJump }) {
  const [rels, setRels] = useState(null)

  useEffect(() => {
    setRels(null)
    api.get(`/graph/entity/${encodeURIComponent(entityId)}/neighbors`)
      .then((d) => setRels(d.relationships))
      .catch(() => setRels([]))
  }, [entityId])

  if (!rels) return <Loading label="Loading relationships…" />
  if (rels.length === 0) return <p className="muted">No relationships.</p>

  return (
    <div className="filter-group">
      <h4>Relationships ({rels.length})</h4>
      {rels.slice(0, 40).map((r, i) => (
        <div
          key={`${r.other_id}-${r.type}-${i}`}
          className="rel-item"
          onClick={() => onJump(r.other_id)}
          title="Focus this entity"
        >
          <span>{r.other_label}</span>
          <span className="rel-type">{r.direction === 'out' ? '→' : '←'} {r.type}</span>
        </div>
      ))}
    </div>
  )
}

function mergeNodes(prev, incoming) {
  const seen = new Set(prev.map((n) => n.id))
  return [...prev, ...incoming.filter((n) => !seen.has(n.id))]
}
function mergeEdges(prev, incoming) {
  const seen = new Set(prev.map((e) => `${e.source}|${e.target}|${e.type}`))
  return [...prev, ...incoming.filter((e) => !seen.has(`${e.source}|${e.target}|${e.type}`))]
}
