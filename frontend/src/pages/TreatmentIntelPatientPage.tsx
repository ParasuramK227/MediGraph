import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, TrendingUp, Users } from 'lucide-react'
import { fetchTreatmentIntel, type TreatmentIntel } from '../lib/api'
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
            Ranked diagnoses ({data.patient.id}) — by likelihood of success from similar
            patients&apos; outcomes. Deterministic, no LLM.
          </p>
        </div>
      </header>

      <section className="tii__ranked">
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
                <div className="tii__rank-score">{r.score.toFixed(2)}</div>
              </div>
            </div>
          )
        })}
      </section>

      <section className="tii__similar">
        <h2 className="tii__section-title">
          <Users size={16} /> Similar patients
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
