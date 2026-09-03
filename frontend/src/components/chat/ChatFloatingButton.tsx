import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, Maximize2, X } from 'lucide-react'
import { ChatPanel } from './ChatPanel'
import './ChatFloatingButton.css'

export function ChatFloatingButton() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <>
      {open && (
        <div className="chat-float">
          <div className="chat-float__head">
            <div className="chat-float__title">
              <MessageSquare size={15} aria-hidden />
              <span>Ask MediGraph</span>
            </div>
            <div className="chat-float__actions">
              <button
                type="button"
                aria-label="Open full page"
                onClick={() => navigate('/chatbot')}
              >
                <Maximize2 size={15} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <X size={15} aria-hidden />
              </button>
            </div>
          </div>
          <ChatPanel compact />
        </div>
      )}

      <button
        type="button"
        className={`chat-float__toggle ${open ? 'chat-float__toggle--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close chat' : 'Open chat'}
      >
        {open ? <X size={22} aria-hidden /> : <MessageSquare size={22} aria-hidden />}
      </button>
    </>
  )
}