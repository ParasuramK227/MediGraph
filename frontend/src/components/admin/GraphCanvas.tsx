import { useMemo } from 'react'
import { VisNetworkCanvas, type VNode, type VEdge } from '../graph/VisNetworkCanvas'
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

/** Short display label for a node: its known name/first_name/title or fallback. */
function nodeDisplay(n: GraphNodeData): string {
  const p = n.properties
  for (const key of ['name', 'treatment_type', 'substance', 'first_name', 'title', 'description']) {
    if (typeof p[key] === 'string' && (p[key] as string).length) {
      if (key === 'first_name' && typeof p.last_name === 'string') {
        return `${p.first_name} ${p.last_name}`
      }
      return p[key] as string
    }
  }
  if (typeof p.id === 'string' || typeof p.id === 'number') return String(p.id)
  return (n.labels[0] ?? 'node') + ' ' + String(n.id ?? '').slice(0, 8)
}

export function GraphCanvas({ nodes, edges }: Props) {
  const visNodes: VNode[] = useMemo(() => {
    return nodes.map((n) => ({
      id: n.id,
      label: nodeDisplay(n),
      labels: n.labels,
      properties: n.properties,
    }))
  }, [nodes])

  const visEdges: VEdge[] = useMemo(() => {
    return edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
    }))
  }, [edges])

  return (
    <div className="graph-canvas-wrapper">
      <VisNetworkCanvas
        nodes={visNodes}
        edges={visEdges}
        height="100%"
      />
    </div>
  )
}