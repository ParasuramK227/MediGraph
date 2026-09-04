// ---------------------------------------------------------------------------
// Canonical node-label -> color mapping.
//
// One color per label, used identically everywhere (Database Information
// panel, graph canvas, Results Overview, per-feature graph views). Colors are
// defined as CSS custom properties in tokens.css (the single source of truth);
// this module maps each label to its token and resolves it against the active
// theme at runtime. It must NOT hardcode any hex — always go through tokens.
// ---------------------------------------------------------------------------

export const LABEL_TO_TOKEN: Record<string, string> = {
  Patient: '--node-patient',
  Disease: '--node-disease',
  Condition: '--node-disease',
  Symptom: '--node-symptom',
  Medication: '--node-medication',
  Treatment: '--node-treatment',
  Procedure: '--node-treatment',
  Doctor: '--node-doctor',
  Provider: '--node-doctor',
  Hospital: '--node-hospital',
  LabTest: '--node-labtest',
  Observation: '--node-labtest',
  Encounter: '--node-encounter',
  Allergy: '--node-allergy',
  ConsultationNote: '--node-note',
  ClinicalStudy: '--node-clinicalstudy',
  Evidence: '--node-evidence',
  Examination: '--node-examination',
  Location: '--node-location',
}

// Relationship labels: rendered as neutral chips but may carry a distinct
// accented token for the results-overview pills. Kept intentionally muted.
export const REL_TO_TOKEN: Record<string, string> = {
  HAS_DIAGNOSIS: '--node-disease',
  DIAGNOSED: '--node-disease',
  HAS_SYMPTOM: '--node-symptom',
  TREATS: '--node-medication',
  PRESCRIBED: '--node-medication',
  RECEIVED_TREATMENT: '--node-treatment',
  PERFORMED: '--node-treatment',
  HAS_CONSULTATION_NOTE: '--node-note',
  MENTIONS_DIAGNOSIS: '--node-disease',
  DISCUSSES_MEDICATION: '--node-medication',
  SIMILAR_TO: '--edge-color',
  HAS_LAB_TEST: '--node-labtest',
  RECORDED: '--node-labtest',
  HAD_ENCOUNTER: '--node-encounter',
  CONDUCTED: '--node-doctor',
  HAS_ALLERGY: '--node-allergy',
}

const DEFAULT_TOKEN = '--node-default'

/** Resolve a CSS custom-property to its computed color for a given element. */
export function resolveColor(token: string, el: HTMLElement = document.documentElement): string {
  const value = getComputedStyle(el).getPropertyValue(token).trim()
  return value || '#a0a4ab'
}

/** Alias: resolve a theme token (e.g. "--node-patient") to its computed color. */
export function tokenColor(token: string, el: HTMLElement = document.documentElement): string {
  return resolveColor(token, el)
}

/** Color for a node label, using the label-ordered mapping (falls back to default). */
export function labelColor(label: string, el?: HTMLElement): string {
  return resolveColor(LABEL_TO_TOKEN[label] ?? DEFAULT_TOKEN, el)
}

/** Color for a relationship type. */
export function relColor(relType: string, el?: HTMLElement): string {
  return resolveColor(REL_TO_TOKEN[relType] ?? '--edge-color', el)
}

/** Whether a label chip should use dark-on-color vs white-on-color text. */
export function chipTextContrast(hex: string): 'dark' | 'light' {
  const h = hex.replace('#', '')
  if (h.length !== 6) return 'dark'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  // relative luminance; lighter chips get dark text, darker chips get white text
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 150 ? 'dark' : 'light'
}