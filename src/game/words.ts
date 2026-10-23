import type { WordLength } from '../types'

// Each list loads only when a match with that word length needs it.
const VALID = {
  4: () => import('../words/valid4.txt?raw'),
  5: () => import('../words/valid5.txt?raw'),
  6: () => import('../words/valid6.txt?raw'),
}
const ANSWERS = {
  4: () => import('../words/answers4.txt?raw'),
  5: () => import('../words/answers5.txt?raw'),
  6: () => import('../words/answers6.txt?raw'),
}

const valid: Partial<Record<WordLength, Promise<Set<string>>>> = {}

export function loadValidWords(length: WordLength) {
  return (valid[length] ??= VALID[length]().then((m) => new Set(m.default.split('\n'))))
}

export async function pickAnswers(length: WordLength, count: number) {
  const list = (await ANSWERS[length]()).default.split('\n')
  const picked = new Set<string>()
  while (picked.size < count) picked.add(list[Math.floor(Math.random() * list.length)])
  return [...picked]
}
