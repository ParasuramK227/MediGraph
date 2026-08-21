import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import ChatPanel from './ChatPanel.jsx'

function MascotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // The dedicated /chatbot page already shows the full interface.
  if (location.pathname === '/chatbot') return null

  return (
    <>
      {open && (
        <div className="chat-widget-panel" role="dialog" aria-label="MediGraph assistant">
          <div className="chat-widget-head">
            <span className="avatar"><MascotIcon /></span>
            <div>
              <h4>MediGraph Assistant</h4>
              <p>Deterministic answers from the knowledge graph</p>
            </div>
            <button type="button" className="close-btn" onClick={() => setOpen(false)} aria-label="Close chat">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="chat-widget-body">
            <ChatPanel
              suggestions={['Where is Paracetamol available?', 'Tell me about patient-001', 'Which medicines are in shortage?']}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </div>
      )}
      <button
        type="button"
        className="chat-fab"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        title="MediGraph assistant"
      >
        {open ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <MascotIcon />
        )}
      </button>
    </>
  )
}
