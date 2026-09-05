import { useMemo, useRef, useState } from 'react'
import { VisNetworkCanvas, type VNode, type VEdge } from '../components/graph/VisNetworkCanvas'
import { Camera, Sparkles, Info, RefreshCw, Check } from 'lucide-react'
import './ProjectConceptGraphPage.css'

export function ProjectConceptGraphPage() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [key, setKey] = useState(0)

  // Nodes depicting the entire MediGraph Architecture
  const nodes: VNode[] = useMemo(
    () => [
      // 1. Core Patients
      {
        id: 'patient_1',
        label: 'Alexandra Mosciski\n(Target Patient)',
        labels: ['Patient'],
        properties: {
          name: 'Alexandra Mosciski',
          age: 45,
          gender: 'Female',
          risk_status: 'High Risk (Multi-morbidity)',
          ehr_source: 'Synthea FHIR / Neo4j AuraDB',
          active_conditions: ['Prediabetes', 'Iron Deficiency Anemia'],
        },
      },
      {
        id: 'patient_2',
        label: 'Marcus Vance\n(Controlled Cohort)',
        labels: ['Patient'],
        properties: {
          name: 'Marcus Vance',
          age: 47,
          gender: 'Male',
          cohort_group: 'Similar Metabolic Cohort',
          status: 'Controlled & Recovered on Metformin',
          biomarker_outcome: 'HbA1c normalized to 5.4%',
        },
      },

      // 2. Clinical Diagnoses
      {
        id: 'disease_1',
        label: 'Prediabetes\n(ICD: R73.03)',
        labels: ['Disease'],
        properties: {
          name: 'Prediabetes',
          icd10: 'R73.03',
          category: 'Metabolic & Endocrine',
          severity: 'Moderate',
          monitored_markers: ['Fasting Glucose', 'HbA1c'],
        },
      },
      {
        id: 'disease_2',
        label: 'Iron Deficiency Anemia\n(ICD: D50.9)',
        labels: ['Disease'],
        properties: {
          name: 'Iron Deficiency Anemia',
          icd10: 'D50.9',
          category: 'Hematologic',
          severity: 'Moderate',
          monitored_markers: ['Hemoglobin', 'Hematocrit'],
        },
      },

      // 3. Objective Lab Biomarkers
      {
        id: 'lab_1',
        label: 'HbA1c: 6.8%\n(Elevated)',
        labels: ['LabTest'],
        properties: {
          test_name: 'Hemoglobin A1c (HbA1c)',
          value: '6.8',
          unit: '%',
          interpretation: 'Abnormal / Elevated',
          reference_range: '< 5.7%',
          clinical_significance: 'Key Diagnostic Biomarker for Glycemic Control',
        },
      },
      {
        id: 'lab_2',
        label: 'Fasting Glucose: 114\n(mg/dL - High)',
        labels: ['LabTest'],
        properties: {
          test_name: 'Fasting Blood Glucose',
          value: '114',
          unit: 'mg/dL',
          interpretation: 'Abnormal / Impaired Fasting Glucose',
          reference_range: '70 - 99 mg/dL',
        },
      },
      {
        id: 'lab_3',
        label: 'Hemoglobin: 10.8\n(g/dL - Low)',
        labels: ['LabTest'],
        properties: {
          test_name: 'Hemoglobin',
          value: '10.8',
          unit: 'g/dL',
          interpretation: 'Abnormal / Low',
          reference_range: '12.0 - 15.5 g/dL',
        },
      },

      // 4. Clinical Care Team & AI Scribe Pipeline
      {
        id: 'doctor_1',
        label: 'Dr. Sarah Chen, MD\n(Endocrinologist)',
        labels: ['Doctor'],
        properties: {
          name: 'Dr. Sarah Chen, MD',
          specialty: 'Endocrinology & Internal Medicine',
          department: 'Metabolic Health Center',
          npi: '1892837190',
        },
      },
      {
        id: 'note_1',
        label: 'Consultation Note\n(AI Structured)',
        labels: ['ConsultationNote'],
        properties: {
          title: 'Metabolic & Hematologic Evaluation',
          date: '2026-09-04',
          summary: 'Patient evaluated for chronic fatigue and elevated glycemic indices. Initiated Metformin and oral iron replacement.',
          source: 'Live Multilingual Audio Transcription',
          pipeline: 'AssemblyAI + Groq gpt-oss-120b',
        },
      },
      {
        id: 'scribe_ai',
        label: 'AI Clinical Scribe\n(Speech-to-Graph RAG)',
        labels: ['Evidence'],
        properties: {
          pipeline_name: 'MediGraph Multilingual AI Scribe',
          voice_engine: 'AssemblyAI Streaming STT',
          extraction_llm: 'Groq (openai/gpt-oss-120b)',
          function: 'Transforms clinical dialog into real-time connected Neo4j nodes and edges',
        },
      },

      // 5. Treatments & Procedures
      {
        id: 'med_1',
        label: 'Metformin 500mg\n(First-Line Biguanide)',
        labels: ['Medication'],
        properties: {
          name: 'Metformin hydrochloride 500mg',
          class: 'Biguanide Antidiabetic',
          dosage: '500mg BID with meals',
          indication: 'Prediabetes & Type 2 Diabetes',
          cohort_control_rate: '88% biomarker normalization',
        },
      },
      {
        id: 'med_2',
        label: 'Ferrous Sulfate 325mg\n(Oral Iron)',
        labels: ['Medication'],
        properties: {
          name: 'Ferrous Sulfate 325mg (65mg elemental Fe)',
          class: 'Iron Supplement',
          dosage: '325mg Daily',
          indication: 'Iron Deficiency Anemia',
          cohort_control_rate: '94% biomarker normalization',
        },
      },
      {
        id: 'proc_1',
        label: 'Dietary Counseling\n(Lifestyle Intervention)',
        labels: ['Procedure'],
        properties: {
          name: 'Dietary & Medical Nutritional Therapy',
          code: '99401',
          goal: 'Glycemic stabilization & weight management',
          resolution_rate: '82% clinical improvement',
        },
      },

      // 6. Treatment Intelligence & Graph RAG
      {
        id: 'intel_engine',
        label: 'Treatment Intelligence\n(Biomarker Scoring Engine)',
        labels: ['ClinicalStudy'],
        properties: {
          engine: 'MediGraph Treatment Intelligence v2.0',
          scoring_method: 'Physiological Biomarker Threshold Analytics',
          cohort_dataset: '2,400+ lab tests across 60 Synthea patients',
          output: 'Calculates true clinical control scores (0.73 - 0.94) for optimal therapy',
        },
      },
      {
        id: 'chatbot_ai',
        label: 'MediGraph Q&A Chatbot\n(Knowledge Graph RAG)',
        labels: ['Symptom'],
        properties: {
          service: 'Clinical Knowledge Graph RAG Assistant',
          model: 'Groq (gpt-oss-120b)',
          capabilities: 'Context-injected Cypher lookups, cohort comparison, dynamic clinical suggestion chips',
        },
      },
    ],
    [],
  )

  // Relationships representing the full architecture flow
  const edges: VEdge[] = useMemo(
    () => [
      // Patient -> Diagnoses
      { id: 'e1', source: 'patient_1', target: 'disease_1', label: 'HAS_DIAGNOSIS' },
      { id: 'e2', source: 'patient_1', target: 'disease_2', label: 'HAS_DIAGNOSIS' },

      // Patient -> Labs
      { id: 'e3', source: 'patient_1', target: 'lab_1', label: 'HAS_LAB_TEST' },
      { id: 'e4', source: 'patient_1', target: 'lab_2', label: 'HAS_LAB_TEST' },
      { id: 'e5', source: 'patient_1', target: 'lab_3', label: 'HAS_LAB_TEST' },

      // Labs -> Disease Biomarkers
      { id: 'e6', source: 'lab_1', target: 'disease_1', label: 'BIOMARKER_FOR' },
      { id: 'e7', source: 'lab_2', target: 'disease_1', label: 'BIOMARKER_FOR' },
      { id: 'e8', source: 'lab_3', target: 'disease_2', label: 'BIOMARKER_FOR' },

      // Patient -> Medications
      { id: 'e9', source: 'patient_1', target: 'med_1', label: 'PRESCRIBED' },
      { id: 'e10', source: 'patient_1', target: 'med_2', label: 'PRESCRIBED' },

      // Medications -> Disease Treats
      { id: 'e11', source: 'med_1', target: 'disease_1', label: 'TREATS (88%)' },
      { id: 'e12', source: 'med_2', target: 'disease_2', label: 'TREATS (94%)' },

      // Patient -> Procedure -> Disease
      { id: 'e13', source: 'patient_1', target: 'proc_1', label: 'UNDERWENT' },
      { id: 'e14', source: 'proc_1', target: 'disease_1', label: 'MANAGES' },

      // Scribe & Doctor flow
      { id: 'e15', source: 'patient_1', target: 'note_1', label: 'HAS_NOTE' },
      { id: 'e16', source: 'doctor_1', target: 'note_1', label: 'CONDUCTED' },
      { id: 'e17', source: 'scribe_ai', target: 'note_1', label: 'EXTRACTS_GRAPH' },
      { id: 'e18', source: 'note_1', target: 'disease_1', label: 'MENTIONS' },
      { id: 'e19', source: 'note_1', target: 'med_1', label: 'DISCUSSES' },

      // Treatment Intelligence scoring & Cohort flow
      { id: 'e20', source: 'intel_engine', target: 'med_1', label: 'EVALUATES (0.88)' },
      { id: 'e21', source: 'intel_engine', target: 'disease_1', label: 'RANKS_BEST' },
      { id: 'e22', source: 'intel_engine', target: 'patient_2', label: 'MATCHES_COHORT' },
      { id: 'e23', source: 'patient_2', target: 'med_1', label: 'RECOVERED_ON' },
      { id: 'e24', source: 'patient_2', target: 'disease_1', label: 'HAD_DIAGNOSIS' },

      // Chatbot Assistant flow
      { id: 'e25', source: 'chatbot_ai', target: 'disease_1', label: 'QUERIES_RAG' },
      { id: 'e26', source: 'chatbot_ai', target: 'doctor_1', label: 'ASSISTS_DECISION' },
    ],
    [],
  )

  // Take high resolution screenshot of canvas for PPT presentation
  const handleDownloadSnapshot = () => {
    setDownloading(true)
    try {
      const container = containerRef.current
      const canvas = container?.querySelector('canvas')
      if (canvas) {
        // Create an offscreen canvas with dark background for pristine PPT slide export
        const exportCanvas = document.createElement('canvas')
        exportCanvas.width = canvas.width
        exportCanvas.height = canvas.height
        const ctx = exportCanvas.getContext('2d')
        if (ctx) {
          ctx.fillStyle = '#0f172a'
          ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height)
          ctx.drawImage(canvas, 0, 0)

          const dataUrl = exportCanvas.toDataURL('image/png')
          const a = document.createElement('a')
          a.href = dataUrl
          a.download = 'medigraph_project_architecture_graph.png'
          a.click()
        }
      }
    } catch (e) {
      console.error('Failed to capture snapshot', e)
    } finally {
      setTimeout(() => setDownloading(false), 800)
    }
  }

  const handleCopySummary = () => {
    const summary = `MediGraph: Clinical Healthcare Knowledge Graph & AI System
1. Patient Demographics & Multi-morbidity (Alexandra Mosciski)
2. Objective Lab Biomarkers (HbA1c 6.8%, Fasting Glucose 114 mg/dL, Hemoglobin 10.8 g/dL)
3. Clinical Diagnoses & ICD Mapping (Prediabetes, Iron Deficiency Anemia)
4. Multilingual AI Clinical Scribe (Speech-to-Graph RAG via Groq gpt-oss-120b)
5. Structured Consultation Notes connected to Diseases & Medications
6. Targeted Therapeutics & Lifestyle Procedures (Metformin, Ferrous Sulfate, Dietary Counseling)
7. Treatment Intelligence Engine (Biomarker physiological control scoring across 2,400+ labs)
8. Recovered Patient Cohort Matching (Marcus Vance)
9. Interactive Clinical Chatbot with Knowledge Graph Cypher RAG`
    navigator.clipboard.writeText(summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="concept-page">
      {/* Header Banner */}
      <header className="concept-header">
        <div className="concept-header-left">
          <div className="concept-badge">
            <Sparkles size={14} /> Project Architecture & Core Vision
          </div>
          <h1 className="concept-title">
            MediGraph: Comprehensive Knowledge Graph Architecture
          </h1>
          <p className="concept-subtitle">
            An end-to-end representation of how <strong>Patient EHR</strong>,{' '}
            <strong>Objective Biomarkers</strong>, <strong>AI Scribe Notes</strong>,{' '}
            <strong>Treatment Intelligence</strong>, and <strong>Graph RAG</strong> interconnect.
          </p>
        </div>

        <div className="concept-header-actions">
          <button
            className="concept-btn concept-btn--secondary"
            onClick={handleCopySummary}
            title="Copy architecture summary text"
          >
            {copied ? <Check size={16} color="var(--color-success)" /> : <Info size={16} />}
            {copied ? 'Summary Copied!' : 'Copy Summary'}
          </button>

          <button
            className="concept-btn concept-btn--secondary"
            onClick={() => setKey((k) => k + 1)}
            title="Re-layout & reorganize graph"
          >
            <RefreshCw size={16} /> Rearrange
          </button>

          <button
            className="concept-btn concept-btn--primary"
            onClick={handleDownloadSnapshot}
            disabled={downloading}
            title="Download high-resolution PNG image for PowerPoint"
          >
            <Camera size={16} />
            {downloading ? 'Capturing…' : 'Download PNG for PPT'}
          </button>
        </div>
      </header>

      {/* Legend Ribbon */}
      <div className="concept-legend-ribbon">
        <span className="concept-legend-label">Graph Entities:</span>
        <div className="concept-legend-items">
          <span className="concept-legend-chip concept-legend-chip--patient">
            <span className="concept-legend-dot" /> Patient EHR
          </span>
          <span className="concept-legend-chip concept-legend-chip--disease">
            <span className="concept-legend-dot" /> Disease / Condition
          </span>
          <span className="concept-legend-chip concept-legend-chip--lab">
            <span className="concept-legend-dot" /> Lab Biomarkers
          </span>
          <span className="concept-legend-chip concept-legend-chip--med">
            <span className="concept-legend-dot" /> Medication
          </span>
          <span className="concept-legend-chip concept-legend-chip--proc">
            <span className="concept-legend-dot" /> Procedure / Lifestyle
          </span>
          <span className="concept-legend-chip concept-legend-chip--doctor">
            <span className="concept-legend-dot" /> Doctor / Clinician
          </span>
          <span className="concept-legend-chip concept-legend-chip--note">
            <span className="concept-legend-dot" /> Consultation Note
          </span>
          <span className="concept-legend-chip concept-legend-chip--ai">
            <span className="concept-legend-dot" /> AI Scribe & Chatbot RAG
          </span>
          <span className="concept-legend-chip concept-legend-chip--intel">
            <span className="concept-legend-dot" /> Treatment Intelligence
          </span>
        </div>
      </div>

      {/* Graph Visualizer Container */}
      <main className="concept-canvas-wrapper" ref={containerRef} key={key}>
        <VisNetworkCanvas
          nodes={nodes}
          edges={edges}
          height="100%"
          centerId="patient_1"
          showToolbar={true}
        />
      </main>

      {/* Presentation Explanation Strip */}
      <footer className="concept-footer-cards">
        <div className="concept-card">
          <div className="concept-card-title">1. Dynamic Clinical Knowledge Graph</div>
          <p className="concept-card-text">
            Binds complex patient EHR records, chronic diagnoses, and physiological lab cutoffs into a unified Neo4j AuraDB graph model.
          </p>
        </div>
        <div className="concept-card">
          <div className="concept-card-title">2. Multilingual AI Voice Scribe</div>
          <p className="concept-card-text">
            Converts physician-patient spoken dialogue into real-time ConsultationNote nodes automatically linked to Diseases and Prescriptions.
          </p>
        </div>
        <div className="concept-card">
          <div className="concept-card-title">3. Treatment Intelligence Engine</div>
          <p className="concept-card-text">
            Ranks best therapies for each disease using clinical physiological thresholds across 2,400+ biomarker records with cohort matching.
          </p>
        </div>
        <div className="concept-card">
          <div className="concept-card-title">4. Graph RAG AI Assistant</div>
          <p className="concept-card-text">
            Powered by Groq gpt-oss-120b, delivering context-aware multi-hop clinical answers with dynamic interactive suggestions.
          </p>
        </div>
      </footer>
    </div>
  )
}
