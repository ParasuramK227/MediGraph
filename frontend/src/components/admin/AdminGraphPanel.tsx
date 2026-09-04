import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Database,
  Bookmark,
  Clock,
  BookOpen,
  Braces,
  Settings,
  ChevronDown,
  Play,
  RefreshCw,
  Loader2,
  X,
  PanelRightClose,
  Download,
  Copy,
  Trash2,
  Search,
  Check,
} from 'lucide-react'
import { useParams } from 'react-router-dom'
import {
  fetchSchema,
  fetchHealth,
  runCypher,
  type GraphSchema,
  type HealthStatus,
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

interface HistoryItem {
  id: string
  query: string
  timestamp: number
  rowCount?: number
  elapsedMs?: number
  error?: boolean
}

interface BookmarkItem {
  id: string
  title: string
  query: string
}

const DEFAULT_BOOKMARKS: BookmarkItem[] = [
  {
    id: 'b1',
    title: 'Node Counts by Label',
    query: 'MATCH (n) RETURN labels(n)[0] AS Label, count(n) AS Count ORDER BY Count DESC',
  },
  {
    id: 'b2',
    title: 'Relationship Frequency',
    query: 'MATCH ()-[r]->() RETURN type(r) AS Relationship, count(r) AS Count ORDER BY Count DESC',
  },
  {
    id: 'b3',
    title: 'Patients with Active Diagnoses',
    query: 'MATCH (p:Patient)-[r:HAS_DIAGNOSIS]->(d:Disease) RETURN p.first_name + " " + p.last_name AS patient, d.name AS disease, r.status AS status LIMIT 35',
  },
  {
    id: 'b4',
    title: 'Abnormal Biomarker Lab Tests',
    query: 'MATCH (p:Patient)-[:HAS_LAB_TEST]->(l:LabTest) WHERE l.interpretation IN ["abnormal", "high", "critical", "low"] RETURN p.first_name + " " + p.last_name AS patient, l.test_name AS test, l.value AS val, l.unit AS unit, l.interpretation AS status LIMIT 30',
  },
  {
    id: 'b5',
    title: 'Medications & Target Diseases',
    query: 'MATCH (m:Medication)-[:TREATS]->(d:Disease) RETURN m.name AS medication, d.name AS disease LIMIT 40',
  },
  {
    id: 'b6',
    title: 'Clinical Consultation Notes',
    query: 'MATCH (p:Patient)-[:HAS_CONSULTATION_NOTE]->(n:ConsultationNote) RETURN p.first_name + " " + p.last_name AS patient, n.title AS note, n.date AS date LIMIT 25',
  },
]

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

function exportToJson(filename: string, data: unknown) {
  const jsonStr = JSON.stringify(data, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function exportToCsv(filename: string, columns: string[], rows: unknown[][]) {
  const escapeCell = (v: unknown): string => {
    if (v === null || v === undefined) return '""'
    const str = cellString(v).replace(/"/g, '""')
    return `"${str}"`
  }
  const header = columns.map(escapeCell).join(',')
  const body = rows.map((r) => r.map(escapeCell).join(',')).join('\n')
  const csvContent = header + '\n' + body
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function AdminGraphPanel() {
  const { id } = useParams()
  const [schema, setSchema] = useState<GraphSchema | null>(null)
  const [schemaError, setSchemaError] = useState('')
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [pingMs, setPingMs] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<ResultBlock[]>([])
  const [activeTab, setActiveTab] = useState<'graph' | 'table' | 'raw'>('graph')
  const [showProps, setShowProps] = useState(false)
  const [showScribe, setShowScribe] = useState(false)
  const [activeRail, setActiveRail] = useState<
    'database' | 'bookmarks' | 'history' | 'docs' | 'devtools' | 'settings' | null
  >('database')
  const [schemaFilter, setSchemaFilter] = useState('')
  const [historyFilter, setHistoryFilter] = useState('')
  const [copiedQueryId, setCopiedQueryId] = useState<number | null>(null)

  const [dbInfo] = useState<DbInfo>({
    instance: 'neo4j+s://05b7caea.databases.neo4j.io',
    database: 'neo4j',
    user: '05b7caea',
  })

  // Persistent History
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('medigraph_admin_query_history')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // Persistent Bookmarks
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(() => {
    try {
      const saved = localStorage.getItem('medigraph_admin_bookmarks')
      return saved ? JSON.parse(saved) : DEFAULT_BOOKMARKS
    } catch {
      return DEFAULT_BOOKMARKS
    }
  })

  const resultsEndRef = useRef<HTMLDivElement | null>(null)

  const loadHealth = useCallback(async () => {
    const start = performance.now()
    try {
      const h = await fetchHealth()
      setPingMs(Math.round(performance.now() - start))
      setHealth(h)
    } catch {
      setHealth({ status: 'degraded', neo4j: 'disconnected' })
      setPingMs(null)
    }
  }, [])

  const loadSchema = useCallback(() => {
    setSchemaError('')
    fetchSchema()
      .then(setSchema)
      .catch(() => setSchemaError('Could not load database information. Backend offline?'))
  }, [])

  useEffect(() => {
    loadSchema()
    loadHealth()
  }, [loadSchema, loadHealth])

  useEffect(() => {
    resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [results])

  const saveHistory = useCallback((items: HistoryItem[]) => {
    setHistory(items)
    try {
      localStorage.setItem('medigraph_admin_query_history', JSON.stringify(items))
    } catch {}
  }, [])

  const saveBookmarks = useCallback((items: BookmarkItem[]) => {
    setBookmarks(items)
    try {
      localStorage.setItem('medigraph_admin_bookmarks', JSON.stringify(items))
    } catch {}
  }, [])

  const execute = useCallback(
    async (override?: string) => {
      const q = (override ?? query).trim()
      if (!q) return
      setRunning(true)
      const start = performance.now()
      const result = await runCypher(q)
      const elapsed = Math.round(performance.now() - start)
      setResults((prev) => [...prev, { id: Date.now(), query: q, result }])
      setRunning(false)

      // Add to persistent history
      const item: HistoryItem = {
        id: String(Date.now()),
        query: q,
        timestamp: Date.now(),
        rowCount: result.row_count,
        elapsedMs: result.timing.elapsed_ms || elapsed,
        error: Boolean(result.error),
      }
      setHistory((prev) => {
        const next = [item, ...prev.filter((h) => h.query !== q)].slice(0, 50)
        try {
          localStorage.setItem('medigraph_admin_query_history', JSON.stringify(next))
        } catch {}
        return next
      })
    },
    [query],
  )

  const executeReplace = useCallback(
    async (q: string) => {
      setQuery(q)
      setRunning(true)
      const start = performance.now()
      const result = await runCypher(q)
      const elapsed = Math.round(performance.now() - start)
      setResults([{ id: Date.now(), query: q, result }])
      setRunning(false)

      const item: HistoryItem = {
        id: String(Date.now()),
        query: q,
        timestamp: Date.now(),
        rowCount: result.row_count,
        elapsedMs: result.timing.elapsed_ms || elapsed,
        error: Boolean(result.error),
      }
      setHistory((prev) => {
        const next = [item, ...prev.filter((h) => h.query !== q)].slice(0, 50)
        try {
          localStorage.setItem('medigraph_admin_query_history', JSON.stringify(next))
        } catch {}
        return next
      })
    },
    [],
  )

  // Filtered Schema items
  const filteredLabels = useMemo(() => {
    if (!schema) return []
    if (!schemaFilter.trim()) return schema.labels
    const f = schemaFilter.toLowerCase()
    return schema.labels.filter((l) => l.label.toLowerCase().includes(f))
  }, [schema, schemaFilter])

  const filteredRelationships = useMemo(() => {
    if (!schema) return []
    if (!schemaFilter.trim()) return schema.relationships
    const f = schemaFilter.toLowerCase()
    return schema.relationships.filter((r) => r.type.toLowerCase().includes(f))
  }, [schema, schemaFilter])

  const filteredPropertyKeys = useMemo(() => {
    if (!schema) return []
    if (!schemaFilter.trim()) return schema.property_keys
    const f = schemaFilter.toLowerCase()
    return schema.property_keys.filter((p) => p.toLowerCase().includes(f))
  }, [schema, schemaFilter])

  const propsVisible = filteredPropertyKeys.slice(0, 20)
  const propsHidden = filteredPropertyKeys.length - 20

  // Filtered History items
  const filteredHistory = useMemo(() => {
    if (!historyFilter.trim()) return history
    const f = historyFilter.toLowerCase()
    return history.filter((h) => h.query.toLowerCase().includes(f))
  }, [history, historyFilter])

  const railIcons = [
    { key: 'database', icon: Database, label: 'Database information' },
    { key: 'bookmarks', icon: Bookmark, label: 'Bookmarks & Templates' },
    { key: 'history', icon: Clock, label: 'Query History' },
    { key: 'docs', icon: BookOpen, label: 'Cypher Reference' },
    { key: 'devtools', icon: Braces, label: 'Dev Tools & Diagnostics' },
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

  const isConnected = health?.neo4j === 'connected'

  return (
    <div className="admin">
      {/* Top status bar */}
      <header className="admin-topbar">
        <span
          className={`admin-top-dot ${isConnected ? 'admin-top-dot--online' : 'admin-top-dot--offline'}`}
          title={isConnected ? 'Neo4j AuraDB Connected' : 'Neo4j AuraDB Offline'}
        />
        <span className="admin-top-item">
          Instance: <span className="admin-top-mono">{dbInfo.instance}</span>
        </span>
        <span className="admin-top-item admin-top-select">
          Database: <span className="admin-top-mono">{dbInfo.database}</span>
          <ChevronDown size={12} />
        </span>
        <span className="admin-top-item">
          Status:{' '}
          <span className={`admin-status-badge ${isConnected ? 'admin-status-badge--ok' : 'admin-status-badge--warn'}`}>
            {isConnected ? 'Online' : 'Disconnected'}
          </span>
          {pingMs !== null && <span className="admin-ping-text">({pingMs}ms)</span>}
        </span>
        <span className="admin-top-item">
          User: <span className="admin-top-mono">{dbInfo.user}</span>
        </span>
        <div className="admin-top-aura">
          <span className="admin-aura-tag">Neo4j AuraDB Cloud</span>
        </div>
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
                setActiveRail((prev) => (prev === key ? null : key))
              }}
            >
              <Icon size={17} />
            </button>
          ))}
        </nav>

        {/* Dynamic Left Drawer according to activeRail */}
        {activeRail === 'database' && (
          <aside className="admin-dbinfo">
            <div className="admin-dbinfo-head">
              <strong>Database information</strong>
              <button
                className="admin-icon-btn"
                title="Refresh Schema"
                onClick={() => {
                  loadSchema()
                  loadHealth()
                }}
              >
                <RefreshCw size={13} />
              </button>
            </div>

            <div className="admin-search-wrap">
              <Search size={13} className="admin-search-icon" />
              <input
                type="text"
                className="admin-search-input"
                placeholder="Filter labels, rels, keys…"
                value={schemaFilter}
                onChange={(e) => setSchemaFilter(e.target.value)}
              />
              {schemaFilter && (
                <button className="admin-search-clear" onClick={() => setSchemaFilter('')}>
                  <X size={11} />
                </button>
              )}
            </div>

            {schemaError ? (
              <p className="admin-muted">{schemaError}</p>
            ) : schema ? (
              <>
                <div className="admin-section-title">
                  Nodes ({filteredLabels.reduce((sum, l) => sum + (l.count ?? 0), 0)}
                  {schemaFilter ? ' matched' : ` of ${schema.node_count}`})
                </div>
                <div className="admin-chip-row">
                  {!schemaFilter && (
                    <span className="admin-chip">{`* (${schema.node_count})`}</span>
                  )}
                  {filteredLabels.map((l) =>
                    renderChip(l.label, l.count, () =>
                      void executeReplace(`MATCH (n:${l.label}) RETURN n LIMIT 50`),
                    ),
                  )}
                  {filteredLabels.length === 0 && (
                    <span className="admin-muted-sm">No matching node labels</span>
                  )}
                </div>

                <div className="admin-section-title">
                  Relationships ({filteredRelationships.reduce((sum, r) => sum + (r.count ?? 0), 0)}
                  {schemaFilter ? ' matched' : ` of ${schema.relationship_count}`})
                </div>
                <div className="admin-chip-row">
                  {!schemaFilter && (
                    <span className="admin-chip">{`* (${schema.relationship_count})`}</span>
                  )}
                  {filteredRelationships.map((r) => {
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
                  {filteredRelationships.length === 0 && (
                    <span className="admin-muted-sm">No matching relationships</span>
                  )}
                </div>

                <div className="admin-section-title">Property keys ({filteredPropertyKeys.length})</div>
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
                  {propsVisible.length === 0 && (
                    <span className="admin-muted-sm">No matching property keys</span>
                  )}
                </div>
                {propsHidden > 0 && (
                  <button className="admin-showmore" onClick={() => setShowProps((s) => !s)}>
                    {showProps ? 'Show fewer property keys' : `Show all keys (${propsHidden} more)`}
                  </button>
                )}
                {showProps && propsHidden > 0 && (
                  <div className="admin-chip-row admin-chip-row--muted">
                    {filteredPropertyKeys.slice(20).map((k) => (
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
          </aside>
        )}

        {/* History Panel */}
        {activeRail === 'history' && (
          <aside className="admin-dbinfo">
            <div className="admin-dbinfo-head">
              <strong>Query History ({history.length})</strong>
              {history.length > 0 && (
                <button
                  className="admin-icon-btn admin-icon-btn--danger"
                  title="Clear Query History"
                  onClick={() => {
                    if (confirm('Clear all query history?')) {
                      saveHistory([])
                    }
                  }}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            <div className="admin-search-wrap">
              <Search size={13} className="admin-search-icon" />
              <input
                type="text"
                className="admin-search-input"
                placeholder="Search history…"
                value={historyFilter}
                onChange={(e) => setHistoryFilter(e.target.value)}
              />
              {historyFilter && (
                <button className="admin-search-clear" onClick={() => setHistoryFilter('')}>
                  <X size={11} />
                </button>
              )}
            </div>

            <div className="admin-history-list">
              {filteredHistory.length === 0 ? (
                <div className="admin-muted-center">
                  {historyFilter ? 'No matching queries' : 'No queries run yet'}
                </div>
              ) : (
                filteredHistory.map((h) => (
                  <div key={h.id} className="admin-history-item">
                    <div className="admin-history-top">
                      <span className="admin-history-time">
                        {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="admin-history-badges">
                        {h.rowCount !== undefined && (
                          <span className="admin-badge admin-badge--rows">{h.rowCount} rows</span>
                        )}
                        {h.elapsedMs !== undefined && (
                          <span className="admin-badge admin-badge--ms">{h.elapsedMs}ms</span>
                        )}
                        {h.error && <span className="admin-badge admin-badge--err">Error</span>}
                      </div>
                    </div>
                    <div className="admin-history-code" title={h.query}>
                      {h.query}
                    </div>
                    <div className="admin-history-actions">
                      <button
                        className="admin-btn-action"
                        title="Load query into editor"
                        onClick={() => setQuery(h.query)}
                      >
                        Load
                      </button>
                      <button
                        className="admin-btn-action admin-btn-action--primary"
                        title="Execute this query"
                        onClick={() => void execute(h.query)}
                      >
                        <Play size={11} /> Run
                      </button>
                      <button
                        className="admin-btn-action admin-btn-action--trash"
                        title="Remove from history"
                        onClick={() => saveHistory(history.filter((x) => x.id !== h.id))}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}

        {/* Bookmarks Panel */}
        {activeRail === 'bookmarks' && (
          <aside className="admin-dbinfo">
            <div className="admin-dbinfo-head">
              <strong>Bookmarks & Presets</strong>
            </div>
            <div className="admin-history-list">
              {bookmarks.map((b) => (
                <div key={b.id} className="admin-history-item">
                  <div className="admin-history-top">
                    <strong className="admin-bookmark-title">{b.title}</strong>
                  </div>
                  <div className="admin-history-code" title={b.query}>
                    {b.query}
                  </div>
                  <div className="admin-history-actions">
                    <button
                      className="admin-btn-action"
                      title="Load into editor"
                      onClick={() => setQuery(b.query)}
                    >
                      Load
                    </button>
                    <button
                      className="admin-btn-action admin-btn-action--primary"
                      title="Run query"
                      onClick={() => void execute(b.query)}
                    >
                      <Play size={11} /> Run
                    </button>
                    {b.id.startsWith('custom_') && (
                      <button
                        className="admin-btn-action admin-btn-action--trash"
                        title="Delete bookmark"
                        onClick={() => saveBookmarks(bookmarks.filter((x) => x.id !== b.id))}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* Docs / Reference Panel */}
        {activeRail === 'docs' && (
          <aside className="admin-dbinfo">
            <div className="admin-dbinfo-head">
              <strong>Cypher Cheat Sheet</strong>
            </div>
            <div className="admin-docs-list">
              <div className="admin-doc-card">
                <div className="admin-doc-title">Find Nodes</div>
                <code>{'MATCH (p:Patient) RETURN p LIMIT 25'}</code>
              </div>
              <div className="admin-doc-card">
                <div className="admin-doc-title">Traverse Relationships</div>
                <code>{'MATCH (p:Patient)-[r:HAS_DIAGNOSIS]->(d:Disease) RETURN p, r, d'}</code>
              </div>
              <div className="admin-doc-card">
                <div className="admin-doc-title">Filter by Property</div>
                <code>{"MATCH (n) WHERE n.gender = 'F' RETURN n"}</code>
              </div>
              <div className="admin-doc-card">
                <div className="admin-doc-title">Aggregation & Counts</div>
                <code>{'MATCH (p:Patient) RETURN p.gender, count(p)'}</code>
              </div>
              <div className="admin-doc-card">
                <div className="admin-doc-title">Variable-length Path</div>
                <code>{'MATCH path = (p:Patient)-[*1..2]-(x) RETURN path LIMIT 20'}</code>
              </div>
            </div>
          </aside>
        )}

        {/* Dev Tools & Diagnostics Panel */}
        {activeRail === 'devtools' && (
          <aside className="admin-dbinfo">
            <div className="admin-dbinfo-head">
              <strong>Diagnostics</strong>
            </div>
            <div className="admin-dev-box">
              <div className="admin-dev-row">
                <span className="admin-dev-lbl">AuraDB Status:</span>
                <span className={isConnected ? 'admin-dev-val-ok' : 'admin-dev-val-err'}>
                  {isConnected ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <div className="admin-dev-row">
                <span className="admin-dev-lbl">Latency (Ping):</span>
                <span className="admin-dev-val">{pingMs !== null ? `${pingMs} ms` : 'N/A'}</span>
              </div>
              <div className="admin-dev-row">
                <span className="admin-dev-lbl">Total Nodes:</span>
                <span className="admin-dev-val">{schema?.node_count ?? '…'}</span>
              </div>
              <div className="admin-dev-row">
                <span className="admin-dev-lbl">Total Relationships:</span>
                <span className="admin-dev-val">{schema?.relationship_count ?? '…'}</span>
              </div>
              <div className="admin-dev-row">
                <span className="admin-dev-lbl">Driver Protocol:</span>
                <span className="admin-dev-val">Bolt+s (TLS 1.3)</span>
              </div>
            </div>
            <button
              className="admin-dev-btn"
              onClick={() => {
                loadSchema()
                loadHealth()
              }}
            >
              <RefreshCw size={12} /> Test Connection & Refresh
            </button>
          </aside>
        )}

        {/* Settings Panel */}
        {activeRail === 'settings' && (
          <aside className="admin-dbinfo">
            <div className="admin-dbinfo-head">
              <strong>Settings</strong>
            </div>
            <div className="admin-settings-section">
              <label className="admin-setting-lbl">Default Query Limit</label>
              <div className="admin-setting-val">25 rows (Configurable in Cypher)</div>
            </div>
            <div className="admin-settings-section">
              <label className="admin-setting-lbl">Storage</label>
              <button
                className="admin-dev-btn admin-dev-btn--danger"
                onClick={() => {
                  if (confirm('Clear history and reset bookmarks?')) {
                    saveHistory([])
                    saveBookmarks(DEFAULT_BOOKMARKS)
                  }
                }}
              >
                Clear History & Reset Presets
              </button>
            </div>
          </aside>
        )}

        {/* Main query area */}
        <main className="admin-main">
          {/* Top Cypher Preset bar */}
          <div className="admin-preset-bar">
            <span className="admin-preset-lbl">Quick Presets:</span>
            <select
              className="admin-preset-select"
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  setQuery(e.target.value)
                }
              }}
            >
              <option value="">⚡ Select Cypher Preset Query…</option>
              <option value="MATCH (n) RETURN n LIMIT 30">Sample Graph (30 nodes)</option>
              <option value="MATCH (p:Patient)-[r:HAS_DIAGNOSIS]->(d:Disease) RETURN p, r, d LIMIT 30">
                Patients & Diagnoses
              </option>
              <option value="MATCH (m:Medication)-[r:TREATS]->(d:Disease) RETURN m, r, d LIMIT 40">
                Medications & Diseases
              </option>
              <option value="MATCH (p:Patient)-[r:HAS_LAB_TEST]->(l:LabTest) RETURN p, r, l LIMIT 30">
                Patients & Lab Tests
              </option>
              <option value="MATCH (p:Patient)-[r:HAS_CONSULTATION_NOTE]->(c:ConsultationNote) RETURN p, r, c LIMIT 25">
                Patients & Consultation Notes
              </option>
              <option value="MATCH (n) RETURN labels(n)[0] AS Label, count(n) AS Count ORDER BY Count DESC">
                Node Counts Summary
              </option>
              <option value="MATCH ()-[r]->() RETURN type(r) AS Relationship, count(r) AS Count ORDER BY Count DESC">
                Relationship Density Summary
              </option>
            </select>
          </div>

          <div className="admin-querybar">
            <button
              type="button"
              className="admin-bookmark-btn"
              title="Bookmark this query"
              onClick={() => {
                if (!query.trim()) return
                const title = prompt('Bookmark name:', query.slice(0, 30) + '…')
                if (!title) return
                const newBm: BookmarkItem = {
                  id: `custom_${Date.now()}`,
                  title,
                  query: query.trim(),
                }
                saveBookmarks([newBm, ...bookmarks])
              }}
            >
              <Bookmark size={14} />
            </button>
            <div className="admin-query-input">
              <span className="admin-prompt">neo4j$</span>
              <textarea
                className="admin-query-text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="MATCH (n) RETURN n LIMIT 25  (Ctrl+Enter to run)"
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
              title="Run query (Ctrl+Enter)"
              onClick={() => void execute()}
            >
              <Play size={16} />
            </button>
          </div>

          {running && (
            <div className="admin-running">
              <Loader2 className="admin-spin" size={16} /> Running Cypher query on AuraDB…
            </div>
          )}

          {/* Example queries before anything runs */}
          {results.length === 0 && !running && (
            <div className="admin-examples">
              <div className="admin-section-title">Common Clinical Queries</div>
              <div className="admin-examples-grid">
                {[
                  'MATCH (n) RETURN n LIMIT 25',
                  'MATCH (p:Patient)-[r:HAS_DIAGNOSIS]->(d:Disease) RETURN p.first_name AS patient, d.name AS diagnosis LIMIT 30',
                  'MATCH (p:Patient)-[:HAS_CONSULTATION_NOTE]->(n:ConsultationNote) RETURN p.first_name AS patient, n.title AS note LIMIT 25',
                  'MATCH (m:Medication)-[r:TREATS]->(d:Disease) RETURN m.name AS med, d.name AS disease LIMIT 40',
                ].map((q) => (
                  <button key={q} className="admin-example-btn" onClick={() => void execute(q)}>
                    <span className="admin-example-prompt">neo4j$</span> {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stacked results (REPL-style) */}
          <div className="admin-results">
            {results.map((block, idx) => {
              const { result } = block
              const graph = extractGraph(result)
              const isLast = idx === results.length - 1
              const tab = isLast ? activeTab : 'graph'
              const overviewRows = result.rows.slice(0, 50)
              const isCopied = copiedQueryId === block.id

              return (
                <section key={block.id} className="admin-result">
                  <div className="admin-result-header">
                    <div className="admin-result-query">{block.query}</div>
                    <div className="admin-result-actions">
                      <button
                        className="admin-action-btn"
                        title="Copy Cypher Query"
                        onClick={() => {
                          navigator.clipboard.writeText(block.query)
                          setCopiedQueryId(block.id)
                          setTimeout(() => setCopiedQueryId(null), 1500)
                        }}
                      >
                        {isCopied ? <Check size={12} color="var(--color-success)" /> : <Copy size={12} />}
                      </button>
                      <button
                        className="admin-action-btn"
                        title="Export results as JSON"
                        onClick={() => exportToJson(`neo4j_query_${block.id}.json`, result)}
                      >
                        <Download size={12} /> JSON
                      </button>
                      <button
                        className="admin-action-btn"
                        title="Export results as CSV"
                        onClick={() =>
                          exportToCsv(`neo4j_query_${block.id}.csv`, result.columns, result.rows)
                        }
                      >
                        <Download size={12} /> CSV
                      </button>
                      <button
                        className="admin-action-btn admin-action-btn--dismiss"
                        title="Dismiss Result Card"
                        onClick={() => setResults((prev) => prev.filter((b) => b.id !== block.id))}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>

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
                                    <th className="admin-table-idx">#</th>
                                    {result.columns.map((c) => (
                                      <th key={c}>{c}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {overviewRows.map((row, ri) => (
                                    <tr key={ri}>
                                      <td className="admin-table-idx">{ri + 1}</td>
                                      {row.map((cell, ci) => (
                                        <td key={ci} className="admin-table-cell">
                                          {cellString(cell)}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {result.rows.length > 50 && (
                                <div className="admin-table-more">
                                  Showing first 50 of {result.rows.length} rows (Export CSV to view all)
                                </div>
                              )}
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
                            {graph.edges.length > 0 && (
                              <>
                                <div className="admin-section-title">
                                  Edges ({graph.edges.length})
                                </div>
                                <div className="admin-overview-list">
                                  {Object.entries(
                                    graph.edges.reduce<Record<string, number>>((acc, e) => {
                                      const l = e.label || '*'
                                      acc[l] = (acc[l] ?? 0) + 1
                                      return acc
                                    }, {}),
                                  ).map(([rel, count]) => (
                                    <div key={rel} className="admin-overview-row">
                                      <span className="admin-chip admin-chip--plain">
                                        {rel} ({count})
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="admin-result-footer">
                        <span>
                          Retrieved <strong>{result.row_count}</strong> records in{' '}
                          <strong>{Math.round(result.timing.elapsed_ms)}ms</strong>
                        </span>
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
              <strong>Clinical Scribe</strong>
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
          title="Toggle clinical scribe panel"
        >
          <PanelRightClose size={16} />
        </button>
      </div>
    </div>
  )
}