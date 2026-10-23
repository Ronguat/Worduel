import type { WordLength } from '../types'

const valid: Partial<Record<WordLength, Promise<Set<string>>>> = {}

export function loadValidWords(length: WordLength) {
  return (valid[length] ??= (length === 5 ? import('../words/valid5.txt?raw') : import('../words/valid6.txt?raw')).then(
    (m) => new Set(m.default.split('\n')),
  ))
}

export async function pickAnswers(length: WordLength, count: number) {
  const m = await (length === 5 ? import('../words/answers5.txt?raw') : import('../words/answers6.txt?raw'))
  const list = m.default.split('\n')
  const picked = new Set<string>()
  while (picked.size < count) picked.add(list[Math.floor(Math.random() * list.length)])
  return [...picked]
}
