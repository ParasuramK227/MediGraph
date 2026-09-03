import { useEffect, useState } from 'react'
import { fetchHealth, type HealthStatus } from '../../lib/api'
import './BackendStatus.css'

interface Status {
  kind: 'loading' | 'online' | 'offline'
  neo4j?: boolean
}

export function BackendStatus() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const health: HealthStatus = await fetchHealth()
        if (cancelled) return
        setStatus({
          kind: 'online',
          neo4j: health.neo4j === 'connected',
        })
      } catch {
        if (cancelled) return
        setStatus({ kind: 'offline' })
      }
    }

    check()
    const id = setInterval(check, 15000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  if (status.kind === 'loading') {
    return (
      <span className="backend-status">
        <span className="dot" /> checking backend…
      </span>
    )
  }

  if (status.kind === 'offline') {
    return (
      <span className="backend-status backend-status--offline">
        <span className="dot" /> backend offline
      </span>
    )
  }

  return (
    <span className="backend-status backend-status--online" title="Backend connectivity">
      <span className="dot" />
      <span className={status.neo4j ? 'target target--ok' : 'target target--down'}>neo4j</span>
    </span>
  )
}
