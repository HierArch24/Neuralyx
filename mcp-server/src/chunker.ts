/**
 * Recursive character splitter for RAG.
 *
 * Strategy (applied in order until chunk fits):
 *   1. Split by double newline (paragraphs).
 *   2. Split oversized paragraphs by sentence boundary (. ! ?).
 *   3. Hard-cut at word boundary if a single sentence still exceeds the window.
 *
 * Overlap: last N chars of chunk i are prepended to chunk i+1 to preserve
 * context across boundaries. ~1 token ≈ 4 chars heuristic.
 */

export interface ChunkOptions {
  /** Target chunk size in chars. Default 2000 (~500 tokens). */
  targetChars?: number
  /** Overlap in chars carried between adjacent chunks. Default 200. */
  overlapChars?: number
}

export interface Chunk {
  index: number
  text: string
  tokenEstimate: number
}

const DEFAULTS: Required<ChunkOptions> = { targetChars: 2000, overlapChars: 200 }

function splitByParagraph(s: string): string[] {
  return s.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
}

function splitBySentence(s: string): string[] {
  // Keep delimiter attached to the preceding sentence.
  const parts = s.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(\[])/)
  return parts.map((p) => p.trim()).filter(Boolean)
}

function hardWrap(s: string, max: number): string[] {
  if (s.length <= max) return [s]
  const out: string[] = []
  let i = 0
  while (i < s.length) {
    let end = Math.min(i + max, s.length)
    if (end < s.length) {
      const nextSpace = s.lastIndexOf(' ', end)
      if (nextSpace > i + max / 2) end = nextSpace
    }
    out.push(s.slice(i, end).trim())
    i = end
  }
  return out.filter(Boolean)
}

/** Break text into pieces that each fit within targetChars, preserving sentence boundaries where possible. */
function atomicPieces(text: string, targetChars: number): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim()
  if (!clean) return []
  const out: string[] = []
  for (const para of splitByParagraph(clean)) {
    if (para.length <= targetChars) { out.push(para); continue }
    for (const sent of splitBySentence(para)) {
      if (sent.length <= targetChars) { out.push(sent); continue }
      for (const piece of hardWrap(sent, targetChars)) out.push(piece)
    }
  }
  return out
}

/** Pack atomic pieces into chunks of ≤ targetChars, then apply overlap. */
export function chunkText(text: string, opts: ChunkOptions = {}): Chunk[] {
  const { targetChars, overlapChars } = { ...DEFAULTS, ...opts }
  const pieces = atomicPieces(text, targetChars)
  if (pieces.length === 0) return []

  const packed: string[] = []
  let buf = ''
  for (const p of pieces) {
    if (!buf) { buf = p; continue }
    if (buf.length + 2 + p.length <= targetChars) {
      buf += '\n\n' + p
    } else {
      packed.push(buf)
      buf = p
    }
  }
  if (buf) packed.push(buf)

  if (overlapChars <= 0 || packed.length <= 1) {
    return packed.map((t, i) => ({ index: i, text: t, tokenEstimate: Math.ceil(t.length / 4) }))
  }

  const withOverlap: string[] = [packed[0]]
  for (let i = 1; i < packed.length; i++) {
    const prev = packed[i - 1]
    const carry = prev.slice(Math.max(0, prev.length - overlapChars)).trim()
    withOverlap.push(carry ? `${carry}\n\n${packed[i]}` : packed[i])
  }

  return withOverlap.map((t, i) => ({ index: i, text: t, tokenEstimate: Math.ceil(t.length / 4) }))
}
