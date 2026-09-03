import { useEffect, useRef, useState } from 'react'
import { Send, Loader2, Sparkles } from 'lucide-react'
import { chatQuery, fetchPatients, type Patient } from '../../lib/api'
import './ChatPanel.css'

interface Message {
  role: 'user' | 'assistant'
  text: string
  error?: boolean
}

interface Props {
  compact?: boolean
}

const SUGGESTIONS = [
  'Summarize the latest consultations',
  'What was diagnosed most often?',
  'Which medications were discussed?',
]

export function ChatPanel({ compact = false }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [patientId, setPatientId] = useState<string>('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPatients()
      .then((p) => {
        if (!cancelled) setPatients(p)
      })
      .catch(() => {
        if (!cancelled) setPatients([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  async function submit(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    const userMsg: Message = { role: 'user', text: trimmed }
    setMessages((m) => [...m, userMsg])
    setInput('')
    setBusy(true)
    try {
      const res = await chatQuery(trimmed, patientId || undefined)
      const answer = res.error?.length ? res.error : res.answer
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: answer ?? 'No answer available.', error: !!res.error },
      ])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Chat unavailable.'
      setMessages((m) => [...m, { role: 'assistant', text: msg, error: true }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`chat-panel ${compact ? 'chat-panel--compact' : ''}`}>
      <div className="chat-panel__head">
        <div className="chat-panel__title">
          <Sparkles className="chat-panel__spark" size={15} aria-hidden />
          <span>MediGraph Assistant</span>
        </div>
        <label className="chat-panel__filter">
          Patient
          <select
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            disabled={busy}
          >
            <option value="">All patients</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.first_name} {p.last_name} ({p.id})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="chat-panel__scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-panel__empty">
            <p>Ask about your consultation notes in plain language.</p>
            <div className="chat-panel__suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  onClick={() => submit(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-panel__msg chat-panel__msg--${m.role}`}>
            <div className={`chat-panel__bubble ${m.error ? 'chat-panel__bubble--error' : ''}`}>
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="chat-panel__msg chat-panel__msg--assistant">
            <div className="chat-panel__bubble chat-panel__bubble--typing">
              <Loader2 className="chat-panel__spin" size={14} aria-hidden />
              Consulting notes…
            </div>
          </div>
        )}
      </div>

      <form
        className="chat-panel__form"
        onSubmit={(e) => {
          e.preventDefault()
          submit(input)
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about treatments, diagnoses, medications…"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send message"
          className="chat-panel__send"
        >
          <Send size={16} aria-hidden />
        </button>
      </form>
    </div>
  )
}