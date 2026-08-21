import { useEffect, useRef } from 'react'
import cytoscape from 'cytoscape'
import useTheme from '../hooks/useTheme.js'

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

// Dark-slate label that reads clearly but stays softer than pure black.
const THEME = {
  light: {
    nodeLabel: '#334155',
    edgeLine: '#94a3b8',
    edgeLabel: '#475569',
    textBg: '#ffffff',
    selection: '#0ea5e9',
  },
  dark: {
    nodeLabel: '#cbd5e1',
    edgeLine: '#43587d',
    edgeLabel: '#9fb2d1',
    textBg: '#111a2c',
    selection: '#38bdf8',
  },
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
  const theme = useTheme()
  const containerRef = useRef(null)
  const cyRef = useRef(null)

  useEffect(() => {
    const t = THEME[theme]
    const cy = cytoscape({
      container: containerRef.current,
      elements: buildElements(nodes, edges),
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            label: 'data(label)',
            color: t.nodeLabel,
            'font-size': 11,
            'font-weight': 600,
            width: 26,
            height: 26,
            'text-valign': 'bottom',
            'text-margin-y': 5,
            'border-width': 2,
            'border-color': t.textBg,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': t.edgeLine,
            'target-arrow-color': t.edgeLine,
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': 8,
            color: t.edgeLabel,
            'text-background-color': t.textBg,
            'text-background-opacity': 0.9,
            'text-background-padding': 2,
          },
        },
        {
          selector: 'node:selected',
          style: { 'border-width': 3, 'border-color': t.selection },
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
  }, [nodes, edges, layoutName, theme])

  useEffect(() => {
    if (cyRef.current && fitKey > 0) {
      cyRef.current.layout({ name: layoutName, animate: false, padding: 24 }).run()
      cyRef.current.fit(undefined, 24)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey])

  return <div className="graph-canvas" ref={containerRef} />
}
