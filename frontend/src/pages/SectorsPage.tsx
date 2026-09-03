import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderKanban, Loader2 } from 'lucide-react'
import { runCypher } from '../lib/api'
import './SectorsPage.css'

interface SectorRow {
  name: string
  patients: number
  medications: number
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

export function SectorsPage() {
  const [sectors, setSectors] = useState<SectorRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    runCypher(
      `MATCH (d:Disease)
       OPTIONAL MATCH (p:Patient)-[:HAS_DIAGNOSIS]->(d)
       OPTIONAL MATCH (med:Medication)-[:TREATS]->(d)
       RETURN d.name AS name, count(DISTINCT p) AS patients, count(DISTINCT med) AS medications
       ORDER BY patients DESC`,
    )
      .then((res) => {
        if (cancelled) return
        if (res.error) return
        setSectors(
          res.rows.map((r) => ({
            name: String(r[0]),
            patients: Number(r[1]),
            medications: Number(r[2]),
          })),
        )
      })
      .catch(() => {
        if (!cancelled) setSectors([])
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
      <h1 className="page__heading">Sectors</h1>
      <p className="sectors-page__sub">
        Disease-focused cohorts. Select a sector to explore the patient&nbsp;network,
        presenting symptoms, and indicated medications.
      </p>

      {loading && (
        <div className="sectors-page__loading">
          <Loader2 className="sectors-page__spin" size={20} />
          Loading sectors…
        </div>
      )}

      {!loading && sectors.length === 0 && (
        <div className="sectors-page__loading">No sectors found.</div>
      )}

      <div className="sectors-page__grid">
        {sectors.map((s) => (
          <Link
            key={s.name}
            className="sectors-page__card"
            to={`/sectors/${slug(s.name)}`}
          >
            <div className="sectors-page__card-icon">
              <FolderKanban size={16} />
            </div>
            <div className="sectors-page__card-body">
              <div className="sectors-page__card-title">{s.name}</div>
              <div className="sectors-page__card-meta">
                {s.patients} patient{s.patients === 1 ? '' : 's'} • {s.medications} medication
                {s.medications === 1 ? '' : 's'}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}