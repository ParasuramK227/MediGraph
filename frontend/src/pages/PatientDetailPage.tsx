import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  User, Loader2, FileText, Stethoscope, Microscope, ClipboardList,
  Users, ArrowRight,
} from 'lucide-react'
import { fetchPatient, fetchPatientIntel, type Patient, type PatientIntel } from '../lib/api'
import { fetchPatientGraphRaw, rawGraphToF } from '../lib/graphData'
import { LazyFeatureGraph, type FEdge, type FNode } from '../components/feature/LazyFeatureGraph'
import { ScribeWidget } from '../components/scribe/ScribeWidget'
import './PatientDetailPage.css'

export function PatientDetailPage() {
  const { id } = useParams()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [intel, setIntel] = useState<PatientIntel | null>(null)
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
    fetchPatientIntel(id)
      .then((d) => {
        if (!cancelled) setIntel(d)
      })
      .catch(() => {
        if (!cancelled) setIntel(null)
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
  const history = intel?.medical_history

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
        <Link
          to={`/treatment-intelligence/${patient.id}`}
          className="patient-detail__intel-link"
        >
          Treatment Intelligence
          <ArrowRight size={14} />
        </Link>
      </header>

      <div className="patient-detail__grid">
        <div className="patient-detail__main">
          <section className="patient-detail__card">
            <h2 className="patient-detail__section-title">
              <FileText size={16} /> Clinical summary
            </h2>
            <p className="patient-detail__summary">
              {intel?.summary ?? 'Loading summary…'}
            </p>
          </section>

          <section className="patient-detail__card">
            <h2 className="patient-detail__section-title">
              <ClipboardList size={16} /> Medical history
            </h2>
            {!intel || (history && !history.diagnoses.length && !history.treatments.length && !history.labs.length && !history.notes.length) ? (
              <p className="patient-detail__muted">No medical history on record.</p>
            ) : (
              <div className="patient-detail__history">
                {history?.diagnoses.length ? (
                  <div className="patient-detail__history-block">
                    <div className="patient-detail__history-label">Diagnoses</div>
                    <div className="patient-detail__chips">
                      {history.diagnoses.map((d) => (
                        <span className="patient-detail__chip patient-detail__chip--disease" key={d}>
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {history?.treatments.length ? (
                  <div className="patient-detail__history-block">
                    <div className="patient-detail__history-label">
                      <Stethoscope size={13} /> Treatments
                    </div>
                    <ul className="patient-detail__list">
                      {history.treatments.map((t) => (
                        <li key={t.id}>
                          {t.type ?? 'Treatment'} — {t.date ?? 'n/a'}
                          {t.cost ? ` (${t.cost})` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {history?.labs.length ? (
                  <div className="patient-detail__history-block">
                    <div className="patient-detail__history-label">
                      <Microscope size={13} /> Lab tests
                    </div>
                    <ul className="patient-detail__list">
                      {history.labs.map((l) => (
                        <li key={l.id}>
                          {l.name}: {l.result} {l.unit ?? ''}
                          <span className={`patient-detail__lab-status patient-detail__lab-status--${(l.status || '').toLowerCase()}`}>
                            {l.status}
                          </span>
                          {l.date ? ` — ${l.date}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {history?.notes.length ? (
                  <div className="patient-detail__history-block">
                    <div className="patient-detail__history-label">
                      <ClipboardList size={13} /> Consultation notes
                    </div>
                    <ul className="patient-detail__list patient-detail__list--notes">
                      {history.notes.map((n) => (
                        <li key={n.id}>
                          <div className="patient-detail__note-title">
                            {new Date(n.created_at).toLocaleDateString()}
                          </div>
                          <div>{n.summary}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>

        <div className="patient-detail__aside">
          <section className="patient-detail__card">
            <h2 className="patient-detail__section-title">
              <Users size={16} /> Similar patients
            </h2>
            {!intel || !intel.similar_patients.length ? (
              <p className="patient-detail__muted">No similar patients found.</p>
            ) : (
              <ul className="patient-detail__similar">
                {intel.similar_patients.map((s) => (
                  <li key={s.id ?? s.patient_id}>
                    <Link
                      to={`/patients/${s.id ?? s.patient_id}`}
                      className="patient-detail__similar-link"
                    >
                      <span>{s.name}</span>
                      <span className="patient-detail__similar-meta">
                        {Math.round(s.similarity * 100)}% similar
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="patient-detail__card">
            <h2 className="patient-detail__section-title">Medications by diagnosis</h2>
            {!intel || !Object.keys(intel.medications).length ? (
              <p className="patient-detail__muted">No matching medications in the graph.</p>
            ) : (
              <ul className="patient-detail__similar">
                {Object.entries(intel.medications).map(([disease, meds]) => (
                  <li key={disease}>
                    <div className="patient-detail__history-label">{disease}</div>
                    <div className="patient-detail__chips">
                      {meds.map((m) => (
                        <span className="patient-detail__chip patient-detail__chip--med" key={m}>
                          {m}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="patient-detail__card patient-detail__scribe">
        <ScribeWidget patientId={patient.id} />
      </section>

      {graph && (
        <section className="patient-detail__card">
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
  )
}
