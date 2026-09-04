import { useEffect, useMemo, useState } from 'react'
import { Play, Loader2, Share2, ChevronDown, ChevronRight } from 'lucide-react'
import { runCypher } from '../lib/api'
import { graphFromCypher } from '../lib/graphData'
import { labelColor, chipTextContrast } from '../lib/graphColors'
import type { FNode, FEdge } from '../components/feature/LazyFeatureGraph'
import './GraphExplorerPage.css'

const PRESETS = [
  { label: 'Patients + diagnoses', query: 'MATCH (p:Patient)-[:HAS_DIAGNOSIS]->(d:Disease) RETURN p, d LIMIT 200' },
  { label: 'Medications → Diseases', query: 'MATCH (m:Medication)-[:TREATS]->(d:Disease) RETURN m, d LIMIT 200' },
  { label: 'Doctors → Patients', query: 'MATCH (doc:Doctor)-[:TREATS]->(p:Patient) RETURN doc, p LIMIT 60' },
  { label: 'Disease + symptoms', query: 'MATCH (d:Disease)-[:HAS_SYMPTOM]->(s:Symptom) RETURN d, s LIMIT 200' },
  { label: 'Recent notes', query: 'MATCH (p:Patient)-[:HAS_CONSULTATION_NOTE]->(n:ConsultationNote) RETURN n, p LIMIT 40' },
]

// Properties we consider "identifying" (shown first / emphasised); everything
// else is treated as a secondary metadata property.
const PRIMARY_KEYS = new Set([
  'name', 'first_name', 'last_name', 'id', 'title', 'summary', 'treatment_type',
  'specialization', 'disease', 'drug_name', 'my_notes',
])

const HIDDEN_KEYS = new Set(['element_id'])

function displayName(node: FNode): string {
  const p = node.properties ?? {}
  for (const k of PRIMARY_KEYS) {
    const v = p[k]
    if (typeof v === 'string' && v) return v
  }
  return node.label || `${node.labels?.[0] ?? 'Node'} ${node.id}`
}

function primaryLabel(node: FNode): string {
  return node.labels?.[0] ?? 'Node'
}

export function GraphExplorerPage() {
  const [query, setQuery] = useState('MATCH (n) RETURN n LIMIT 200')
  const [nodes, setNodes] = useState<FNode[]>([])
  const [edges, setEdges] = useState<FEdge[]>([])
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ran, setRan] = useState(false)

  const run = async (q: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await runCypher(q)
      if (res.error) {
        setError(res.error)
        setNodes([])
        setEdges([])
      } else {
        const g = graphFromCypher(res)
        setNodes(g.nodes)
        setEdges(g.edges)
        setExpanded(new Set())
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run query')
      setNodes([])
      setEdges([])
    } finally {
      setLoading(false)
      setRan(true)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    runCypher('MATCH (n) RETURN n LIMIT 200')
      .then((res) => {
        if (cancelled) return
        if (res.error) return
        const g = graphFromCypher(res)
        setNodes(g.nodes)
        setEdges(g.edges)
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
          setRan(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const n of nodes) {
      const label = primaryLabel(n)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [nodes])

  const filtered = useMemo(
    () => (typeFilter ? nodes.filter((n) => primaryLabel(n) === typeFilter) : nodes),
    [nodes, typeFilter],
  )

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const nodeRelationships = (id: string) =>
    edges.filter((e) => e.source === id || e.target === id)

  return (
    <div className="page">
      <div className="graph-explorer__head">
        <div className="graph-explorer__icon">
          <Share2 size={16} />
        </div>
        <div>
          <h1 className="page__heading">Knowledge Graph Browser</h1>
          <p className="graph-explorer__sub">
            Explore the clinical graph as a filterable table — run a query or use a preset, then
            filter by node type and expand any row to see its relationships.
          </p>
        </div>
      </div>

      <div className="graph-explorer__query card">
        <div className="graph-explorer__input">
          <textarea
            className="graph-explorer__text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void run(query)
              }
            }}
          />
          <button
            type="button"
            className="graph-explorer__run"
            title="Run query (Ctrl/Cmd+Enter)"
            onClick={() => void run(query)}
          >
            <Play size={15} />
          </button>
        </div>
        <div className="graph-explorer__presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="graph-explorer__preset"
              onClick={() => {
                setQuery(p.query)
                void run(p.query)
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="graph-explorer__card card">
        {loading && (
          <div className="graph-explorer__state">
            <Loader2 className="graph-explorer__spin" size={18} />
            Running query…
          </div>
        )}
        {!loading && error && <div className="graph-explorer__state graph-explorer__state--error">{error}</div>}
        {!loading && !error && ran && nodes.length === 0 && (
          <div className="graph-explorer__state">No nodes in this result.</div>
        )}
        {!loading && !error && nodes.length > 0 && (
          <>
            <div className="graph-explorer__filters">
              <button
                type="button"
                className={`graph-explorer__filter ${typeFilter === '' ? 'is-active' : ''}`}
                onClick={() => setTypeFilter('')}
              >
                All <span className="graph-explorer__count">{nodes.length}</span>
              </button>
              {typeCounts.map(([label, count]) => (
                <button
                  key={label}
                  type="button"
                  className={`graph-explorer__filter ${typeFilter === label ? 'is-active' : ''}`}
                  onClick={() => setTypeFilter(typeFilter === label ? '' : label)}
                >
                  <span
                    className="graph-explorer__dot"
                    style={{ background: labelColor(label) }}
                  />
                  {label} <span className="graph-explorer__count">{count}</span>
                </button>
              ))}
            </div>

            <div className="graph-explorer__table">
              <div className="graph-explorer__row graph-explorer__row--head">
                <div className="graph-explorer__col-chev" />
                <div className="graph-explorer__col-type">Type</div>
                <div className="graph-explorer__col-name">Name</div>
                <div className="graph-explorer__col-info">Details</div>
              </div>
              {filtered.map((n) => {
                const p = n.properties ?? {}
                const isOpen = expanded.has(n.id)
                const rels = nodeRelationships(n.id)
                const infoKeys = Object.keys(p).filter((k) => !PRIMARY_KEYS.has(k) && !HIDDEN_KEYS.has(k))
                const color = labelColor(primaryLabel(n))
                const textColor = chipTextContrast(color)
                return (
                  <div className="graph-explorer__node" key={n.id}>
                    <button
                      type="button"
                      className="graph-explorer__row graph-explorer__row--body"
                      onClick={() => toggleExpanded(n.id)}
                    >
                      <div className="graph-explorer__col-chev">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </div>
                      <div className="graph-explorer__col-type">
                        <span
                          className="graph-explorer__badge"
                          style={{ background: color, color: textColor }}
                        >
                          {primaryLabel(n)}
                        </span>
                      </div>
                      <div className="graph-explorer__col-name">{displayName(n)}</div>
                      <div className="graph-explorer__col-info">
                        <span className="graph-explorer__rel-count">
                          {rels.length} relationship{rels.length === 1 ? '' : 's'}
                        </span>
                        {infoKeys.slice(0, 3).map((k) => (
                          <span className="graph-explorer__prop" key={k}>
                            {k}: {String(p[k] ?? '')}
                          </span>
                        ))}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="graph-explorer__expanded">
                        <div className="graph-explorer__relationships">
                          {rels.length === 0 && <p className="graph-explorer__muted">No relationships in this result.</p>}
                          {rels.map((e, i) => {
                            const isSource = e.source === n.id
                            const otherId = isSource ? e.target : e.source
                            const other = nodes.find((x) => x.id === otherId)
                            return (
                              <div className="graph-explorer__rel" key={`${e.id}-${i}`}>
                                <span className="graph-explorer__rel-arrow">
                                  {isSource ? '→' : '←'}
                                </span>
                                <span className="graph-explorer__rel-type">{e.label || 'REL'}</span>
                                <span className="graph-explorer__rel-other">
                                  {other ? `${primaryLabel(other)} · ${displayName(other)}` : otherId}
                                </span>
                              </div>
                            )
                          })}
                        </div>

                        {infoKeys.length > 0 && (
                          <div className="graph-explorer__props">
                            <div className="graph-explorer__props-title">Properties</div>
                            <div className="graph-explorer__props-grid">
                              {infoKeys.map((k) => (
                                <div className="graph-explorer__prop-cell" key={k}>
                                  <span className="graph-explorer__prop-key">{k}</span>
                                  <span className="graph-explorer__prop-val">{String(p[k] ?? '')}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
