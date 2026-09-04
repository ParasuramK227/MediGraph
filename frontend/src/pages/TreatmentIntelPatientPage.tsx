import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, TrendingUp, Users, Pill, Share2, Sparkles, CheckCircle2 } from 'lucide-react'
import { fetchTreatmentIntel, type TreatmentIntel } from '../lib/api'
import { LazyFeatureGraph, type FEdge, type FNode } from '../components/feature/LazyFeatureGraph'
import './TreatmentIntelPatientPage.css'

export function TreatmentIntelPatientPage() {
  const { id } = useParams()
  const [data, setData] = useState<TreatmentIntel | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setNotFound(false)
    setError(null)
    fetchTreatmentIntel(id)
      .then((d) => {
        if (cancelled) return
        if (!d) setNotFound(true)
        else setData(d)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // Build the patient pathway Vis.js network graph
  const pathwayGraph = useMemo(() => {
    if (!data) return { nodes: [], edges: [] }
    const nodes: FNode[] = []
    const edges: FEdge[] = []
    const seenNodes = new Set<string>()
    const seenEdges = new Set<string>()

    // 1. Center Target Patient Node
    const patientName = `${data.patient.first_name} ${data.patient.last_name}`.trim() || data.patient.id
    nodes.push({
      id: data.patient.id,
      label: patientName,
      labels: ['Patient'],
      properties: {
        id: data.patient.id,
        name: patientName,
        gender: data.patient.gender || 'Unknown',
        diagnoses_count: data.diagnoses.length,
        role: 'Target Patient',
      },
    })
    seenNodes.add(data.patient.id)

    // 2. Ranked Disease Nodes
    data.ranked.forEach((r) => {
      const dId = `disease_${r.disease.toLowerCase().replace(/\s+/g, '_')}`
      if (!seenNodes.has(dId)) {
        nodes.push({
          id: dId,
          label: r.disease,
          labels: ['Disease'],
          properties: {
            disease_name: r.disease,
            success_rank: `#${r.rank}`,
            control_score: r.score.toFixed(2),
            cohort_size: r.cohort_size,
            cohort_controlled: r.patients_with_labs,
            evidence: r.note,
          },
        })
        seenNodes.add(dId)
      }
      const eId = `p_to_${dId}`
      if (!seenEdges.has(eId)) {
        edges.push({
          id: eId,
          source: data.patient.id,
          target: dId,
          label: `Rank #${r.rank} (${r.score.toFixed(2)})`,
        })
        seenEdges.add(eId)
      }
    })

    // 3. Recommended Treatments / Medications
    const treatmentList = data.treatments?.treatments || []
    treatmentList.forEach((tr) => {
      const tId = `treat_${tr.name.toLowerCase().replace(/\s+/g, '_')}`
      const isMed =
        tr.name.toLowerCase().includes('tablet') ||
        tr.name.toLowerCase().includes('mg') ||
        tr.name.toLowerCase().includes('injection') ||
        tr.name.toLowerCase().includes('oral') ||
        tr.name.toLowerCase().includes('metformin') ||
        tr.name.toLowerCase().includes('potassium')

      if (!seenNodes.has(tId)) {
        nodes.push({
          id: tId,
          label: tr.name.length > 26 ? tr.name.slice(0, 24) + '…' : tr.name,
          labels: isMed ? ['Medication'] : ['Treatment'],
          properties: {
            full_name: tr.name,
            classification: isMed ? 'Pharmacotherapy (Medication)' : 'Clinical Procedure / Treatment',
            indicated_disease: tr.disease,
            success_rate: tr.success_rate != null ? `${Math.round(tr.success_rate * 100)}%` : 'Standard',
            description: tr.description || '',
          },
        })
        seenNodes.add(tId)
      }

      // Edge from Treatment to Disease
      const dId = `disease_${tr.disease.toLowerCase().replace(/\s+/g, '_')}`
      if (seenNodes.has(dId)) {
        const edgeTD = `td_${tId}_${dId}`
        if (!seenEdges.has(edgeTD)) {
          edges.push({
            id: edgeTD,
            source: tId,
            target: dId,
            label: 'TREATS',
          })
          seenEdges.add(edgeTD)
        }
      }

      // Edge from Patient to Treatment
      const edgePT = `pt_${data.patient.id}_${tId}`
      if (!seenEdges.has(edgePT)) {
        edges.push({
          id: edgePT,
          source: data.patient.id,
          target: tId,
          label: tr.success_rate != null ? `${Math.round(tr.success_rate * 100)}% Success` : 'RECOMMENDED',
        })
        seenEdges.add(edgePT)
      }

      // Similar patients who recovered on this treatment
      tr.recovered_patients.forEach((rec) => {
        if (!seenNodes.has(rec.id)) {
          nodes.push({
            id: rec.id,
            label: rec.name,
            labels: ['Patient'],
            properties: {
              id: rec.id,
              name: rec.name,
              cohort_status: 'Recovered / Biomarker Controlled',
              treatment_effective: tr.name,
            },
          })
          seenNodes.add(rec.id)
        }
        const edgeRec = `rec_${rec.id}_${tId}`
        if (!seenEdges.has(edgeRec)) {
          edges.push({
            id: edgeRec,
            source: rec.id,
            target: tId,
            label: 'RECOVERED ON',
          })
          seenEdges.add(edgeRec)
        }
      })
    })

    // 4. Similar Patients (Top 4)
    data.similar_patients.slice(0, 4).forEach((s) => {
      if (!seenNodes.has(s.id)) {
        nodes.push({
          id: s.id,
          label: s.name,
          labels: ['Patient'],
          properties: {
            id: s.id,
            name: s.name,
            similarity: `${Math.round(s.similarity * 100)}%`,
            shared_diagnoses: s.overlap,
            cohort_type: 'Similar Cohort Patient',
          },
        })
        seenNodes.add(s.id)
      }
      const edgeSim = `sim_${s.id}_${data.patient.id}`
      if (!seenEdges.has(edgeSim)) {
        edges.push({
          id: edgeSim,
          source: s.id,
          target: data.patient.id,
          label: `${Math.round(s.similarity * 100)}% Similar`,
        })
        seenEdges.add(edgeSim)
      }
    })

    return { nodes, edges }
  }, [data])

  if (loading) {
    return (
      <div className="tii page">
        <div className="tii__loading">
          <Loader2 className="tii__spin" size={20} />
          Computing ranked diagnoses…
        </div>
      </div>
    )
  }

  if (notFound || !data) {
    return (
      <div className="tii page">
        <h1 className="page__heading">Patient not found</h1>
        <p className="tii__muted">
          No patient with id “{id}” exists. <Link to="/treatment-intelligence">Back to Treatment Intelligence</Link>
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="tii page">
        <div className="tii__error">{error}</div>
      </div>
    )
  }

  const name = `${data.patient.first_name} ${data.patient.last_name}`.trim() || data.patient.id
  const maxScore = Math.max(...data.ranked.map((r) => Math.max(r.score, 0.01)), 0.01)

  return (
    <div className="tii page">
      <div className="tii__topbar">
        <Link to="/treatment-intelligence" className="tii__back">
          <ArrowLeft size={15} />
          Treatment Intelligence
        </Link>
        <Link to={`/patients/${data.patient.id}`} className="tii__back">
          Patient profile
        </Link>
      </div>

      <header className="tii__head">
        <div className="tii__icon">
          <TrendingUp size={16} />
        </div>
        <div>
          <h1 className="page__heading">{name}</h1>
          <p className="tii__muted">
            Ranked diagnoses ({data.patient.id}) — scored by clinical biomarker control
            and positive recovery outcomes across similar patient cohorts. Deterministic, no LLM.
          </p>
        </div>
      </header>

      {/* Vis.js Interactive Pathway Graph */}
      <section className="tii__graph-card">
        <div className="tii__graph-header">
          <div className="tii__graph-title">
            <Share2 size={16} />
            <span>Interactive Care & Treatment Pathway</span>
          </div>
          <span className="tii__graph-hint">
            Click any node to view clinical properties and provenance
          </span>
        </div>
        <div className="tii__graph-canvas">
          <LazyFeatureGraph
            nodes={pathwayGraph.nodes}
            edges={pathwayGraph.edges}
            centerId={data.patient.id}
            height={480}
          />
        </div>
      </section>

      <section className="tii__ranked">
        <div className="tii__ranked-header">
          <h2 className="tii__section-title">
            <Sparkles size={16} /> Ranked Diagnoses by Biomarker Control
          </h2>
          <span className="tii__ranked-sub">
            Rank 1 indicates the condition with highest verified therapeutic control in this cohort.
          </span>
        </div>

        {data.ranked.length === 0 && (
          <div className="tii__empty">This patient has no diagnoses to rank.</div>
        )}
        {data.ranked.map((r) => {
          const pct = Math.max(0, Math.min(100, (r.score / maxScore) * 100))
          return (
            <div className="tii__rank" key={r.disease}>
              <div className="tii__rank-top">
                <div className="tii__rank-rank">
                  <span className="tii__rank-num">{r.rank}</span>
                </div>
                <div className="tii__rank-main">
                  <div className="tii__rank-name">
                    {r.disease}
                    {r.confidence_low && <span className="tii__low">low confidence</span>}
                  </div>
                  <div className="tii__rank-bar">
                    <div className="tii__rank-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="tii__rank-note">{r.note}</div>
                </div>
                <div className="tii__rank-score-wrap">
                  <div className="tii__rank-score">{r.score.toFixed(2)}</div>
                  <div className="tii__rank-score-label">Control Score</div>
                </div>
              </div>
            </div>
          )
        })}
      </section>

      <section className="tii__treatments">
        <h2 className="tii__section-title">
          <Pill size={16} /> Recommended treatments & medications
        </h2>
        {!data.treatments ? (
          <p className="tii__muted">Treatment recommendations are not available.</p>
        ) : !data.treatments.has_data || data.treatments.treatments.length === 0 ? (
          <div className="tii__treatments-note">
            {data.treatments.note ?? 'No treatment data available to rank.'}
          </div>
        ) : (
          <>
            {!data.treatments.has_outcome && data.treatments.note && (
              <div className="tii__treatments-note">{data.treatments.note}</div>
            )}
            <div className="tii__treatment-list">
              {data.treatments.treatments.map((tr) => {
                const pct = tr.success_rate == null
                  ? 0
                  : Math.max(0, Math.min(100, tr.success_rate * 100))
                return (
                  <div className="tii__treatment" key={`${tr.name}-${tr.rank ?? ''}-${tr.disease}`}>
                    <div className="tii__treatment-rail">
                      <span className="tii__treatment-rank">
                        {tr.rank ?? '—'}
                      </span>
                    </div>
                    <div className="tii__treatment-main">
                      <div className="tii__treatment-name">
                        {tr.name}
                        <span className="tii__treatment-disease">{tr.disease}</span>
                      </div>
                      {tr.success_rate != null ? (
                        <div className="tii__rank-bar">
                          <div className="tii__rank-fill" style={{ width: `${pct}%` }} />
                        </div>
                      ) : (
                        <div className="tii__treatment-rate-na">success rate n/a</div>
                      )}
                      <div className="tii__treatment-meta">
                        {tr.success_rate != null && (
                          <span className="tii__treatment-rate">
                            <CheckCircle2 size={13} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
                            {Math.round(pct)}% cohort efficacy
                          </span>
                        )}
                        {tr.description ? (
                          <span className="tii__treatment-desc">{tr.description}</span>
                        ) : null}
                      </div>
                      {tr.recovered_patients.length > 0 && (
                        <div className="tii__treatment-recovered">
                          <strong>Similar patients with controlled outcomes:</strong>{' '}
                          {tr.recovered_patients.map((r) => r.name).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>

      <section className="tii__similar">
        <h2 className="tii__section-title">
          <Users size={16} /> Similar patients cohort
        </h2>
        {data.similar_patients.length === 0 ? (
          <p className="tii__muted">No similar patients found.</p>
        ) : (
          <ul className="tii__similar-list">
            {data.similar_patients.map((s) => (
              <li key={s.id}>
                <Link to={`/treatment-intelligence/${s.id}`} className="tii__similar-link">
                  <span>{s.name}</span>
                  <span className="tii__similar-meta">
                    {Math.round(s.similarity * 100)}% similar • {s.overlap} shared diagnosis
                    {s.overlap === 1 ? '' : 'es'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

