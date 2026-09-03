import { ChatPanel } from '../components/chat/ChatPanel'
import './ChatbotPage.css'

export function ChatbotPage() {
  return (
    <div className="page">
      <h1 className="page__heading">Chatbot</h1>
      <p className="chatbot-page__sub">
        Ask questions about patients, treatments, and past consultation notes in
        natural language. Answers are grounded in the consultation notes stored in
        the graph.
      </p>
      <div className="chatbot-page__panel">
        <ChatPanel />
      </div>
    </div>
  )
}