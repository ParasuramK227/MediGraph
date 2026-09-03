import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Database,
  Bookmark,
  Clock,
  BookOpen,
  Braces,
  Settings,
  ChevronDown,
  ExternalLink,
  Play,
  RefreshCw,
  Loader2,
  X,
  PanelRightClose,
} from 'lucide-react'
import { useParams } from 'react-router-dom'
import {
  fetchSchema,
  runCypher,
  type GraphSchema,
  type CypherResult,
} from '../../lib/api'
import { labelColor, relColor, chipTextContrast } from '../../lib/graphColors'
import { GraphCanvas, type GraphNodeData, type GraphEdgeData } from './GraphCanvas'
import { ScribeWidget } from '../scribe/ScribeWidget'
import './AdminGraphPanel.css'

interface DbInfo {
  instance: string
  database: string
  user: string
}

interface ResultBlock {
  id: number
  query: string
  result: CypherResult
}

// parse raw value (node/rel/primitives) for table + raw display
function cellString(v: unknown): string {
  if (v === null || v === undefined) return '<null>'
  if (typeof v === 'object') {
    const asNode = v as { _labels?: unknown[]; properties?: Record<string, unknown> }
    if (Array.isArray(asNode._labels)) {
      const name = asNode.properties?.name ?? asNode.properties?.first_name ?? asNode.properties?.id ?? ''
      return `${asNode._labels.join(':')} {${name}}`
    }
    const asRel = v as { _rel_type?: unknown }
    if (asRel._rel_type) return `(:)-[:${asRel._rel_type}]-()`
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

function extractGraph(
  result: CypherResult,
): { nodes: GraphNodeData[]; edges: GraphEdgeData[] } {
  const nodeMap = new Map<string, GraphNodeData>()
  const edges: GraphEdgeData[] = []
  let edgeSeq = 0

  for (const row of result.rows) {
    for (const cell of row) {
      const asNode = cell as {
        _type?: string
        _labels?: string[]
        properties?: Record<string, unknown>
        element_id?: string
      }
      if (asNode?._type === 'node' || Array.isArray(asNode?._labels)) {
        const id = asNode.element_id ?? `${asNode._labels?.join(',')}:${edgeSeq++}`
        const props = asNode.properties ?? {}
        nodeMap.set(id, {
          id,
          labels: asNode._labels ?? [],
          properties: props,
        })
      }
    }
  }

  // relationships: build edges from _start/_end element ids.
  for (const row of result.rows) {
    for (const cell of row) {
      const asRel = cell as {
        _type?: string
        _rel_type?: string
        _start?: string
        _end?: string
      }
      if (asRel?._type === 'relationship' && asRel._start && asRel._end) {
        edges.push({
          id: `e${edgeSeq++}`,
          source: asRel._start,
          target: asRel._end,
          label: asRel._rel_type ?? '',
        })
      }
    }
  }

  return { nodes: [...nodeMap.values()], edges }
}

export function AdminGraphPanel() {
  const { id } = useParams()
  const [schema, setSchema] = useState<GraphSchema | null>(null)
  const [schemaError, setSchemaError] = useState('')
  const [query, setQuery] = useState('')
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<ResultBlock[]>([])
  const [activeTab, setActiveTab] = useState<'graph' | 'table' | 'raw'>('graph')
  const [showProps, setShowProps] = useState(false)
  const [showScribe, setShowScribe] = useState(false)
  const [showDbInfo, setShowDbInfo] = useState(true)
  const [activeRail, setActiveRail] = useState<'database' | 'history'>('database')
  const [dbInfo] = useState<DbInfo>({
    instance: 'neo4j+s://05b7caea.databases.neo4j.io',
    database: 'neo4j',
    user: '05b7caea',
  })
  const resultsEndRef = useRef<HTMLDivElement | null>(null)

  const loadSchema = useCallback(() => {
    setSchemaError('')
    fetchSchema()
      .then(setSchema)
      .catch(() => setSchemaError('Could not load database information. Backend offline?'))
  }, [])

  useEffect(() => {
    loadSchema()
  }, [loadSchema])

  useEffect(() => {
    resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [results])

  const execute = useCallback(async (override?: string) => {
    const q = (override ?? query).trim()
    if (!q) return
    setRunning(true)
    const result = await runCypher(q)
    setResults((prev) => [
      ...prev,
      { id: Date.now(), query: q, result },
    ])
    setRunning(false)
  }, [query])

  // Chip clicks replace the current canvas entirely (drop previous results)
  // and surface the query in the bar so it reads as "the canvas was updated".
  const executeReplace = useCallback(async (q: string) => {
    setQuery(q)
    setRunning(true)
    const result = await runCypher(q)
    setResults([{ id: Date.now(), query: q, result }])
    setRunning(false)
  }, [])

  const exampleQueries = [
    'MATCH (n) RETURN n LIMIT 25',
    'MATCH (p:Patient)-[r:HAS_DIAGNOSIS]->(d:Disease) RETURN p.first_name AS patient, d.name AS diagnosis LIMIT 30',
    'MATCH (p:Patient)-[:HAS_CONSULTATION_NOTE]->(n:ConsultationNote) RETURN p.first_name AS patient, n.title AS note LIMIT 25',
    'MATCH (m:Medication)-[r:TREATS]->(d:Disease) RETURN m.name AS med, d.name AS disease LIMIT 40',
  ]

  const propsVisible = schema ? schema.property_keys.slice(0, 20) : []
  const propsHidden = schema ? schema.property_keys.length - 20 : 0

  const railIcons = [
    { key: 'database', icon: Database, label: 'Database information' },
    { key: 'bookmarks', icon: Bookmark, label: 'Bookmarks' },
    { key: 'history', icon: Clock, label: 'History' },
    { key: 'docs', icon: BookOpen, label: 'Docs' },
    { key: 'devtools', icon: Braces, label: 'Dev tools' },
    { key: 'settings', icon: Settings, label: 'Settings' },
  ] as const

  const renderChip = (
    label: string,
    count: number | undefined,
    onClick?: () => void,
  ) => {
    const color = (() => {
      try {
        return labelColor(label)
      } catch {
        return '#a0a4ab'
      }
    })()
    const contrast = chipTextContrast(color)
    const content = (
      <>
        {label}
        {count !== undefined ? ` (${count})` : ''}
      </>
    )
    const cls = 'admin-chip' + (onClick ? ' admin-chip--clickable' : '')
    if (onClick) {
      return (
        <button
          type="button"
          className={cls}
          title={`Explore ${label}`}
          onClick={onClick}
          style={{
            backgroundColor: color,
            color:
              contrast === 'dark'
                ? 'var(--admin-chip-text-dark)'
                : 'var(--admin-chip-text-light)',
          }}
        >
          {content}
        </button>
      )
    }
    return (
      <span
        className={cls}
        style={{
          backgroundColor: color,
          color:
            contrast === 'dark'
              ? 'var(--admin-chip-text-dark)'
              : 'var(--admin-chip-text-light)',
        }}
      >
        {content}
      </span>
    )
  }

  return (
    <div className="admin">
      {/* Top status bar */}
      <header className="admin-topbar">
        <span className="admin-top-dot" />
        <span className="admin-top-item">
          Instance: <span className="admin-top-mono">{dbInfo.instance}</span>
        </span>
        <span className="admin-top-item admin-top-select">
          Database: <span className="admin-top-mono">{dbInfo.database}</span>
          <ChevronDown size={12} />
        </span>
        <span className="admin-top-item">
          User: <span className="admin-top-mono">{dbInfo.user}</span>
        </span>
        <a href="#" className="admin-top-aura" onClick={(e) => e.preventDefault()}>
          Connect your instance to AuraDB for more tools and features <ExternalLink size={12} />
        </a>
      </header>

      <div className="admin-body">
        {/* Icon rail */}
        <nav className="admin-rail">
          {railIcons.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              type="button"
              className={
                'admin-rail-btn' + (activeRail === key ? ' admin-rail-btn--active' : '')
              }
              title={label}
              onClick={() => {
                setActiveRail(key === 'database' || key === 'history' ? key : 'database')
                setShowDbInfo(key === 'database')
              }}
            >
              <Icon size={17} />
            </button>
          ))}
        </nav>

        {/* Database info panel */}
        <div className="admin-dbinfo" hidden={!showDbInfo}>
          <div className="admin-dbinfo-head">
            <strong>Database information</strong>
            <button
              className="admin-icon-btn"
              title="Refresh"
              onClick={loadSchema}
            >
              <RefreshCw size={13} />
            </button>
          </div>

          {schemaError ? (
            <p className="admin-muted">{schemaError}</p>
          ) : schema ? (
            <>
              <div className="admin-section-title">Nodes ({schema.node_count})</div>
              <div className="admin-chip-row">
                <span className="admin-chip">{`* (${schema.node_count})`}</span>
                {schema.labels.map((l) =>
                  renderChip(l.label, l.count, () =>
                    void executeReplace(`MATCH (n:${l.label}) RETURN n LIMIT 50`),
                  ),
                )}
              </div>

              <div className="admin-section-title">
                Relationships ({schema.relationship_count})
              </div>
              <div className="admin-chip-row">
                <span className="admin-chip">{`* (${schema.relationship_count})`}</span>
                {schema.relationships.map((r) => {
                  const color = relColor(r.type)
                  return (
                    <button
                      key={r.type}
                      type="button"
                      className="admin-chip admin-chip--clickable"
                      title={`Explore ${r.type}`}
                      onClick={() =>
                        void executeReplace(`MATCH (a)-[r:${r.type}]->(b) RETURN a, r, b LIMIT 50`)
                      }
                      style={{
                        backgroundColor: color,
                        color:
                          chipTextContrast(color) === 'dark'
                            ? 'var(--admin-chip-text-dark)'
                            : 'var(--admin-chip-text-light)',
                      }}
                    >
                      {r.type} ({r.count})
                    </button>
                  )
                })}
              </div>

              <div className="admin-section-title">Property keys</div>
              <div className="admin-chip-row admin-chip-row--muted">
                {propsVisible.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="admin-chip admin-chip--plain admin-chip--clickable"
                    title={`Show nodes that have ${k}`}
onClick={() =>
                        void executeReplace(`MATCH (n) WHERE n.${k} IS NOT NULL RETURN DISTINCT n LIMIT 50`)
                      }
                  >
                    {k}
                  </button>
                ))}
              </div>
              {propsHidden > 0 && (
                <button className="admin-showmore" onClick={() => setShowProps((s) => !s)}>
                  {showProps ? 'Show fewer property keys' : `Show all property keys (${propsHidden} more)`}
                </button>
              )}
              {showProps && (
                <div className="admin-chip-row admin-chip-row--muted">
                  {schema.property_keys.slice(20).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className="admin-chip admin-chip--plain admin-chip--clickable"
                      title={`Show nodes that have ${k}`}
                      onClick={() =>
                        void executeReplace(`MATCH (n) WHERE n.${k} IS NOT NULL RETURN DISTINCT n LIMIT 50`)
                      }
                    >
                      {k}
                    </button>
                  ))}
                </div>
              )}

              <div className="admin-lastupdate">
                Last update: {new Date(schema.last_update).toLocaleTimeString()}
              </div>
            </>
          ) : (
            <Loader2 className="admin-spin" size={18} />
          )}
        </div>

        {/* Main query area */}
        <main className="admin-main">
          <div className="admin-querybar">
            <Bookmark size={14} className="admin-query-side" />
            <div className="admin-query-input">
              <span className="admin-prompt">neo4j$</span>
              <textarea
                className="admin-query-text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="MATCH (n) RETURN n LIMIT 25"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    void execute()
                  }
                }}
              />
            </div>
            <button
              className="admin-run-btn"
              title="Run query"
              onClick={() => void execute()}
            >
              <Play size={16} />
            </button>
          </div>

          {running && (
            <div className="admin-running">
              <Loader2 className="admin-spin" size={16} /> Running…
            </div>
          )}

          {/* Example queries before anything runs */}
          {results.length === 0 && !running && (
            <div className="admin-examples">
              <div className="admin-section-title">Try a query</div>
              {exampleQueries.map((q) => (
                <button key={q} className="admin-example-btn" onClick={() => void execute(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Stacked results (REPL-style) */}
          <div className="admin-results">
            {results.map((block, idx) => {
              const { result } = block
              const graph = extractGraph(result)
              const isLast = idx === results.length - 1
              const tab = isLast ? activeTab : 'graph'
              const overviewRows = result.rows.slice(0, 12)

              return (
                <section key={block.id} className="admin-result">
                  <div className="admin-result-query">{block.query}</div>
                  {result.error ? (
                    <div className="admin-result-error">{result.error}</div>
                  ) : (
                    <>
                      <div className="admin-tabs">
                        {(['graph', 'table', 'raw'] as const).map((t) => (
                          <button
                            key={t}
                            className={'admin-tab' + (tab === t ? ' admin-tab--active' : '')}
                            onClick={() => setActiveTab(t)}
                          >
                            {t[0].toUpperCase() + t.slice(1)}
                          </button>
                        ))}
                      </div>

                      <div className="admin-result-layout">
                        <div className="admin-result-main">
                          {tab === 'graph' &&
                            (graph.nodes.length > 0 ? (
                              <GraphCanvas nodes={graph.nodes} edges={graph.edges} />
                            ) : (
                              <div className="admin-empty">
                                No graph structure in this result (use RETURN on a node/relationship).
                              </div>
                            ))}

                          {tab === 'table' && (
                            <div className="admin-table-wrap">
                              <table className="admin-table">
                                <thead>
                                  <tr>
                                    <th className="admin-table-idx"></th>
                                    {result.columns.map((c) => (
                                      <th key={c}>{c}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {overviewRows.map((row, ri) => (
                                    <tr key={ri}>
                                      <td className="admin-table-idx">{ri}</td>
                                      {row.map((cell, ci) => (
                                        <td key={ci} className="admin-table-cell">
                                          {cellString(cell)}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {tab === 'raw' && (
                            <pre className="admin-raw">{JSON.stringify(result, null, 2)}</pre>
                          )}
                        </div>

                        {/* Results overview */}
                        {tab === 'graph' && (
                          <div className="admin-overview">
                            <div className="admin-overview-head">
                              <strong>Results overview</strong>
                            </div>
                            <div className="admin-section-title">
                              Nodes ({graph.nodes.length})
                            </div>
                            <div className="admin-overview-list">
                              {Object.entries(
                                graph.nodes.reduce<Record<string, number>>((acc, n) => {
                                  const l = n.labels[0] ?? '*'
                                  acc[l] = (acc[l] ?? 0) + 1
                                  return acc
                                }, {}),
                              ).map(([label, count]) => (
                                <div key={label} className="admin-overview-row">
                                  {renderChip(label, count)}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="admin-result-footer">
                        Started streaming {result.row_count} records after {result.timing.elapsed_ms}
                        ms and completed after {Math.round(result.timing.elapsed_ms)}ms.
                      </div>
                    </>
                  )}
                </section>
              )
            })}
            <div ref={resultsEndRef} />
          </div>
        </main>

        {/* Scribe embed (per Task 06: notes viewable alongside graph) */}
        {showScribe && (
          <aside className="admin-scribe">
            <div className="admin-scribe-head">
              <strong>Scribe</strong>
              <button className="admin-icon-btn" onClick={() => setShowScribe(false)}>
                <X size={14} />
              </button>
            </div>
            <ScribeWidget patientId={id ?? 'P001'} />
          </aside>
        )}

        <button
          className="admin-scribe-toggle"
          onClick={() => setShowScribe((s) => !s)}
          title="Toggle scribe panel"
        >
          <PanelRightClose size={16} />
        </button>
      </div>
    </div>
  )
}