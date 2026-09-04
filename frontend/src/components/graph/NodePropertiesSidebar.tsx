import React, { useState } from 'react'
import { X, Copy, Check, ExternalLink, ArrowRight, ArrowLeft, Tag, Layers, Database } from 'lucide-react'
import { Link } from 'react-router-dom'
import { labelColor, chipTextContrast } from '../../lib/graphColors'
import { formatClinicalDate, formatCurrency } from '../../lib/formatters'
import './NodePropertiesSidebar.css'

export interface ConnectedEdgeInfo {
  id: string
  source: string
  target: string
  label: string
  otherNodeId: string
  otherNodeLabel: string
  isOutgoing: boolean
}

export interface SelectedNodeInfo {
  id: string
  label: string
  labels: string[]
  properties: Record<string, unknown>
  connectedEdges?: ConnectedEdgeInfo[]
}

interface Props {
  node: SelectedNodeInfo | null
  onClose: () => void
  onSelectNodeById?: (id: string) => void
}

export function NodePropertiesSidebar({ node, onClose, onSelectNodeById }: Props) {
  const [copied, setCopied] = useState(false)

  if (!node) return null

  const primaryLabel = node.labels[0] || 'Node'
  const color = labelColor(primaryLabel)
  const contrast = chipTextContrast(color)

  const handleCopyId = () => {
    navigator.clipboard.writeText(node.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Filter out internal / redundant properties
  const skipKeys = new Set(['element_id', 'id', 'labels'])
  const entries = Object.entries(node.properties).filter(([k, v]) => !skipKeys.has(k) && v !== null && v !== undefined && v !== '')

  const formatKey = (key: string): string => {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }

  const formatValue = (key: string, val: unknown): React.ReactNode => {
    if (typeof val === 'boolean') {
      return (
        <span className={`nps-bool ${val ? 'nps-bool--true' : 'nps-bool--false'}`}>
          {val ? 'TRUE' : 'FALSE'}
        </span>
      )
    }
    if (Array.isArray(val)) {
      if (val.length === 0) return <span className="nps-muted">—</span>
      return (
        <div className="nps-array">
          {val.map((item, idx) => (
            <span key={idx} className="nps-tag">
              {String(item)}
            </span>
          ))}
        </div>
      )
    }
    if (typeof val === 'object' && val !== null) {
      return <pre className="nps-json">{JSON.stringify(val, null, 2)}</pre>
    }
    const s = String(val)
    if (s.startsWith('http://') || s.startsWith('https://')) {
      return (
        <a href={s} target="_blank" rel="noopener noreferrer" className="nps-link">
          {s} <ExternalLink size={12} />
        </a>
      )
    }

    const lowerKey = key.toLowerCase()
    // Format dates cleanly
    if (lowerKey.includes('date') || lowerKey.includes('start') || lowerKey.includes('stop') || lowerKey.includes('birth') || lowerKey.includes('created')) {
      if (typeof s === 'string' && (s.includes('-') || s.includes('T'))) {
        return <span className="nps-date-val">{formatClinicalDate(s)}</span>
      }
    }
    // Format monetary amounts
    if (lowerKey.includes('cost') || lowerKey.includes('income')) {
      return <span className="nps-cost-val">{formatCurrency(s)}</span>
    }
    // Format success rate
    if (lowerKey === 'success' && typeof val === 'number') {
      return <span className="nps-stat-val">{Math.round(val * 100)}%</span>
    }
    // Format outcome badge
    if (lowerKey === 'outcome') {
      return <span className={`nps-outcome-badge nps-outcome-badge--${s.toLowerCase()}`}>{s}</span>
    }

    return s
  }

  // Navigation link if it's a known first-class entity
  const isPatient = node.labels.includes('Patient')
  const isDisease = node.labels.includes('Disease')
  const diseaseSlug = isDisease ? node.label.toLowerCase().replace(/[^a-z0-9]+/g, '-') : ''

  return (
    <aside className="nps-sidebar" aria-label="Node Properties Panel">
      <div className="nps-header">
        <div className="nps-header__top">
          <span
            className="nps-badge"
            style={{
              backgroundColor: color,
              color: contrast === 'light' ? '#ffffff' : '#111111',
            }}
          >
            {primaryLabel}
          </span>
          <button
            type="button"
            className="nps-close"
            onClick={onClose}
            aria-label="Close properties sidebar"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        <h3 className="nps-title" title={node.label}>
          {node.label}
        </h3>

        <div className="nps-id-row">
          <span className="nps-id-label">ID:</span>
          <code className="nps-id-val" title={node.id}>
            {node.id}
          </code>
          <button
            type="button"
            className="nps-copy-btn"
            onClick={handleCopyId}
            title="Copy ID to clipboard"
          >
            {copied ? <Check size={12} className="nps-copied-icon" /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      <div className="nps-body">
        {/* Labels pill group */}
        {node.labels.length > 1 && (
          <div className="nps-section">
            <div className="nps-section__head">
              <Layers size={13} />
              <span>Neo4j Labels</span>
            </div>
            <div className="nps-labels-list">
              {node.labels.map((lbl) => (
                <span key={lbl} className="nps-label-pill">
                  :{lbl}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Properties Grid */}
        <div className="nps-section">
          <div className="nps-section__head">
            <Database size={13} />
            <span>Properties ({entries.length})</span>
          </div>

          {entries.length === 0 ? (
            <p className="nps-empty">No additional properties stored.</p>
          ) : (
            <div className="nps-props-grid">
              {entries.map(([k, v]) => (
                <div key={k} className="nps-prop-item">
                  <div className="nps-prop-key">{formatKey(k)}</div>
                  <div className="nps-prop-value">{formatValue(k, v)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Connected Edges */}
        {node.connectedEdges && node.connectedEdges.length > 0 && (
          <div className="nps-section">
            <div className="nps-section__head">
              <Tag size={13} />
              <span>Graph Connections ({node.connectedEdges.length})</span>
            </div>
            <div className="nps-edges-list">
              {node.connectedEdges.map((e) => (
                <div
                  key={e.id}
                  className={`nps-edge-item ${onSelectNodeById ? 'nps-edge-item--clickable' : ''}`}
                  onClick={() => onSelectNodeById && onSelectNodeById(e.otherNodeId)}
                  title={onSelectNodeById ? `Select ${e.otherNodeLabel}` : undefined}
                >
                  <div className="nps-edge-rel">
                    {e.isOutgoing ? (
                      <ArrowRight size={12} className="nps-edge-dir nps-edge-dir--out" />
                    ) : (
                      <ArrowLeft size={12} className="nps-edge-dir nps-edge-dir--in" />
                    )}
                    <span className="nps-rel-type">[:{e.label}]</span>
                  </div>
                  <div className="nps-edge-target">
                    <span className="nps-edge-node-title">{e.otherNodeLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Deep Link */}
        {(isPatient || isDisease) && (
          <div className="nps-footer">
            {isPatient && (
              <Link to={`/patients/${node.id}`} className="nps-action-btn">
                View Full Patient Record <ExternalLink size={13} />
              </Link>
            )}
            {isDisease && diseaseSlug && (
              <Link to={`/sectors/${diseaseSlug}`} className="nps-action-btn">
                Explore Disease Sector <ExternalLink size={13} />
              </Link>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
