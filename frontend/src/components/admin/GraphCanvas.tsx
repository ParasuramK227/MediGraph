import { useEffect, useRef, useState } from 'react'
import cytoscape, { type ElementDefinition } from 'cytoscape'
import { ZoomIn, ZoomOut, Maximize2, Sparkles, Search } from 'lucide-react'
import { labelColor, relColor, chipTextContrast } from '../../lib/graphColors'
import './GraphCanvas.css'

export interface GraphNodeData {
  id: string
  labels: string[]
  properties: Record<string, unknown>
}

export interface GraphEdgeData {
  id: string
  source: string
  target: string
  label: string
}

interface Props {
  nodes: GraphNodeData[]
  edges: GraphEdgeData[]
}

/** Short display label for a node: its known name/id property or fallback. */
function nodeDisplay(n: GraphNodeData): string {
  const p = n.properties
  for (const key of ['name', 'first_name', 'title']) {
    if (typeof p[key] === 'string' && (p[key] as string).length) return p[key] as string
  }
  if (typeof p.id === 'string' || typeof p.id === 'number') return String(p.id)
  return (n.labels[0] ?? 'node') + ' ' + (n.id ?? '').slice(0, 5)
}

/** Build cytoscape element definitions. */
function buildElements(nodes: GraphNodeData[], edges: GraphEdgeData[]): ElementDefinition[] {
  const elements: ElementDefinition[] = nodes.map((n) => {
    const label = n.labels[0] ?? 'node'
    const color = labelColor(label)
    return {
      data: {
        id: n.id,
        label: nodeDisplay(n),
        color,
        textColor: chipTextContrast(color) === 'light' ? '#ffffff' : '#111111',
      },
      classes: 'node',
    }
  })
  for (const e of edges) {
    elements.push({
      data: {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        color: relColor(e.label),
      },
      classes: 'edge',
    })
  }
  return elements
}

export function GraphCanvas({ nodes, edges }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const matchId = (() => {
    const t = searchQuery.trim().toLowerCase()
    if (!t) return null
    for (const n of nodes) {
      if (nodeDisplay(n).toLowerCase().includes(t) || String(n.id).toLowerCase().includes(t)) return n.id
    }
    return null
  })()

  const applySearch = (cy: cytoscape.Core, id: string | null) => {
    if (!id) {
      cy.elements().toggleClass('cg-dim cg-hit', false)
      return
    }
    cy.elements().forEach((e) => {
      const hit = e.is('node') && e.id() === id
      if (e.is('node')) e.toggleClass('cg-hit', hit)
      e.toggleClass('cg-dim', !hit)
    })
  }

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
          },
        },
        {
          selector: 'node:selected',
          style: { 'overlay-color': '#2f6df6', 'overlay-opacity': 0.4, 'overlay-padding': 6 },
        },
        {
          selector: 'edge',
          style: {
            width: 1.25,
            'line-color': '#8b9199',
            'target-arrow-shape': 'triangle-tee',
            'target-arrow-color': '#8b9199',
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
          style: { 'border-color': '#2f6df6', 'border-width': 4, 'border-opacity': 1 },
        },
      ],
      layout: {
        name: 'cose',
        animate: false,
        padding: 30,
      },
      // interactive controls: zoom + fit bottom-right, drag nodes, select
      minZoom: 0.1,
      maxZoom: 4,
    })

    cyRef.current = cy
    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [])

  // Update elements whenever node/edge set changes.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.elements().remove()
    cy.add(buildElements(nodes, edges))
    cy.layout({ name: 'cose', animate: false, padding: 30 }).run()
  }, [nodes, edges])

  // Apply search grey-out whenever the query/match or element set changes.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    applySearch(cy, matchId)
    if (matchId) {
      cy.fit(cy.nodes().filter((e) => e.id() === matchId), 40)
    }
  }, [matchId, nodes, edges])

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
    <div className="graph-canvas">
      <div ref={containerRef} className="graph-canvas__surface" />
      <div className="graph-canvas__controls">
        <button
          type="button"
          className={`graph-canvas__ctl ${searchOpen ? 'graph-canvas__ctl--on' : ''}`}
          title="Find a node"
          onClick={() => setSearchOpen((v) => !v)}
        >
          <Search size={14} />
        </button>
        {searchOpen && (
          <input
            autoFocus
            className="graph-canvas__search-input"
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
          className="graph-canvas__ctl"
          title="Zoom in"
          onClick={zoomIn}
        >
          <ZoomIn size={14} />
        </button>
        <button
          type="button"
          className="graph-canvas__ctl"
          title="Zoom out"
          onClick={zoomOut}
        >
          <ZoomOut size={14} />
        </button>
        <button
          type="button"
          className="graph-canvas__ctl"
          title="Fit to view"
          onClick={() => cyRef.current?.fit(undefined, 30)}
        >
          <Maximize2 size={14} />
        </button>
        <button
          type="button"
          className="graph-canvas__ctl"
          title="Run force layout"
          onClick={() =>
            cyRef.current?.layout({ name: 'cose', animate: true, padding: 30 }).run()
          }
        >
          <Sparkles size={14} />
        </button>
      </div>
    {searchQuery.trim() && !matchId && (
        <div className="graph-canvas__search-hint">No node matches “{searchQuery}”.</div>
      )}
    </div>
  )
}