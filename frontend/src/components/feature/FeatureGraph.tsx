import { useCallback, useEffect, useRef, useState } from 'react'
import cytoscape, { type ElementDefinition } from 'cytoscape'
import { ZoomIn, ZoomOut, Maximize2, Sparkles, Type, Waypoints, Search } from 'lucide-react'
import { labelColor, relColor, chipTextContrast } from '../../lib/graphColors'
import './FeatureGraph.css'

export interface FNode {
  id: string
  label: string // display text
  labels: string[] // primary label = color
  properties: Record<string, unknown>
}

export interface FEdge {
  id: string
  source: string
  target: string
  label: string
}

interface Props {
  nodes: FNode[]
  edges: FEdge[]
  height?: number
  centerId?: string
  // Relationship labels are only shown once the view is zoomed in at/above this
  // level. Toggled below the cut-off to keep dense graphs (e.g. treatment
  // intelligence) readable. A value of 0 shows them always.
  edgeLabelZoom?: number
}

// Any element inside this wrapper inherits the dark-theme tokens regardless of
// the app theme, so the canvas stays a Neo4j-style always-dark surface while
// node colors still come from tokens.css (no hardcoded hex here).
const DARK_WRAPPER = { 'data-theme': 'dark' as const }

function buildElements(nodes: FNode[], edges: FEdge[], darkEl: HTMLElement | null): ElementDefinition[] {
  const el: ElementDefinition[] = nodes.map((n) => {
    const primary = n.labels[0] ?? 'default'
    const color = labelColor(primary, darkEl ?? undefined)
    return {
      data: {
        id: n.id,
        label: n.label,
        color,
        textColor: chipTextContrast(color) === 'light' ? '#ffffff' : '#111111',
      },
    }
  })
  for (const e of edges) {
    el.push({
      data: {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        color: relColor(e.label, darkEl ?? undefined),
      },
    })
  }
  return el
}

/** Short-ish detail properties for the popover, top 5 non-generic keys. */
function popoverLines(n: FNode): Array<[string, string]> {
  const skip = new Set(['id', 'element_id'])
  const lines: Array<[string, string]> = []
  for (const [k, v] of Object.entries(n.properties)) {
    if (skip.has(k)) continue
    const s = typeof v === 'string' ? v : JSON.stringify(v)
    if (s && lines.length < 5) lines.push([k, s])
  }
  return lines
}

const EDGE_LABEL_ZOOM = 1.0

export function FeatureGraph({
  nodes,
  edges,
  height = 420,
  centerId,
  edgeLabelZoom = EDGE_LABEL_ZOOM,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const darkRef = useRef<HTMLDivElement | null>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const edgeLabelZoomRef = useRef(edgeLabelZoom)

  const nodesRef = useRef(nodes)

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  useEffect(() => {
    edgeLabelZoomRef.current = edgeLabelZoom
  }, [edgeLabelZoom])

  const [selected, setSelected] = useState<FNode | null>(null)
  const [showNodeLabels, setShowNodeLabels] = useState(true)
  const [showEdgeLabels, setShowEdgeLabels] = useState(true)

  // Search: highlight the matched node, grey out everything else.
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const findMatchId = (q: string): string | null => {
    const t = q.trim().toLowerCase()
    if (!t) return null
    for (const n of nodes) {
      if (n.label.toLowerCase().includes(t) || n.id.toLowerCase().includes(t)) return n.id
    }
    return null
  }
  const matchId = findMatchId(searchQuery)

  /** Apply grey-out of all elements except the matched node. */
  const applySearch = useCallback(
    (cy: cytoscape.Core) => {
      if (!matchId) {
        cy.elements().toggleClass('cg-dim cg-hit', false)
        return
      }
      cy.elements().forEach((e) => {
        const hit = e.is('node') && e.id() === matchId
        if (e.is('node')) e.toggleClass('cg-hit', hit)
        e.toggleClass('cg-dim', !hit)
      })
    },
    [matchId],
  )

  // Keep the label toggles in sync with the cytoscape styles/listeners.
  const applyEdgeLabelVisibility = useCallback((cy: cytoscape.Core) => {
    const cutoff = edgeLabelZoomRef.current
    const visible = showEdgeLabels && cy.zoom() >= cutoff
    cy.edges().toggleClass('fg-hide-label', !visible)
  }, [showEdgeLabels])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const cy = cytoscape({
      container: el,
      elements: [],
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            width: 44,
            height: 44,
            label: 'data(label)',
            color: 'data(textColor)',
            'font-size': '8px',
            'font-weight': 400,
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'ellipsis',
            'text-max-width': '40px',
            'text-overflow-wrap': 'anywhere',
          },
        },
        {
          selector: 'node:selected',
          style: { 'overlay-color': '#7ba1ff', 'overlay-opacity': 0.4, 'overlay-padding': 6 },
        },
        {
          selector: 'edge',
          style: {
            width: 1.25,
            'line-color': 'data(color)',
            'target-arrow-shape': 'triangle-tee',
            'target-arrow-color': 'data(color)',
            'curve-style': 'straight',
            label: 'data(label)',
            color: '#c9cdd2',
            'font-size': '7px',
            'text-background-color': '#000000',
            'text-background-opacity': 0.5,
            'text-background-padding': '2px',
            'text-rotation': 'autorotate',
            'text-margin-y': -6,
          },
        },
        {
          selector: 'node.fg-hide-label',
          style: { label: '' },
        },
        {
          selector: 'edge.fg-hide-label',
          style: { 'display': 'none', label: '' },
        },
        {
          selector: 'node.cg-dim',
          style: {
            'background-color': '#4a4f57',
            'background-opacity': 1,
            color: '#c9cdd2',
            opacity: 1,
          },
        },
        {
          selector: 'edge.cg-dim',
          style: {
            'line-color': '#3a3f46',
            'target-arrow-color': '#3a3f46',
            opacity: 0.18,
            label: '',
          },
        },
        {
          selector: 'node.cg-hit',
          style: {
            'border-color': '#2f6df6',
            'border-width': 4,
            'border-opacity': 1,
          },
        },
      ],
      layout: { name: 'cose', animate: false, padding: 30 },
      minZoom: 0.1,
      maxZoom: 4,
    })
    cyRef.current = cy
    cy.on('tap', 'node', (evt) => {
      const n = nodesRef.current.find((x) => x.id === evt.target.id())
      setSelected(n ?? null)
    })
    cy.on('tap', (evt) => {
      if (evt.target === cy) setSelected(null)
    })
    // Zoom-gate relationship labels (issue #3).
    cy.on('zoom', () => applyEdgeLabelVisibility(cy))
    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [applyEdgeLabelVisibility])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.elements().remove()
    cy.add(buildElements(nodes, edges, darkRef.current))
    cy.layout({ name: 'cose', animate: false, padding: 30 }).run()
    if (centerId) cy.$(`#${centerId}`).select()
    applyEdgeLabelVisibility(cy)
    applySearch(cy)
  }, [nodes, edges, centerId, applyEdgeLabelVisibility, applySearch])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.nodes().toggleClass('fg-hide-label', !showNodeLabels)
  }, [showNodeLabels])

  // Edge labels follow both the manual toggle AND the zoom level.
  useEffect(() => {
    const cy = cyRef.current
    if (cy) applyEdgeLabelVisibility(cy)
  }, [showEdgeLabels, applyEdgeLabelVisibility])

  // Keep the search grey-out applied as the query/matches change.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    applySearch(cy)
    if (matchId) {
      cy.fit(cy.nodes().filter((e) => e.id() === matchId), 40)
    }
  }, [matchId, searchQuery, applySearch])

  const zoomIn = () => {
    const cy = cyRef.current
    if (!cy) return
    cy.zoom((cy.zoom() ?? 1) + 0.2)
  }
  const zoomOut = () => {
    const cy = cyRef.current
    if (!cy) return
    cy.zoom((cy.zoom() ?? 1) - 0.2)
  }

  return (
    <div className="feature-graph">
      <div className="feature-graph__toolbar">
        <button
          type="button"
          className={`feature-graph__ctl ${searchOpen ? 'feature-graph__ctl--on' : ''}`}
          title="Find a node"
          onClick={() => setSearchOpen((v) => !v)}
        >
          <Search size={14} />
        </button>
        {searchOpen && (
          <input
            autoFocus
            className="feature-graph__search-input"
            placeholder="Find node…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchQuery('')
                setSearchOpen(false)
              }
            }}
          />
        )}
        <button
          type="button"
          className="feature-graph__ctl"
          title="Zoom in"
          onClick={zoomIn}
        >
          <ZoomIn size={14} />
        </button>
        <button
          type="button"
          className="feature-graph__ctl"
          title="Zoom out"
          onClick={zoomOut}
        >
          <ZoomOut size={14} />
        </button>
        <button
          type="button"
          className="feature-graph__ctl"
          title="Fit to view"
          onClick={() => cyRef.current?.fit(undefined, 30)}
        >
          <Maximize2 size={14} />
        </button>
        <button
          type="button"
          className="feature-graph__ctl"
          title="Run force layout"
          onClick={() =>
            cyRef.current?.layout({ name: 'cose', animate: true, padding: 30 }).run()
          }
        >
          <Sparkles size={14} />
        </button>
        <span className="feature-graph__divider" />
        <button
          type="button"
          className={`feature-graph__ctl ${showNodeLabels ? 'feature-graph__ctl--on' : ''}`}
          title={showNodeLabels ? 'Hide node labels' : 'Show node labels'}
          onClick={() => setShowNodeLabels((v) => !v)}
        >
          <Type size={14} />
        </button>
        <button
          type="button"
          className={`feature-graph__ctl ${showEdgeLabels ? 'feature-graph__ctl--on' : ''}`}
          title={showEdgeLabels ? 'Hide relationship labels' : 'Show relationship labels'}
          onClick={() => setShowEdgeLabels((v) => !v)}
        >
          <Waypoints size={14} />
        </button>
      </div>

      <div className="feature-graph__canvas" ref={darkRef} {...DARK_WRAPPER}>
        <div ref={containerRef} className="feature-graph__surface" style={{ height }} />
      </div>

      {searchQuery.trim() && !matchId && (
        <div className="feature-graph__search-hint">No node matches “{searchQuery}”.</div>
      )}

      {selected && (
        <div className="feature-graph__popover">
          <div className="feature-graph__popover-title">
            {selected.labels.join(':')}
          </div>
          <div className="feature-graph__popover-name">{selected.label}</div>
          <ul className="feature-graph__popover-list">
            {popoverLines(selected).map(([k, v]) => (
              <li key={k}>
                <span className="feature-graph__popover-key">{k}:</span> {v}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="feature-graph__popover-close"
            onClick={() => setSelected(null)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  )
}