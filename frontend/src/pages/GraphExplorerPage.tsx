import { useEffect, useState } from 'react'
import { Play, Loader2, Share2 } from 'lucide-react'
import { runCypher } from '../lib/api'
import { graphFromCypher } from '../lib/graphData'
import { LazyFeatureGraph, type FEdge, type FNode } from '../components/feature/LazyFeatureGraph'
import './GraphExplorerPage.css'

const PRESETS = [
  { label: 'Patients + diagnoses', query: 'MATCH (p:Patient)-[:HAS_DIAGNOSIS]->(d:Disease) RETURN p, d LIMIT 60' },
  { label: 'Medications → Diseases', query: 'MATCH (m:Medication)-[:TREATS]->(d:Disease) RETURN m, d LIMIT 60' },
  { label: 'Doctors → Patients', query: 'MATCH (doc:Doctor)-[:TREATS]->(p:Patient) RETURN doc, p LIMIT 40' },
  { label: 'Disease + symptoms', query: 'MATCH (d:Disease)-[:HAS_SYMPTOM]->(s:Symptom) RETURN d, s LIMIT 60' },
  { label: 'Recent notes', query: 'MATCH (p:Patient)-[:HAS_CONSULTATION_NOTE]->(n:ConsultationNote) RETURN n, p LIMIT 30' },
]

export function GraphExplorerPage() {
  const [query, setQuery] = useState('MATCH (n) RETURN n LIMIT 40')
  const [nodes, setNodes] = useState<FNode[]>([])
  const [edges, setEdges] = useState<FEdge[]>([])
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
    runCypher('MATCH (n) RETURN n LIMIT 40')
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

  return (
    <div className="page">
      <div className="graph-explorer__head">
        <div className="graph-explorer__icon">
          <Share2 size={16} />
        </div>
        <div>
          <h1 className="page__heading">Knowledge Graph Explorer</h1>
          <p className="graph-explorer__sub">
            Explore the clinical graph with ad-hoc queries and scoped presets.
          </p>
        </div>
      </div>

      <div className="graph-explorer__query">
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

      <div className="graph-explorer__canvas">
        {loading && (
          <div className="graph-explorer__state">
            <Loader2 className="graph-explorer__spin" size={18} />
            Running query…
          </div>
        )}
        {!loading && error && <div className="graph-explorer__state graph-explorer__state--error">{error}</div>}
        {!loading && !error && ran && nodes.length === 0 && (
          <div className="graph-explorer__state">No graph nodes in this result.</div>
        )}
        {!loading && !error && nodes.length > 0 && (
          <LazyFeatureGraph nodes={nodes} edges={edges} height={600} />
        )}
      </div>
    </div>
  )
}