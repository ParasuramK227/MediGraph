import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FolderKanban, Loader2 } from 'lucide-react'
import { runCypher } from '../lib/api'
import { graphFromCypher } from '../lib/graphData'
import { LazyFeatureGraph, type FEdge, type FNode } from '../components/feature/LazyFeatureGraph'
import './SectorViewPage.css'

export function SectorViewPage() {
  const { id } = useParams()
  const diseaseName = id ? id.replace(/-/g, ' ').trim() : ''
  const [graph, setGraph] = useState<{ nodes: FNode[]; edges: FEdge[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [diseaseLabel, setDiseaseLabel] = useState<string | null>(null)

  useEffect(() => {
    if (!diseaseName) {
      setLoading(false)
      setError('No sector selected.')
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setDiseaseLabel(null)
    runCypher(
      `MATCH (d:Disease) WHERE toLower(d.name) = toLower($name)
       MATCH (p:Patient)-[hd:HAS_DIAGNOSIS]->(d)
       OPTIONAL MATCH (p)-[st:SIMILAR_TO]->(q:Patient)
       OPTIONAL MATCH (p)-[hsm:HAS_SYMPTOM]->(s:Symptom)
       RETURN d, p, q, s, hd, st, hsm`,
      { name: diseaseName },
    )
      .then((res) => {
        if (cancelled) return
        if (res.error) {
          setError(res.error)
          setGraph(null)
          return
        }
        setGraph(graphFromCypher(res))
        // Pull the canonical disease name from the result so the heading uses
        // proper casing even though the route slug was lowercased.
        const diseaseNode = res.rows
          .flat()
          .find(
            (c) =>
              typeof c === 'object' &&
              c !== null &&
              (c as { _labels?: string[] })._labels?.includes('Disease'),
          )
        const name = (diseaseNode as { properties?: { name?: string } } | null)?.properties?.name
        if (name) setDiseaseLabel(name)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load cohort')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [diseaseName])

  const patientNodeId = graph?.nodes.find((n) => n.labels.includes('Disease'))?.id

  return (
    <div className="page">
      <div className="sector-view__header">
        <div className="sector-view__icon">
          <FolderKanban size={16} />
        </div>
        <div>
          <h1 className="page__heading">{diseaseLabel ?? (diseaseName || 'Sector')}</h1>
          <p className="sector-view__sub">
            Disease-focused cohort: all patients diagnosed with this condition, their
            shared cohorts, and presenting symptoms.
          </p>
        </div>
      </div>

      <section className="sector-view__graph">
        {loading && (
          <div className="sector-view__loading">
            <Loader2 className="sector-view__spin" size={20} />
            Loading cohort graph…
          </div>
        )}
        {!loading && error && <div className="sector-view__error">{error}</div>}
        {!loading && !error && graph && (
          <LazyFeatureGraph nodes={graph.nodes} edges={graph.edges} centerId={patientNodeId} height={520} />
        )}
        {!loading && !error && graph && graph.nodes.length === 0 && (
          <div className="sector-view__error">No data found for this sector.</div>
        )}
      </section>
    </div>
  )
}