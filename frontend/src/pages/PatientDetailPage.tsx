import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { User, Loader2 } from 'lucide-react'
import { fetchPatient, type Patient } from '../lib/api'
import { fetchPatientGraphRaw, rawGraphToF } from '../lib/graphData'
import { LazyFeatureGraph, type FEdge, type FNode } from '../components/feature/LazyFeatureGraph'
import { ScribeWidget } from '../components/scribe/ScribeWidget'
import './PatientDetailPage.css'

export function PatientDetailPage() {
  const { id } = useParams()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [graph, setGraph] = useState<{ nodes: FNode[]; edges: FEdge[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setNotFound(false)
    if (!id) {
      setLoading(false)
      return
    }
    fetchPatient(id)
      .then((p) => {
        if (cancelled) return
        if (!p) {
          setNotFound(true)
          setPatient(null)
        } else {
          setPatient(p)
        }
      })
      .catch(() => {
        if (!cancelled) setNotFound(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    fetchPatientGraphRaw(id)
      .then((raw) => {
        if (!cancelled) setGraph(rawGraphToF(raw.nodes, raw.relationships))
      })
      .catch(() => {
        if (!cancelled) setGraph(null)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <div className="patient-detail page">
        <div className="patient-detail__loading">
          <Loader2 className="scribe-spin" size={22} />
          Loading patient…
        </div>
      </div>
    )
  }

  if (notFound || !patient) {
    return (
      <div className="patient-detail page">
        <h1 className="page__heading">Patient not found</h1>
        <p className="patient-detail__muted">
          No patient exists with id “{id}”. The backend may be offline or the id is invalid.
        </p>
      </div>
    )
  }

  const fullName = `${patient.first_name} ${patient.last_name}`.trim()
  const patientNodeId = graph?.nodes.find((n) => n.labels.includes('Patient'))?.id

  return (
    <div className="patient-detail page">
      <header className="patient-detail__head">
        <div className="patient-detail__avatar">
          <User size={20} />
        </div>
        <div>
          <h1 className="page__heading">{fullName}</h1>
          <p className="patient-detail__muted">
            {patient.id}
            {patient.email ? ` • ${patient.email}` : ''}
            {patient.gender ? ` • ${patient.gender}` : ''}
          </p>
        </div>
      </header>

      <div className="patient-detail__grid">
        <section className="patient-detail__scribe">
          <ScribeWidget patientId={patient.id} />
        </section>

        {graph && (
          <section className="patient-detail__graph">
            <h2 className="patient-detail__section-title">Clinical graph</h2>
            <LazyFeatureGraph
              nodes={graph.nodes}
              edges={graph.edges}
              centerId={patientNodeId}
              height={420}
            />
          </section>
        )}
      </div>
    </div>
  )
}