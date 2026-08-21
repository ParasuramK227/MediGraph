import { useEffect, useRef } from 'react'
import cytoscape from 'cytoscape'

const TYPE_COLORS = {
  Patient: '#2563eb',
  Disease: '#dc2626',
  Symptom: '#f59e0b',
  Treatment: '#059669',
  Medication: '#7c3aed',
  DrugBatch: '#0d9488',
  Manufacturer: '#64748b',
  Supplier: '#94a3b8',
  Distributor: '#a8a29e',
  Warehouse: '#b45309',
  Hospital: '#1d4ed8',
  Pharmacy: '#4f46e5',
  ClinicalStudy: '#334155',
  Evidence: '#6b7280',
  MedicalRecord: '#9ca3af',
  LabTest: '#ca8a04',
  Doctor: '#0f766e',
}

function buildElements(nodes = [], edges = []) {
  const nodeEls = nodes.map((n) => ({
    data: {
      id: n.id,
      label: n.label || n.id,
      type: n.type,
      color: TYPE_COLORS[n.type] || '#64748b',
    },
  }))
  const seen = new Set(nodeEls.map((el) => el.data.id))
  const edgeEls = edges
    .filter((e) => seen.has(e.source) && seen.has(e.target))
    .map((e) => ({
      data: {
        id: e.id || `${e.source}-${e.type}-${e.target}`,
        source: e.source,
        target: e.target,
        label: e.type,
      },
    }))
  return [...nodeEls, ...edgeEls]
}

export default function GraphCanvas({
  nodes,
  edges,
  onSelect,
  layoutName = 'cose',
  fitKey = 0,
}) {
  const containerRef = useRef(null)
  const cyRef = useRef(null)

  useEffect(() => {
    const cy = cytoscape({
      container: containerRef.current,
      elements: buildElements(nodes, edges),
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            label: 'data(label)',
            color: '#1e293b',
            'font-size': 9,
            width: 26,
            height: 26,
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'border-width': 2,
            'border-color': '#ffffff',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#cbd5e1',
            'target-arrow-color': '#cbd5e1',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': 7,
            color: '#64748b',
            'text-background-color': '#f8fafc',
            'text-background-opacity': 1,
            'text-background-padding': 2,
          },
        },
        {
          selector: 'node:selected',
          style: { 'border-width': 3, 'border-color': '#0ea5e9' },
        },
      ],
      layout: { name: layoutName, animate: false, padding: 24 },
      wheelSensitivity: 0.2,
    })
    cy.on('tap', 'node', (event) => {
      const node = event.target
      onSelect?.({ id: node.id(), type: node.data('type'), label: node.data('label') })
    })
    cyRef.current = cy
    return () => cy.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, layoutName])

  useEffect(() => {
    if (cyRef.current && fitKey > 0) {
      cyRef.current.layout({ name: layoutName, animate: false, padding: 24 }).run()
      cyRef.current.fit(undefined, 24)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey])

  return <div className="graph-canvas" ref={containerRef} />
}
