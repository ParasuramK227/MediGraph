import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '../services/api.js'
import Loading from '../components/Loading.jsx'
import ErrorState from '../components/ErrorState.jsx'
import EmptyState from '../components/EmptyState.jsx'

export default function Treatments() {
  const [params, setParams] = useSearchParams()
  const selected = params.get('patient') || ''
  const [q, setQ] = useState('')
  const [patients, setPatients] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/patients?limit=30').then((d) => setPatients(d.patients)).catch(setError)
  }, [])

  useEffect(() => {
    if (!selected) {
      setResult(null)
      return
    }
    setResult(null)
    setError(null)
    api.get(`/patients/${selected}/treatments`).then(setResult).catch(setError)
  }, [selected])

  return (
    <div>
      <div className="page-header">
        <h1>Treatment Intelligence</h1>
        <p>
          Outcome aggregation and ranking computed deterministically over a cohort of
          clinically similar patients — no LLM involved.
        </p>
      </div>

      <div className="search-row">
        <select
          value={selected}
          onChange={(e) => setParams(e.target.value ? { patient: e.target.value } : {})}
          style={{ minWidth: 260 }}
        >
          <option value="">Select a patient…</option>
          {(patients || []).map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="…or filter list"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {error && <ErrorState error={error} />}
      {!selected && !error && (
        <EmptyState title="Pick a patient" hint="Ranking is based on that patient's clinical cohort." />
      )}
      {selected && !result && !error && <Loading label="Aggregating cohort outcomes…" />}

      {result && result.ranked_treatments.length === 0 && (
        <EmptyState
          title="No treatments met the minimum case threshold"
          hint={`Cohort size: ${result.cohort_size}. Try another patient.`}
        />
      )}

      {result && result.ranked_treatments.map((t, rank) => (
        <div className="panel" key={t.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0 }}>
              #{rank + 1} · {t.name}
              {t.relevant_to_patient_diseases?.length > 0 && (
                <span className="chip" style={{ marginLeft: 10 }}>
                  matches patient diagnosis
                </span>
              )}
            </h3>
            <span className="muted">{t.type}</span>
          </div>

          <div className="grid-stats section-gap" style={{ marginBottom: 0 }}>
            <div className="stat-card"><div className="stat-value">{t.cases}</div><div className="stat-label">Similar cases</div></div>
            <div className="stat-card"><div className="stat-value">{t.successes}</div><div className="stat-label">Positive outcomes</div></div>
            <div className="stat-card stat-warn"><div className="stat-value">{t.success_rate}%</div><div className="stat-label">Success rate</div></div>
            <div className="stat-card"><div className="stat-value">{t.partial}</div><div className="stat-label">Partial</div></div>
            <div className="stat-card stat-bad"><div className="stat-value">{t.failures}</div><div className="stat-label">Failures</div></div>
          </div>

          {t.evidence?.length > 0 && (
            <>
              <h4 className="section-gap" style={{ marginBottom: 6 }}>Evidence &amp; provenance</h4>
              <table className="data-table">
                <thead>
                  <tr><th>Source</th><th>Type</th><th className="num">Confidence</th><th>Published</th><th>Studies</th></tr>
                </thead>
                <tbody>
                  {t.evidence.map((e) => (
                    <tr key={e.id}>
                      <td>{e.source}</td>
                      <td className="muted">{e.type}</td>
                      <td className="num">{(e.confidence * 100).toFixed(0)}%</td>
                      <td className="muted">{e.publication_date}</td>
                      <td className="muted">{e.studies.join('; ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <p className="muted section-gap">
            Effective for: {t.effective_for.join(', ') || '—'} · Method:{' '}
            {result.method} · Cohort of {result.cohort_size} similar patients
          </p>
        </div>
      ))}

      {result && result.ranked_treatments.length > 0 && (
        <Link to={`/knowledge-graph?entity=${result.patient.id}`} className="chip">
          Open patient in Knowledge Graph →
        </Link>
      )}
    </div>
  )
}
