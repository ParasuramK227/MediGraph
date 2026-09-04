/**
 * Format ISO timestamps or dates (e.g. 2016-12-05T22:20:00Z or 1981-05-25) into human-friendly dates.
 */
export function formatClinicalDate(rawDate?: string | null): string {
  if (!rawDate) return 'N/A'
  try {
    const d = new Date(rawDate)
    if (isNaN(d.getTime())) return rawDate
    // If it's a YYYY-MM-DD date string without time
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate.trim())) {
      const [y, m, day] = rawDate.trim().split('-').map(Number)
      const dateObj = new Date(y, m - 1, day)
      return dateObj.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    }
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return rawDate
  }
}

/**
 * Format currency amounts (e.g. 306.04 or "306.04") into "$306.04".
 */
export function formatCurrency(amount?: string | number | null): string {
  if (amount === undefined || amount === null || amount === '') return ''
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount))
  if (isNaN(num)) return String(amount)
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Clean up noisy SNOMED / LOINC syntax from lab descriptions.
 */
export function cleanLabName(name: string): string {
  if (!name) return ''
  return name
    .replace(/\s*\[Mass\/volume\]\s*in\s*Blood/gi, '')
    .replace(/\s*\[Moles\/volume\]\s*in\s*Blood/gi, '')
    .replace(/\s*\[Ratio\]/gi, '')
    .replace(/\s*-\s*0-10\s*verbal\s*numeric\s*rating\s*\[Score\]\s*-\s*Reported/gi, '')
    .replace(/\s*\[Score\]/gi, '')
    .replace(/\s*\(finding\)/gi, '')
    .replace(/\s*\(disorder\)/gi, '')
    .trim()
}

/**
 * Strip synthetic digits appended by Synthea from names (e.g. "Alexandra16 Mosciski958" -> "Alexandra Mosciski").
 */
export function cleanPersonName(name?: string | null): string {
  if (!name) return ''
  return name.replace(/\d+/g, '').replace(/\s+/g, ' ').trim()
}
