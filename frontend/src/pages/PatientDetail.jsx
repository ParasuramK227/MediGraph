import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../services/api.js'
import Loading from '../components/Loading.jsx'
import ErrorState from '../components/ErrorState.jsx'
import Badge from '../components/Badge.jsx'

export default function PatientDetail() {
  const { patientId } = useParams()
  const [patient, setPatient] = useState(null)
  const [similar, setSimilar] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setPatient(null)
    setSimilar(null)
    setError(null)
    api.get(`/patients/${patientId}`).then(setPatient).catch(setError)
    api.get(`/patients/${patientId}/similar`).then((d) => setSimilar(d.similar_patients)).catch(() => {})
  }, [patientId])

  if (error) return <ErrorState error={error} />
  if (!patient) return <Loading label="Loading patient…" />

  const p = patient.patient
  return (
    <div>
      <div className="page-header">
        <h1>{p.name}</h1>
        <p>
          {p.id} · {p.age} yrs · {p.gender} · Blood {p.blood_type}
        </p>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h3>Diagnoses</h3>
          <table className="data-table">
            <thead><tr><th>Disease</th><th>Severity</th><th>Status</th></tr></thead>
            <tbody>
              {p.diseases.map((d) => (
                <tr key={d}>
                  <td>{d}</td>
                  <td className="muted">—</td>
                  <td><Badge value="ok">documented</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ marginTop: 16 }}>Symptoms</h3>
          <div>{p.symptoms.map((s) => <span key={s} className="chip" style={{ marginRight: 6 }}>{s}</span>)}</div>
        </div>

        <div className="panel">
          <h3>Treatment history</h3>
          <table className="data-table">
            <thead><tr><th>Treatment</th><th>Duration</th></tr></thead>
            <tbody>
              {p.treatments.map((t) => (
                <tr key={t}><td>{t}</td><td className="muted">—</td></tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ marginTop: 16 }}>Recent lab results</h3>
          <table className="data-table">
            <thead><tr><th>Test</th><th className="num">Value</th><th>Flag</th></tr></thead>
            <tbody>
              {p.labs.slice(0, 8).map((l) => {
                const [test, flag] = l.split('|')
                return (
                  <tr key={l}>
                    <td>{test.replace(/\|/, ' ')}</td>
                    <td className="num">{flag}</td>
                    <td><Badge value={flag === 'normal' ? 'ok' : 'warning'}>{flag}</Badge></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel section-gap">
        <h3>Clinically similar patients <span className="muted">(deterministic Python scoring)</span></h3>
        {!similar ? (
          <Loading label="Computing similarity…" />
        ) : similar.length === 0 ? (
          <p className="muted">No patients above the similarity threshold.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Patient</th><th style={{ width: '30%' }}>Similarity</th><th className="num">Score</th><th>Shared profile</th></tr>
            </thead>
            <tbody>
              {similar.slice(0, 10).map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/patients/${s.id}`}>{s.name}</Link>{' '}
                    <span className="muted">{s.id}</span>
                  </td>
                  <td>
                    <div className="score-bar"><div style={{ width: `${Math.min(100, s.score * 100)}%` }} /></div>
                  </td>
                  <td className="num">{s.score.toFixed(2)}</td>
                  <td className="muted">
                    sym {(s.breakdown.symptom * 100).toFixed(0)}% · dis {(s.breakdown.disease * 100).toFixed(0)}%
                    · lab {(s.breakdown.lab * 100).toFixed(0)}% · trt {(s.breakdown.treatment * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="section-gap">
        <Link className="btn" to={`/treatments?patient=${patientId}`}>
          View treatment intelligence →
        </Link>
      </div>
    </div>
  )
}
