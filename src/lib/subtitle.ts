/**
 * Subtitle converter utility
 * Converts SRT, VTT, ASS, SSA subtitle formats to WebVTT
 */

interface SubtitleCue {
  startTime: number // in seconds
  endTime: number
  text: string
}

function formatVttTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

function parseSrtTime(timeStr: string): number {
  // SRT format: 00:00:00,000
  const cleaned = timeStr.trim().replace(',', '.')
  const parts = cleaned.split(':')
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  const s = parseFloat(parts[2])
  return h * 3600 + m * 60 + s
}

function parseVttTime(timeStr: string): number {
  // VTT format: 00:00:00.000 or 00:00.000
  const cleaned = timeStr.trim()
  const parts = cleaned.split(':')
  if (parts.length === 3) {
    const h = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10)
    const s = parseFloat(parts[2])
    return h * 3600 + m * 60 + s
  } else if (parts.length === 2) {
    const m = parseInt(parts[0], 10)
    const s = parseFloat(parts[1])
    return m * 60 + s
  }
  return parseFloat(cleaned)
}

function parseSrt(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const blocks = normalized.split(/\n\n+/)

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 2) continue

    // Find the line with the timestamp arrow
    let timeLineIdx = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timeLineIdx = i
        break
      }
    }
    if (timeLineIdx === -1) continue

    const timeParts = lines[timeLineIdx].split('-->')
    if (timeParts.length < 2) continue

    const startTime = parseSrtTime(timeParts[0])
    const endTime = parseSrtTime(timeParts[1])
    const text = lines.slice(timeLineIdx + 1).join('\n').trim()

    if (text) {
      cues.push({ startTime, endTime, text })
    }
  }

  return cues
}

function parseVtt(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const blocks = normalized.split(/\n\n+/)

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 1) continue

    // Skip WEBVTT header
    if (lines[0].startsWith('WEBVTT')) continue

    let timeLineIdx = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timeLineIdx = i
        break
      }
    }
    if (timeLineIdx === -1) continue

    const timeParts = lines[timeLineIdx].split('-->')
    if (timeParts.length < 2) continue

    // Remove any positioning info after the timestamp
    const startTimeStr = timeParts[0].trim().split(/\s/)[0]
    const endTimeStr = timeParts[1].trim().split(/\s/)[0]

    const startTime = parseVttTime(startTimeStr)
    const endTime = parseVttTime(endTimeStr)
    const text = lines.slice(timeLineIdx + 1).join('\n').trim()

    if (text) {
      cues.push({ startTime, endTime, text })
    }
  }

  return cues
}

function parseAssTime(timeStr: string): number {
  // ASS format: H:MM:SS.CC (centiseconds)
  const parts = timeStr.trim().split(':')
  if (parts.length !== 3) return 0
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  const s = parseFloat(parts[2])
  return h * 3600 + m * 60 + s
}

function stripAssTags(text: string): string {
  // Remove ASS override tags like {\pos(x,y)}, {\b1}, etc.
  return text.replace(/\{[^}]*\}/g, '').replace(/\\N/g, '\n').replace(/\\n/g, '\n').trim()
}

function parseAss(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')

  let inEvents = false
  let formatFields: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('[')) {
      inEvents = trimmed.toLowerCase() === '[events]'
      formatFields = []
      continue
    }

    if (inEvents) {
      if (trimmed.toLowerCase().startsWith('format:')) {
        formatFields = trimmed.substring(7).split(',').map(f => f.trim().toLowerCase())
        continue
      }

      if (trimmed.toLowerCase().startsWith('dialogue:')) {
        const data = trimmed.substring(9).split(',')
        if (data.length < formatFields.length) continue

        const fieldMap: Record<string, string> = {}
        for (let i = 0; i < formatFields.length; i++) {
          fieldMap[formatFields[i]] = data[i] ? data[i].trim() : ''
        }

        // The Text field may contain commas, so rejoin the rest
        const textIdx = formatFields.indexOf('text')
        const text = textIdx >= 0 ? data.slice(textIdx).join(',') : ''

        const startStr = fieldMap['start'] || ''
        const endStr = fieldMap['end'] || ''

        if (startStr && endStr) {
          const startTime = parseAssTime(startStr)
          const endTime = parseAssTime(endStr)
          const cleanText = stripAssTags(text)
          if (cleanText) {
            cues.push({ startTime, endTime, text: cleanText })
          }
        }
      }
    }
  }

  return cues
}

function cuesToVtt(cues: SubtitleCue[]): string {
  const lines = ['WEBVTT', '']
  for (const cue of cues) {
    lines.push(`${formatVttTime(cue.startTime)} --> ${formatVttTime(cue.endTime)}`)
    lines.push(cue.text)
    lines.push('')
  }
  return lines.join('\n')
}

/**
 * Convert a subtitle file content to WebVTT format
 * @param content - The raw subtitle file content
 * @param format - The source format: 'srt', 'vtt', 'ass', 'ssa'
 * @returns WebVTT formatted string
 */
export function convertToVtt(content: string, format: string): string {
  const normalizedFormat = format.toLowerCase().trim()

  let cues: SubtitleCue[]

  switch (normalizedFormat) {
    case 'srt':
      cues = parseSrt(content)
      break
    case 'vtt':
      // If it's already VTT, just return it trimmed
      if (content.trim().startsWith('WEBVTT')) {
        return content.trim()
      }
      cues = parseVtt(content)
      break
    case 'ass':
    case 'ssa':
      cues = parseAss(content)
      break
    default:
      throw new Error(`Unsupported subtitle format: ${format}`)
  }

  if (cues.length === 0) {
    throw new Error(`No valid subtitle cues found in the ${format} file`)
  }

  return cuesToVtt(cues)
}

/**
 * Detect subtitle format from filename
 */
export function detectSubtitleFormat(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'srt':
      return 'srt'
    case 'vtt':
      return 'vtt'
    case 'ass':
      return 'ass'
    case 'ssa':
      return 'ssa'
    default:
      return null
  }
}
