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
  Languages,
  Upload,
  Sparkles,
} from 'lucide-react'
import {
  scribeStart,
  scribeGetToken,
  scribeTranslate,
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
  onNoteSaved?: () => void
}

// Downsample Float32 audio to 16,000 Hz 16-bit linear PCM required by AssemblyAI
function downsampleTo16kPCM(
  inputData: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 16000,
): ArrayBuffer {
  if (inputSampleRate === targetSampleRate) {
    const pcm = new Int16Array(inputData.length)
    for (let i = 0; i < inputData.length; i++) {
      const s = Math.max(-1, Math.min(1, inputData[i]))
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    return pcm.buffer
  }

  const ratio = inputSampleRate / targetSampleRate
  const newLength = Math.round(inputData.length / ratio)
  const result = new Int16Array(newLength)
  let offsetResult = 0
  let offsetInput = 0

  while (offsetResult < result.length) {
    const nextOffsetInput = Math.round((offsetResult + 1) * ratio)
    let accum = 0
    let count = 0
    for (let i = offsetInput; i < nextOffsetInput && i < inputData.length; i++) {
      accum += inputData[i]
      count++
    }
    const sample = count > 0 ? accum / count : 0
    const s = Math.max(-1, Math.min(1, sample))
    result[offsetResult] = s < 0 ? s * 0x8000 : s * 0x7fff
    offsetResult++
    offsetInput = nextOffsetInput
  }
  return result.buffer
}

export function ScribeWidget({ patientId, onNoteSaved }: Props) {
  const [stage, setStage] = useState<ScribeStage>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const [partialTranscript, setPartialTranscript] = useState('')
  const [liveTranslation, setLiveTranslation] = useState('')
  const [enableTranslation, setEnableTranslation] = useState(false)
  const [targetLang, setTargetLang] = useState('English')
  const [isTranslating, setIsTranslating] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)

  const [failures, setFailures] = useState(0)
  const [retryDisabled, setRetryDisabled] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [savedNote, setSavedNote] = useState<ScribeNote | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [useTypedNote, setUseTypedNote] = useState(false)
  const [typedNote, setTypedNote] = useState('')
  const [recordingSeconds, setRecordingSeconds] = useState(0)

  // Recording + visualizer + websocket refs
  const socketRef = useRef<WebSocket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Accumulated transcript ref for real-time appending
  const accumulatedTranscriptRef = useRef('')
  const enableTranslationRef = useRef(enableTranslation)
  const targetLangRef = useRef(targetLang)

  useEffect(() => {
    enableTranslationRef.current = enableTranslation
  }, [enableTranslation])

  useEffect(() => {
    targetLangRef.current = targetLang
  }, [targetLang])

  const stopAudioCapture = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    // Terminate and close WebSocket
    if (socketRef.current) {
      try {
        if (socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ type: 'Terminate' }))
        }
        socketRef.current.close()
      } catch {
        // ignore close errors
      }
      socketRef.current = null
    }

    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.disconnect()
      } catch {}
      scriptProcessorRef.current = null
    }
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect()
      } catch {}
      sourceNodeRef.current = null
    }
    if (audioCtxRef.current) {
      try {
        void audioCtxRef.current.close().catch(() => undefined)
      } catch {}
      audioCtxRef.current = null
      analyserRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    setRecordingSeconds(0)
    setWsConnected(false)
  }, [])

  // CAVA-style visualizer
  const startVisualizer = useCallback((stream: MediaStream, ctx: AudioContext) => {
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    const source = ctx.createMediaStreamSource(stream)
    source.connect(analyser)
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
        const h = Math.max(0.04, raw) * height
        const w = width / barCount - 3
        ctx2d.fillStyle = getComputedStyle(canvas).getPropertyValue('--color-accent') || '#2f6df6'
        ctx2d.fillRect(i * (width / barCount) + 1.5, height - h, w, h)
      }
      animFrameRef.current = requestAnimationFrame(draw)
    }
    draw()
  }, [])

  // Start live recording with AssemblyAI WebSocket streaming
  const beginRecording = useCallback(async () => {
    setErrorMsg('')
    setUseTypedNote(false)
    setTypedNote('')
    setPartialTranscript('')
    setLiveTranslation('')
    accumulatedTranscriptRef.current = ''

    // 1. Start session on backend
    try {
      const { session_id } = await scribeStart()
      setSessionId(session_id)
    } catch {
      setStage('error')
      setErrorMsg('Could not start a scribe session. Check that the backend is running.')
      return
    }

    // 2. Obtain temporary AssemblyAI WebSocket token
    let token = ''
    try {
      const tokenRes = await scribeGetToken()
      if (!tokenRes.token) {
        throw new Error(tokenRes.error || 'ASSEMBLYAI_API_KEY is not configured in .env.')
      }
      token = tokenRes.token
    } catch (e: any) {
      setStage('error')
      setErrorMsg(
        e.message ||
          'AssemblyAI token generation failed. Please ensure ASSEMBLYAI_API_KEY is configured in .env, or use a typed note.',
      )
      return
    }

    // 3. Request microphone access
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
    } catch {
      setStage('error')
      setErrorMsg('Microphone access was denied. Allow mic access or use a typed note instead.')
      setUseTypedNote(true)
      return
    }

    // 4. Initialize Web Audio API
    type AudioContextCtor = typeof window.AudioContext
    const Ctx = (window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext) as
      | AudioContextCtor
      | undefined
    if (!Ctx) {
      setStage('error')
      setErrorMsg('Web Audio API is not supported in this browser.')
      return
    }

    const audioCtx = new Ctx()
    audioCtxRef.current = audioCtx

    setStage('recording')
    setRecordingSeconds(0)
    timerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000)
    startVisualizer(stream, audioCtx)

    // 5. Connect to AssemblyAI v3 Real-Time WebSocket
    const wsUrl = `wss://streaming.assemblyai.com/v3/ws?token=${encodeURIComponent(token)}`
    const socket = new WebSocket(wsUrl)
    socketRef.current = socket

    socket.onopen = () => {
      setWsConnected(true)

      // Downsample and stream 16kHz PCM audio in chunks
      const source = audioCtx.createMediaStreamSource(stream)
      sourceNodeRef.current = source
      const processor = audioCtx.createScriptProcessor(4096, 1, 1)
      scriptProcessorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (socket.readyState !== WebSocket.OPEN) return
        const inputData = e.inputBuffer.getChannelData(0)
        const pcmBuffer = downsampleTo16kPCM(inputData, audioCtx.sampleRate, 16000)
        socket.send(pcmBuffer)
      }

      source.connect(processor)
      processor.connect(audioCtx.destination)
    }

    socket.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data)
        // Handle AssemblyAI v3 Turn messages (as well as legacy v2 events)
        const isTurn =
          data.type === 'Turn' ||
          data.message_type === 'PartialTranscript' ||
          data.message_type === 'FinalTranscript'

        if (isTurn) {
          const text = (data.transcript || data.text || '').trim()
          const isFinal = Boolean(data.end_of_turn || data.message_type === 'FinalTranscript')

          if (isFinal) {
            if (text) {
              accumulatedTranscriptRef.current = (
                accumulatedTranscriptRef.current + ' ' + text
              ).trim()
              setTranscript(accumulatedTranscriptRef.current)
              setPartialTranscript('')

              // Live Translation
              if (enableTranslationRef.current) {
                try {
                  const res = await scribeTranslate(text, targetLangRef.current)
                  if (res.translated_text) {
                    setLiveTranslation((prev) => (prev + ' ' + res.translated_text).trim())
                  }
                } catch {
                  // Ignore live translation hiccups; won't block transcription
                }
              }
            }
          } else {
            setPartialTranscript(text)
          }
        }
      } catch (err) {
        console.error('Error parsing AssemblyAI message:', err)
      }
    }

    socket.onerror = (e) => {
      console.warn('AssemblyAI WebSocket error:', e)
    }

    socket.onclose = () => {
      setWsConnected(false)
    }
  }, [startVisualizer])

  // Stop recording and proceed immediately to doctor review
  const stopRecording = useCallback(async () => {
    stopAudioCapture()

    const finalResult = (accumulatedTranscriptRef.current || transcript).trim()

    if (!finalResult) {
      setStage('error')
      setErrorMsg('No speech was detected during the recording. Please try speaking closer to the mic.')
      return
    }

    // Use translated text if translation was enabled and available
    const readyText = enableTranslation && liveTranslation.trim() ? liveTranslation.trim() : finalResult
    setTranscript(readyText)
    setStage('review')

    // Persist transcript to backend session
    if (sessionId) {
      void scribeSaveTranscript(sessionId, readyText, false).catch(() => undefined)
    }
  }, [sessionId, transcript, enableTranslation, liveTranslation, stopAudioCapture])

  // Handle file upload fallback
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      setErrorMsg('')
      setStage('transcribing')

      let currentSessionId = sessionId
      if (!currentSessionId) {
        try {
          const res = await scribeStart()
          currentSessionId = res.session_id
          setSessionId(res.session_id)
        } catch {
          setStage('error')
          setErrorMsg('Could not initialize session for audio upload.')
          return
        }
      }

      try {
        const result = await scribeUpload(currentSessionId, file, file.name)
        if (result.error || !result.transcript) {
          setStage('error')
          setErrorMsg(result.error || 'AssemblyAI file transcription failed.')
          return
        }
        setTranscript(result.transcript)
        setStage('review')
      } catch {
        setStage('error')
        setErrorMsg('Audio upload transcription request failed.')
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [sessionId],
  )

  // Doctor review: translate full transcript manually
  const translateTranscript = useCallback(async () => {
    if (!transcript.trim() || isTranslating) return
    setIsTranslating(true)
    try {
      const res = await scribeTranslate(transcript, targetLang)
      if (res.translated_text) {
        setTranscript(res.translated_text)
      }
    } catch {
      setErrorMsg('Translation request failed.')
    } finally {
      setIsTranslating(false)
    }
  }, [transcript, targetLang, isTranslating])

  // Doctor review: approve and trigger clinical note extraction
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
      setErrorMsg('Extraction failed. Check the Groq API key or backend connection.')
    }
  }, [sessionId, transcript])

  // Persist structured note to Neo4j
  const saveToGraph = useCallback(async () => {
    if (!sessionId || !savedNote) return
    setIsSaving(true)
    setErrorMsg('')
    try {
      await scribeSave(sessionId, patientId, savedNote)
      setSaveSuccess(true)
      onNoteSaved?.()
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to persist the note to the graph.')
    } finally {
      setIsSaving(false)
    }
  }, [sessionId, savedNote, patientId, onNoteSaved])

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
    stopAudioCapture()
    setStage('idle')
    setSessionId(null)
    setTranscript('')
    setPartialTranscript('')
    setLiveTranslation('')
    setFailures(0)
    setRetryDisabled(false)
    setErrorMsg('')
    setSavedNote(null)
    setIsSaving(false)
    setSaveSuccess(false)
    setUseTypedNote(false)
    setTypedNote('')
  }, [stopAudioCapture])

  useEffect(() => {
    return () => {
      stopAudioCapture()
    }
  }, [stopAudioCapture])

  // --- Render stages ---

  const renderRecording = (
    <div className="scribe-pop" role="status">
      <div className="scribe-recording-head">
        <span className="scribe-rec-dot" />
        <span className="scribe-rec-timer">{recordingSeconds}s</span>
        <span className={`scribe-live-pill ${wsConnected ? 'scribe-live-pill--active' : ''}`}>
          {wsConnected ? (
            <>
              <span className="scribe-live-dot" /> AssemblyAI Live
            </>
          ) : (
            'Connecting…'
          )}
        </span>
      </div>

      <canvas ref={canvasRef} className="scribe-visualizer" width={480} height={70} />

      {/* Live streaming transcript box */}
      <div className="scribe-live-box" aria-live="polite">
        {transcript || partialTranscript ? (
          <>
            <span>{transcript}</span>
            {partialTranscript && <span className="scribe-live-partial">{partialTranscript}</span>}
          </>
        ) : (
          <span className="scribe-note-muted">Listening… speak to transcribe in real-time.</span>
        )}
      </div>

      {/* Live Translation box */}
      {enableTranslation && (
        <div className="scribe-translation-box">
          <div className="scribe-trans-header">
            <Languages size={13} /> Live Clinical Translation ({targetLang})
          </div>
          <div>
            {liveTranslation || (
              <span className="scribe-note-muted">
                Translating spoken sentences into {targetLang} in real time…
              </span>
            )}
          </div>
        </div>
      )}

      <button className="scribe-btn scribe-btn--stop" onClick={() => void stopRecording()}>
        <Square size={16} /> Stop recording
      </button>
    </div>
  )

  const renderTranscribing = (
    <div className="scribe-pop scribe-pop--center" role="status">
      <Loader2 className="scribe-spin" size={26} />
      <span>Processing audio with AssemblyAI…</span>
      <span className="scribe-note-muted">Transcript will appear for doctor review.</span>
    </div>
  )

  const renderExtracting = (
    <div className="scribe-pop scribe-pop--center" role="status">
      <Loader2 className="scribe-spin" size={26} />
      <span>Extracting clinical note with Groq LLM…</span>
    </div>
  )

  const renderReview = (
    <div className="scribe-pop">
      <div className="scribe-controls-row">
        <h4 className="scribe-title">
          <FileText size={16} /> Review &amp; approve transcript
        </h4>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            className="scribe-select"
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
          >
            <option value="English">English</option>
            <option value="Spanish">Spanish</option>
            <option value="Hindi">Hindi</option>
            <option value="French">French</option>
            <option value="German">German</option>
          </select>
          <button
            className="scribe-btn scribe-btn--secondary"
            style={{ fontSize: '12px', padding: '4px 10px' }}
            onClick={() => void translateTranscript()}
            disabled={isTranslating || !transcript.trim()}
          >
            {isTranslating ? (
              <Loader2 className="scribe-spin" size={13} />
            ) : (
              <Languages size={13} />
            )}
            Translate to {targetLang}
          </button>
        </div>
      </div>

      <textarea
        className="scribe-textarea"
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        rows={8}
        placeholder="Transcript appears here. Edit or approve to extract structured note..."
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
          <Sparkles size={14} /> Approve &amp; extract note
        </button>
      </div>
      <p className="scribe-note-muted">
        Doctor approval required before clinical extraction runs.
      </p>
    </div>
  )

  const renderSaved = savedNote ? (
    <div className="scribe-pop">
      <div className="scribe-saved-head">
        <CheckCircle2 className="scribe-success" size={22} />
        <h4 className="scribe-title">Note extracted &amp; attached</h4>
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
      {errorMsg && (
        <div
          style={{
            color: 'var(--color-danger)',
            fontSize: '13px',
            padding: '8px 12px',
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-base)',
            border: '1px solid var(--color-danger)',
          }}
        >
          {errorMsg}
        </div>
      )}
      {saveSuccess && (
        <div
          style={{
            color: 'var(--color-success)',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 0',
          }}
        >
          <CheckCircle2 size={16} /> Saved to patient record in Neo4j!
        </div>
      )}
      <div className="scribe-actions">
        <button className="scribe-btn scribe-btn--secondary" onClick={resetAll}>
          Start fresh consultation
        </button>
        {!saveSuccess && (
          <button
            className="scribe-btn scribe-btn--primary"
            disabled={isSaving}
            onClick={() => void saveToGraph()}
          >
            {isSaving ? (
              <Loader2 className="scribe-spin" size={16} />
            ) : (
              <Save size={16} />
            )}
            {isSaving ? 'Syncing to Neo4j…' : 'Confirm & sync to Neo4j'}
          </button>
        )}
      </div>
    </div>
  ) : null

  const renderError = (
    <div className="scribe-pop scribe-pop--error">
      <div className="scribe-error-head">
        <AlertTriangle className="scribe-warn" size={20} />
        <h4 className="scribe-title">Transcription issue</h4>
      </div>
      <p>{errorMsg || 'An error occurred during speech-to-text processing.'}</p>
      {failures > 0 && (
        <span className="scribe-failure-count">
          Failed attempts: {failures} / 3 {retryDisabled && '(retry disabled)'}
        </span>
      )}
      <div className="scribe-actions">
        {!retryDisabled && (
          <button className="scribe-btn scribe-btn--secondary" onClick={retry}>
            <RotateCcw size={16} /> Retry
          </button>
        )}
        <button className="scribe-btn scribe-btn--primary" onClick={beginTypedNote}>
          <PenLine size={16} /> Switch to typed note
        </button>
      </div>
    </div>
  )

  const renderTypedEntry = (
    <div className="scribe-pop">
      <h4 className="scribe-title">
        <PenLine size={16} /> Typed consultation note
      </h4>
      <textarea
        className="scribe-textarea"
        placeholder="Type consultation notes, symptoms, and treatment plan directly..."
        value={typedNote}
        onChange={(e) => setTypedNote(e.target.value)}
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
          Proceed to review &amp; extract
        </button>
      </div>
    </div>
  )

  const renderIdle = (
    <div className="scribe-pop scribe-pop--idle">
      <div className="scribe-controls-row" style={{ marginBottom: '12px' }}>
        <label className="scribe-toggle-label">
          <input
            type="checkbox"
            checked={enableTranslation}
            onChange={(e) => setEnableTranslation(e.target.checked)}
          />
          <Languages size={15} />
          <span>Live Translation</span>
        </label>
        {enableTranslation && (
          <select
            className="scribe-select"
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
          >
            <option value="English">to English</option>
            <option value="Spanish">to Spanish</option>
            <option value="Hindi">to Hindi</option>
            <option value="French">to French</option>
            <option value="German">to German</option>
          </select>
        )}
      </div>

      <div className="scribe-actions">
        <button className="scribe-btn scribe-btn--record" onClick={() => void beginRecording()}>
          <Mic size={16} /> Start Live Scribe
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
        <button
          className="scribe-btn scribe-btn--secondary"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={15} /> Upload Audio
        </button>
        <button className="scribe-btn scribe-btn--secondary" onClick={beginTypedNote}>
          <PenLine size={15} /> Type Note
        </button>
      </div>
      <p className="scribe-note-muted" style={{ marginTop: '8px' }}>
        Real-time streaming speech-to-text powered by AssemblyAI.
      </p>
    </div>
  )

  return (
    <div className="scribe-widget">
      <div className="scribe-widget-title">
        <Mic size={18} />
        <span>Clinical Scribe</span>
      </div>
      {stage === 'recording' && renderRecording}
      {stage === 'transcribing' && renderTranscribing}
      {stage === 'extracting' && renderExtracting}
      {stage === 'review' && renderReview}
      {stage === 'saved' && renderSaved}
      {stage === 'error' && renderError}
      {stage === 'idle' && (useTypedNote ? renderTypedEntry : renderIdle)}
    </div>
  )
}