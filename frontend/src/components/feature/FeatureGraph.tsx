import { VisNetworkCanvas, type VNode, type VEdge } from '../graph/VisNetworkCanvas'

export type FNode = VNode
export type FEdge = VEdge

interface Props {
  nodes: FNode[]
  edges: FEdge[]
  height?: number
  centerId?: string
  edgeLabelZoom?: number
}

export function FeatureGraph({
  nodes,
  edges,
  height = 580,
  centerId,
  edgeLabelZoom = 1.0,
}: Props) {
  return (
    <VisNetworkCanvas
      nodes={nodes}
      edges={edges}
      height={height}
      centerId={centerId}
      edgeLabelZoom={edgeLabelZoom}
    />
  )
}