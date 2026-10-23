/**
 * A small inline markdown dialect for chat:
 * **bold**, *italic* or _italic_, ~~strike~~, `code`, ||spoiler||, and bare http(s) links.
 * A backslash escapes a marker character.
 */

export type MdNode =
  | string
  | { t: 'b' | 'i' | 's' | 'spoiler'; c: MdNode[] }
  | { t: 'code'; v: string }
  | { t: 'a'; href: string }

const DELIMS: [string, 'b' | 'i' | 's' | 'spoiler'][] = [
  ['||', 'spoiler'],
  ['**', 'b'],
  ['~~', 's'],
  ['*', 'i'],
  ['_', 'i'],
]

const URL = /^https?:\/\/[^\s<]*[^\s<.,:;"')\]!?]/
const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c)
const isWord = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}_]/u.test(c)

/** Finds where the span opened by `d` at `start` closes, or -1. */
function findClose(src: string, d: string, start: number) {
  for (let j = src.indexOf(d, start); j !== -1; j = src.indexOf(d, j + 1)) {
    if (j === start || isSpace(src[j - 1]) || src[j - 1] === '\\') continue
    // a single * must not be half of a ** pair
    if (d === '*' && (src[j + 1] === '*' || src[j - 1] === '*')) continue
    // _ only closes at the end of a word, so snake_case stays literal
    if (d === '_' && isWord(src[j + 1])) continue
    return j
  }
  return -1
}

export function parseMd(src: string): MdNode[] {
  const out: MdNode[] = []
  let buf = ''
  const flush = () => {
    if (buf) out.push(buf)
    buf = ''
  }
  let i = 0
  outer: while (i < src.length) {
    const ch = src[i]
    if (ch === '\\' && /[\\*_~`|]/.test(src[i + 1] ?? '')) {
      buf += src[i + 1]
      i += 2
      continue
    }
    if (ch === '`') {
      const j = src.indexOf('`', i + 1)
      if (j > i + 1) {
        flush()
        out.push({ t: 'code', v: src.slice(i + 1, j) })
        i = j + 1
        continue
      }
    }
    if ((ch === 'h' || ch === 'H') && isSpace(src[i - 1])) {
      const m = URL.exec(src.slice(i))
      if (m) {
        flush()
        out.push({ t: 'a', href: m[0] })
        i += m[0].length
        continue
      }
    }
    for (const [d, t] of DELIMS) {
      if (!src.startsWith(d, i)) continue
      if (d === '_' && isWord(src[i - 1])) continue
      const start = i + d.length
      if (isSpace(src[start])) continue
      const j = findClose(src, d, start)
      if (j === -1) continue
      flush()
      out.push({ t, c: parseMd(src.slice(start, j)) })
      i = j + d.length
      continue outer
    }
    buf += ch
    i++
  }
  flush()
  return out
}

/** True when the text renders differently from how it's typed. */
export function hasFormatting(src: string) {
  const nodes = parseMd(src)
  return !(nodes.length === 0 || (nodes.length === 1 && nodes[0] === src))
}

/** Plain text for quotes and previews; spoilers stay hidden. */
export function toPlain(nodes: MdNode[]): string {
  return nodes
    .map((n) => {
      if (typeof n === 'string') return n
      if (n.t === 'code') return n.v
      if (n.t === 'a') return n.href
      if (n.t === 'spoiler') return '▒▒▒'
      return toPlain(n.c)
    })
    .join('')
}
