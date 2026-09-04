import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Loader2, Mail, Phone } from 'lucide-react'
import { fetchPatients, type Patient } from '../lib/api'
import { cleanPersonName } from '../lib/formatters'
import './PatientsPage.css'

export function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPatients()
      .then((p) => {
        if (!cancelled) {
          setPatients(p)
          setError(null)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load patients')
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
      <h1 className="page__heading">Patients</h1>
      <p className="patients-page__sub">
        {patients.length} patient{patients.length === 1 ? '' : 's'}. Select a patient
        to view their clinical graph and add a consultation note.
      </p>

      {loading && (
        <div className="patients-page__state">
          <Loader2 className="patients-page__spin" size={20} />
          Loading patients…
        </div>
      )}

      {!loading && error && <div className="patients-page__state patients-page__state--error">{error}</div>}

      {!loading && !error && patients.length === 0 && (
        <div className="patients-page__state">No patients found.</div>
      )}

      {!loading && patients.length > 0 && (
        <div className="patients-page__list">
          {patients.map((p) => {
            const name = cleanPersonName(`${p.first_name} ${p.last_name}`)
            return (
              <Link key={p.id} className="patients-page__card" to={`/patients/${p.id}`}>
                <div className="patients-page__avatar">
                  {(p.first_name || '?').charAt(0)}
                </div>
                <div className="patients-page__card-body">
                  <div className="patients-page__name">
                    {name || p.id}
                    {p.gender ? <span className="patients-page__badge">{p.gender}</span> : null}
                  </div>
                  <div className="patients-page__meta">
                    <span>{p.id}</span>
                    {p.date_of_birth ? <span>• {p.date_of_birth}</span> : null}
                  </div>
                  <div className="patients-page__contact">
                    {p.email ? (
                      <span className="patients-page__contact-item">
                        <Mail size={12} aria-hidden /> {p.email}
                      </span>
                    ) : null}
                    {p.contact_number ? (
                      <span className="patients-page__contact-item">
                        <Phone size={12} aria-hidden /> {p.contact_number}
                      </span>
                    ) : null}
                  </div>
                </div>
                <Users size={16} className="patients-page__chevron" aria-hidden />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}