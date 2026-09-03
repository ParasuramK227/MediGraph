const API_BASE: string = import.meta.env.VITE_API_BASE ?? ''

export interface HealthStatus {
  status: 'ok' | 'degraded'
  neo4j: 'connected' | 'disconnected'
}

export async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetch(`${API_BASE}/api/health`)
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
  const data = (await res.json()) as Partial<HealthStatus>
  return {
    status: data.status ?? 'degraded',
    neo4j: data.neo4j ?? 'disconnected',
  }
}

export interface ScribeNote {
  summary: string
  diagnoses: string[]
  action_items: string[]
  medications_discussed: string[]
}

export interface ScribeStatus {
  status:
    | 'idle'
    | 'transcribing'
    | 'review'
    | 'approved'
    | 'extracting'
    | 'extracted'
    | 'extract_error'
    | 'save_error'
    | 'saved'
  failure_count: number
  retry_disabled: boolean
}

// --- Scribe pipeline -------------------------------------------------------

export async function scribeStart(): Promise<{ session_id: string }> {
  const res = await fetch(`${API_BASE}/api/scribe/start`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to start session: ${res.status}`)
  return res.json()
}

export interface UploadResult {
  session_id: string
  transcript?: string
  status?: string
  error?: string
  failure_count?: number
  retry_disabled?: boolean
}

export async function scribeUpload(
  sessionId: string,
  audioBlob: Blob,
  filename = 'recording.webm',
): Promise<UploadResult> {
  const form = new FormData()
  form.append('session_id', sessionId)
  form.append('audio', audioBlob, filename)
  const res = await fetch(`${API_BASE}/api/scribe/upload`, { method: 'POST', body: form })
  return (await res.json()) as UploadResult
}

export async function scribeGetTranscript(sessionId: string): Promise<{
  transcript: string
  approved: boolean
  status: string
}> {
  const res = await fetch(`${API_BASE}/api/scribe/transcript/${sessionId}`)
  if (!res.ok) throw new Error(`No transcript: ${res.status}`)
  return res.json()
}

export async function scribeSaveTranscript(
  sessionId: string,
  transcript: string,
  approved = true,
): Promise<{ status: string; approved: boolean }> {
  const res = await fetch(`${API_BASE}/api/scribe/transcript/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, approved }),
  })
  if (!res.ok) throw new Error(`Failed to save edited transcript: ${res.status}`)
  return res.json()
}

export async function scribeExtract(
  sessionId: string,
): Promise<{ status: string; note?: ScribeNote; error?: string }> {
  const res = await fetch(`${API_BASE}/api/scribe/extract/${sessionId}`, { method: 'POST' })
  return (await res.json()) as { status: string; note?: ScribeNote; error?: string }
}

export async function scribeSave(
  sessionId: string,
  patientId: string,
  note: ScribeNote,
): Promise<{ status: string; note_id: string }> {
  const res = await fetch(`${API_BASE}/api/scribe/save/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patient_id: patientId, note }),
  })
  if (!res.ok) throw new Error(`Failed to save note: ${res.status}`)
  return res.json()
}

export interface Patient {
  id: string
  first_name: string
  last_name: string
  gender?: string
  date_of_birth?: string
  email?: string
  contact_number?: string
}

// The backend returns patients in raw graph form: { element_id, labels,
// properties }. Normalize so the UI works against a flat Patient object.
interface RawNode {
  element_id: string
  labels?: string[]
  properties?: Record<string, unknown>
}

function toPatient(raw: RawNode): Patient {
  const p = raw.properties ?? {}
  const str = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = p[k]
      if (typeof v === 'string' && v) return v
    }
    return undefined
  }
  return {
    id: str('id') ?? raw.element_id ?? '',
    first_name: str('first_name') ?? '',
    last_name: str('last_name') ?? '',
    gender: str('gender'),
    date_of_birth: str('date_of_birth'),
    email: str('email'),
    contact_number: str('contact_number'),
  }
}

// --- Patients --------------------------------------------------------------

export async function fetchPatients(): Promise<Patient[]> {
  const res = await fetch(`${API_BASE}/api/graph/patients`)
  if (!res.ok) throw new Error(`Failed to fetch patients: ${res.status}`)
  const data = (await res.json()) as RawNode[]
  return Array.isArray(data) ? data.map(toPatient) : []
}

export async function fetchPatient(id: string): Promise<Patient | null> {
  const res = await fetch(`${API_BASE}/api/graph/patients/${id}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to fetch patient: ${res.status}`)
  const data = (await res.json()) as { patient?: RawNode } | null
  return data?.patient ? toPatient(data.patient) : null
}

// --- Graph schema + Cypher (admin panel) -------------------------------

export interface LabelCount {
  label: string
  count: number
}
export interface RelCount {
  type: string
  count: number
}
export interface GraphSchema {
  labels: LabelCount[]
  relationships: RelCount[]
  property_keys: string[]
  node_count: number
  relationship_count: number
  last_update: string
}

export async function fetchSchema(): Promise<GraphSchema> {
  const res = await fetch(`${API_BASE}/api/graph/schema`)
  if (!res.ok) throw new Error(`Failed to fetch schema: ${res.status}`)
  return res.json()
}

export interface CypherResult {
  columns: string[]
  rows: unknown[][]
  timing: { elapsed_ms: number }
  row_count: number
  error?: string
}

export async function runCypher(query: string, params: Record<string, unknown> = {}): Promise<CypherResult> {
  const res = await fetch(`${API_BASE}/api/graph/cypher`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, params }),
  })
  const data = (await res.json()) as CypherResult
  return data
}

// --- Chatbot --------------------------------------------------------------

export interface ChatResponse {
  answer?: string
  candidate_count?: number
  source_count?: number
  error?: string
}

export async function chatQuery(
  message: string,
  patientId?: string,
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/chat/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, patient_id: patientId }),
  })
  return (await res.json()) as ChatResponse
}