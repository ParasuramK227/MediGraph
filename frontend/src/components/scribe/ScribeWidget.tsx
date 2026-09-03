import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Mic,
  Square,
  Loader2,
  Save,
  FileText,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  PenLine,
} from 'lucide-react'
import {
  scribeStart,
  scribeUpload,
  scribeSaveTranscript,
  scribeExtract,
  scribeSave,
  type ScribeNote,
} from '../../lib/api'
import './ScribeWidget.css'

type ScribeStage =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'review'
  | 'extracting'
  | 'saved'
  | 'error'

interface Props {
  patientId: string
}

export function ScribeWidget({ patientId }: Props) {
  const [stage, setStage] = useState<ScribeStage>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const [failures, setFailures] = useState(0)
  const [retryDisabled, setRetryDisabled] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [savedNote, setSavedNote] = useState<ScribeNote | null>(null)
  const [useTypedNote, setUseTypedNote] = useState(false)
  const [typedNote, setTypedNote] = useState('')
  const [recordingSeconds, setRecordingSeconds] = useState(0)

  // recording + visualizer refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const stopVisualizer = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined)
      audioCtxRef.current = null
      analyserRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setRecordingSeconds(0)
  }, [])

  // CAVA-style amplitude visualizer
  type AudioContextCtor = typeof window.AudioContext

  const startVisualizer = useCallback((stream: MediaStream) => {
    const Ctx = (window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext) as
      | AudioContextCtor
      | undefined
    if (!Ctx) return
    const ctx = new Ctx()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    audioCtxRef.current = ctx
    analyserRef.current = analyser

    const freqData = new Uint8Array(analyser.frequencyBinCount)
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return
    const barCount = 48

    const draw = () => {
      const width = canvas.width
      const height = canvas.height
      analyser.getByteFrequencyData(freqData)
      ctx2d.clearRect(0, 0, width, height)
      const step = Math.floor(freqData.length / barCount)
      for (let i = 0; i < barCount; i++) {
        const raw = freqData[i * step] / 255
        // amplitude-reactive, near zero shows a tiny idle bar
        const h = Math.max(0.04, raw) * height
        const w = width / barCount - 3
        ctx2d.fillStyle = getComputedStyle(canvas).getPropertyValue('--color-accent') || '#2f6df6'
        ctx2d.fillRect(i * (width / barCount) + 1.5, height - h, w, h)
      }
      animFrameRef.current = requestAnimationFrame(draw)
    }
    draw()
  }, [])

  const beginRecording = useCallback(async () => {
    setErrorMsg('')
    setUseTypedNote(false)
    setTypedNote('')
    // Backend requires a session first.
    try {
      const { session_id } = await scribeStart()
      setSessionId(session_id)
    } catch {
      setStage('error')
      setErrorMsg('Could not start a scribe session. Check that the backend is running.')
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setStage('error')
      setErrorMsg('Microphone access was denied. Allow mic access to record, or use typed note instead.')
      setUseTypedNote(true)
      return
    }

    setStage('recording')
    setRecordingSeconds(0)
    timerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000)
    startVisualizer(stream)

    const mime = MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : ''
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    mediaRecorderRef.current = rec
    chunksRef.current = []
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
    }
    rec.start()
  }, [startVisualizer])

  const stopRecording = useCallback(async () => {
    const rec = mediaRecorderRef.current
    if (!rec || rec.state !== 'recording') return
    const mime = rec.mimeType || 'audio/webm'
    stopVisualizer()

    const done = new Promise<void>((resolve) => {
      rec.onstop = () => resolve()
    })
    rec.stop()
    await done

    const blob = new Blob(chunksRef.current, { type: mime })
    const filename = `recording-${Date.now()}.webm`

    setStage('transcribing')

    if (!sessionId) {
      setStage('error')
      setErrorMsg('Missing session id.')
      return
    }

    try {
      const result = await scribeUpload(sessionId, blob, filename)
      if (result.error || !result.transcript) {
        const count = result.failure_count ?? failures + 1
        setFailures(count)
        setRetryDisabled(count >= 3)
        setStage('error')
        setErrorMsg(result.error ?? 'Transcription failed.')
        return
      }
      setFailures(0)
      setRetryDisabled(false)
      setTranscript(result.transcript)
      setStage('review')
    } catch {
      const count = failures + 1
      setFailures(count)
      setRetryDisabled(count >= 3)
      setStage('error')
      setErrorMsg('Transcription request failed. Check the backend connection.')
    }
  }, [sessionId, failures, stopVisualizer])

  const approveAndExtract = useCallback(async () => {
    if (!sessionId || !transcript.trim()) return
    setStage('extracting')
    try {
      await scribeSaveTranscript(sessionId, transcript, true)
      const result = await scribeExtract(sessionId)
      if (result.error || !result.note) {
        setStage('error')
        setErrorMsg(result.error ?? 'Extraction failed.')
        return
      }
      setSavedNote(result.note)
      setStage('saved')
    } catch {
      setStage('error')
      setErrorMsg('Extraction failed. Check the Groq API key / backend.')
    }
  }, [sessionId, transcript])

  const saveToGraph = useCallback(async () => {
    if (!sessionId || !savedNote) return
    try {
      await scribeSave(sessionId, patientId, savedNote)
      // keep visual confirmation; offer a fresh session next
      setStage('saved')
    } catch {
      setStage('error')
      setErrorMsg('Failed to persist the note to the graph.')
    }
  }, [sessionId, savedNote, patientId])

  const retry = useCallback(() => {
    setFailures((f) => f + 1)
    if (failures + 1 >= 3) setRetryDisabled(true)
    setUseTypedNote(false)
    setStage('idle')
    setErrorMsg('')
  }, [failures])

  const beginTypedNote = useCallback(() => {
    setUseTypedNote(true)
    setStage('idle')
    setErrorMsg('')
  }, [])

  const cancelTypedNote = useCallback(() => {
    setUseTypedNote(false)
    setTypedNote('')
    setStage('idle')
  }, [])

  const startTypedReview = useCallback(async () => {
    if (!typedNote.trim()) return
    try {
      const { session_id } = await scribeStart()
      setSessionId(session_id)
      await scribeSaveTranscript(session_id, typedNote, true)
      setTranscript(typedNote)
      setStage('review')
    } catch {
      setStage('error')
      setErrorMsg('Could not start a session for the typed note.')
    }
  }, [typedNote])

  const resetAll = useCallback(() => {
    stopVisualizer()
    setStage('idle')
    setSessionId(null)
    setTranscript('')
    setFailures(0)
    setRetryDisabled(false)
    setErrorMsg('')
    setSavedNote(null)
    setUseTypedNote(false)
    setTypedNote('')
  }, [stopVisualizer])

  useEffect(() => {
    return () => {
      stopVisualizer()
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [stopVisualizer])

  const renderRecording = (
    <div className="scribe-pop" role="status">
      <div className="scribe-recording-head">
        <span className="scribe-rec-dot" />
        <span className="scribe-rec-timer">{recordingSeconds}s</span>
      </div>
      <canvas ref={canvasRef} className="scribe-visualizer" width={480} height={80} />
      <button className="scribe-btn scribe-btn--stop" onClick={() => void stopRecording()}>
        <Square size={16} /> Stop recording
      </button>
    </div>
  )

  const renderTranscribing = (
    <div className="scribe-pop scribe-pop--center" role="status">
      <Loader2 className="scribe-spin" size={26} />
      <span>Transcribing audio…</span>
      <span className="scribe-note-muted">Provisional transcript will appear for doctor review.</span>
    </div>
  )

  const renderExtracting = (
    <div className="scribe-pop scribe-pop--center" role="status">
      <Loader2 className="scribe-spin" size={26} />
      <span>Structuring the clinical note…</span>
    </div>
  )

  const renderReview = (
    <div className="scribe-pop">
      <h4 className="scribe-title">
        <FileText size={16} /> Review &amp; approve transcript
      </h4>
      <textarea
        className="scribe-textarea"
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        rows={8}
      />
      <div className="scribe-actions">
        <button className="scribe-btn scribe-btn--secondary" onClick={resetAll}>
          Discard
        </button>
        <button
          className="scribe-btn scribe-btn--primary"
          disabled={!transcript.trim()}
          onClick={() => void approveAndExtract()}
        >
          Approve &amp; extract note
        </button>
      </div>
      <p className="scribe-note-muted">
        Extraction only runs after you approve this edited transcript.
      </p>
    </div>
  )

  const renderSaved = savedNote ? (
    <div className="scribe-pop">
      <div className="scribe-saved-head">
        <CheckCircle2 className="scribe-success" size={22} />
        <h4 className="scribe-title">Note extracted &amp; saved</h4>
      </div>
      <p className="scribe-summary">{savedNote.summary}</p>
      <div className="scribe-sec">
        <span className="scribe-sec-label">Diagnoses</span>
        <ul className="scribe-list">
          {savedNote.diagnoses.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </div>
      <div className="scribe-sec">
        <span className="scribe-sec-label">Action items</span>
        <ul className="scribe-list">
          {savedNote.action_items.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>
      <div className="scribe-sec">
        <span className="scribe-sec-label">Medications discussed</span>
        <ul className="scribe-list">
          {savedNote.medications_discussed.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </div>
      <div className="scribe-actions">
        <button className="scribe-btn scribe-btn--secondary" onClick={resetAll}>
          New consultation
        </button>
        <button className="scribe-btn scribe-btn--primary" onClick={() => void saveToGraph()}>
          <Save size={16} /> Save to graph
        </button>
      </div>
    </div>
  ) : null

  const renderError = (
    <div className="scribe-pop scribe-pop--error">
      <div className="scribe-error-head">
        <AlertTriangle size={20} className="scribe-warn" />
        <h4 className="scribe-title">Transcription failed</h4>
      </div>
      <p>{errorMsg}</p>
      {useTypedNote || retryDisabled ? (
        <p className="scribe-note-muted">
          Retry has been {retryDisabled ? 'disabled after several failures' : 'skipped'}. You can
          type the note manually below.
        </p>
      ) : null}
      <textarea
        className="scribe-textarea"
        value={typedNote}
        onChange={(e) => setTypedNote(e.target.value)}
        placeholder="Type the consultation note here…"
        rows={6}
      />
      <div className="scribe-actions">
        {!retryDisabled && !useTypedNote ? (
          <button className="scribe-btn scribe-btn--secondary" onClick={retry}>
            <RotateCcw size={16} /> Retry
          </button>
        ) : null}
        <button className="scribe-btn scribe-btn--secondary" onClick={beginTypedNote}>
          <PenLine size={16} /> Switch to typed note
        </button>
        <button
          className="scribe-btn scribe-btn--primary"
          disabled={!typedNote.trim()}
          onClick={() => void startTypedReview()}
        >
          Use typed note
        </button>
      </div>
    </div>
  )

  return (
    <aside className="scribe-widget">
      <h3 className="scribe-widget-title">
        <Mic size={16} /> Scribe
      </h3>

      {stage === 'idle' &&
        (useTypedNote ? (
          <div className="scribe-pop scribe-pop--idle">
            <h4 className="scribe-title">
              <PenLine size={16} /> Type a consultation note
            </h4>
            <textarea
              className="scribe-textarea"
              value={typedNote}
              onChange={(e) => setTypedNote(e.target.value)}
              placeholder="Type the consultation note here…"
              rows={8}
            />
            <div className="scribe-actions">
              <button className="scribe-btn scribe-btn--secondary" onClick={cancelTypedNote}>
                Cancel
              </button>
              <button
                className="scribe-btn scribe-btn--primary"
                disabled={!typedNote.trim()}
                onClick={() => void startTypedReview()}
              >
                <PenLine size={16} /> Use typed note
              </button>
            </div>
          </div>
        ) : (
          <div className="scribe-pop scribe-pop--idle">
            <p className="scribe-note-muted">
              Record a live consultation or type the note manually. The transcript is reviewed and
              approved before any extraction runs.
            </p>
            <div className="scribe-actions">
              <button className="scribe-btn scribe-btn--record" onClick={() => void beginRecording()}>
                <Mic size={16} /> Record
              </button>
              <button className="scribe-btn scribe-btn--secondary" onClick={beginTypedNote}>
                <PenLine size={16} /> Type note
              </button>
            </div>
          </div>
        ))}

      {stage === 'recording' && renderRecording}
      {stage === 'transcribing' && renderTranscribing}
      {stage === 'review' && renderReview}
      {stage === 'extracting' && renderExtracting}
      {stage === 'saved' && renderSaved}
      {stage === 'error' && renderError}

      {failures > 0 && stage !== 'idle' && (
        <p className="scribe-failure-count">Failures: {failures} / 3</p>
      )}
    </aside>
  )
}