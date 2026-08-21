import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api.js'

const SUGGESTIONS = [
  'Where is Paracetamol available?',
  'Which medicines are in shortage?',
  'Tell me about patient-001',
  'Show me patients similar to patient-001',
]

export default function ChatPanel({ suggestions = SUGGESTIONS, onNavigate }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text:
        "Hello! I'm the MediGraph assistant. Ask me about medicine availability, nearby stock, shortages, a specific patient's profile, similar patients, treatment outcomes or supply chains.",
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef(null)

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight)
  }, [messages, busy])

  async function send(text) {
    const message = (text ?? input).trim()
    if (!message || busy) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text: message }])
    setBusy(true)
    try {
      const data = await api.post('/chat', { message })
      setMessages((prev) => [...prev, { role: 'assistant', ...data }])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `Sorry, something went wrong: ${err.message}` },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="chat-messages" ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role === 'user' ? 'user' : ''}`}>
            <div className="chat-bubble">
              <div>{m.text || m.reply}</div>
              {m.role !== 'user' && (
                <>
                  {m.intent && (
                    <div className="chat-meta">
                      intent: {m.intent}
                      {m.degraded ? ' · answered without LLM (degraded mode)' : ''}
                    </div>
                  )}
                  {m.graph_links?.length > 0 && (
                    <div className="chat-links">
                      {m.graph_links.slice(0, 5).map((l) => (
                        <Link
                          key={l.entity_id}
                          className="chip"
                          to={`/knowledge-graph?entity=${l.entity_id}`}
                          onClick={onNavigate}
                        >
                          Open “{l.label}” in Knowledge Graph →
                        </Link>
                      ))}
                    </div>
                  )}
                  {m.disclaimer && <div className="chat-meta">{m.disclaimer}</div>}
                </>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="chat-msg"><div className="chat-bubble muted">Thinking…</div></div>}
      </div>

      <div className="chat-input-row">
        <input
          type="text"
          placeholder="Ask about medicines, patients, supply chains…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={busy}
        />
        <button className="btn" onClick={() => send()} disabled={busy}>
          Send
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="chat-widget-suggest">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              style={{ cursor: 'pointer' }}
              onClick={() => send(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
