import { useEffect, useState } from 'react'
import { HeartPulse, Loader2 } from 'lucide-react'
import { runCypher } from '../lib/api'
import { graphFromCypher } from '../lib/graphData'
import { LazyFeatureGraph, type FEdge, type FNode } from '../components/feature/LazyFeatureGraph'
import './TreatmentIntelligencePage.css'

export function TreatmentIntelligencePage() {
  const [graph, setGraph] = useState<{ nodes: FNode[]; edges: FEdge[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    runCypher(
      `MATCH (d:Disease)<-[:HAS_DIAGNOSIS]-(p:Patient)
       MATCH (med:Medication)-[:TREATS]->(d)
       OPTIONAL MATCH (p)-[r:RECEIVED_TREATMENT]->(t:Treatment)
       RETURN d, p, med, t, r
       LIMIT 600`,
    )
      .then((res) => {
        if (cancelled) return
        if (res.error) {
          setError(res.error)
          setGraph(null)
          return
        }
        setGraph(graphFromCypher(res))
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load treatment graph')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="page">
      <div className="ti__header">
        <div className="ti__icon">
          <HeartPulse size={16} />
        </div>
        <div>
          <h1 className="page__heading">Treatment Intelligence</h1>
          <p className="ti__sub">
            Cross-patient view: diagnoses, the medications that treat them, and the treatments
            patients actually receive.
          </p>
        </div>
      </div>

      <section className="ti__graph">
        {loading && (
          <div className="ti__loading">
            <Loader2 className="ti__spin" size={20} />
            Loading treatment intelligence graph…
          </div>
        )}
        {!loading && error && <div className="ti__error">{error}</div>}
        {!loading && !error && graph && (
          <LazyFeatureGraph nodes={graph.nodes} edges={graph.edges} height={560} />
        )}
      </section>
    </div>
  )
}