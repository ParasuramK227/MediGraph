import ChatPanel from '../components/ChatPanel.jsx'

const SUGGESTIONS = [
  'Where is Paracetamol available?',
  'Find the nearest facility with Ibuprofen in Chennai',
  'Which medicines are in shortage?',
  'Tell me about patient-001',
  'Show me patients similar to patient-001',
  'Where does Metformin come from?',
  'How many nodes are in the graph?',
]

export default function Chatbot() {
  return (
    <div>
      <div className="page-header">
        <h1>Chatbot</h1>
        <p>
          Groq-powered natural-language interface. The LLM only interprets your question and
          explains results computed by deterministic backend services.
        </p>
      </div>

      <div className="chat-shell">
        <ChatPanel suggestions={SUGGESTIONS} />
      </div>
    </div>
  )
}
