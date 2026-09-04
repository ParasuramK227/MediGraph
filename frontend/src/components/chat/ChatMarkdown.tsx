import React from 'react'
import './ChatMarkdown.css'

interface Props {
  content: string
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const token = match[0]
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(<em key={match.index}>{token.slice(1, -1)}</em>)
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(<code key={match.index}>{token.slice(1, -1)}</code>)
    } else {
      parts.push(token)
    }
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

export const ChatMarkdown: React.FC<Props> = ({ content }) => {
  if (!content) return null

  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index++
      continue
    }

    // 1. Headers (###, ##, #)
    if (trimmed.startsWith('### ')) {
      elements.push(<h4 key={index} className="cmd-h4">{renderInline(trimmed.slice(4))}</h4>)
      index++
      continue
    }
    if (trimmed.startsWith('## ')) {
      elements.push(<h3 key={index} className="cmd-h3">{renderInline(trimmed.slice(3))}</h3>)
      index++
      continue
    }
    if (trimmed.startsWith('# ')) {
      elements.push(<h2 key={index} className="cmd-h2">{renderInline(trimmed.slice(2))}</h2>)
      index++
      continue
    }

    // 2. Markdown Table: lines starting and ending with |
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = []
      while (index < lines.length && lines[index].trim().startsWith('|') && lines[index].trim().endsWith('|')) {
        tableLines.push(lines[index].trim())
        index++
      }

      if (tableLines.length >= 2) {
        const headerCols = tableLines[0]
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim())
        const isSeparator = /^\|?(\s*:?-+:?\s*\|?)+$/.test(tableLines[1])
        const rowStart = isSeparator ? 2 : 1
        const rows = tableLines.slice(rowStart).map((row) =>
          row
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim()),
        )

        elements.push(
          <div key={`tbl-${index}`} className="cmd-table-wrap">
            <table className="cmd-table">
              <thead>
                <tr>
                  {headerCols.map((h, hi) => (
                    <th key={hi}>{renderInline(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>{renderInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        )
        continue
      }
    }

    // 3. Bullet list (- or *)
    if (/^[-*]\s+/.test(trimmed)) {
      const listItems: string[] = []
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        listItems.push(lines[index].trim().replace(/^[-*]\s+/, ''))
        index++
      }
      elements.push(
        <ul key={`ul-${index}`} className="cmd-ul">
          {listItems.map((item, li) => (
            <li key={li}>{renderInline(item)}</li>
          ))}
        </ul>,
      )
      continue
    }

    // 4. Numbered list (1. 2. etc.)
    if (/^\d+\.\s+/.test(trimmed)) {
      const listItems: string[] = []
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        listItems.push(lines[index].trim().replace(/^\d+\.\s+/, ''))
        index++
      }
      elements.push(
        <ol key={`ol-${index}`} className="cmd-ol">
          {listItems.map((item, li) => (
            <li key={li}>{renderInline(item)}</li>
          ))}
        </ol>,
      )
      continue
    }

    // 5. Default paragraph
    elements.push(
      <p key={index} className="cmd-p">
        {renderInline(trimmed)}
      </p>,
    )
    index++
  }

  return <div className="cmd-container">{elements}</div>
}
