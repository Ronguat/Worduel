import { describe, expect, it } from 'vitest'
import { applyGuesses, decodeAnswer, duelWinner, encodeAnswer, hardModeViolation, newMatchData, nextFirstPlayer, score, startWith } from './logic'
import type { Match } from '../types'

const valid = () => true

function makeMatch(mode: 'duel' | 'team', answers: string[], hardMode = false): Match {
  const base = newMatchData({ mode, length: 5, boardCount: answers.length, hardMode, answers, creator: 'a', creatorProfile: { name: 'A', photo: null }, now: 0 })
  return { id: 'm', ...startWith(base, 'b', { name: 'B', photo: null }, 'a', 0) }
}

describe('score', () => {
  it('marks greens, yellows and greys', () => {
    expect(score('crane', 'caner')).toEqual(['correct', 'present', 'present', 'present', 'present'])
    expect(score('slate', 'slate')).toEqual(Array(5).fill('correct'))
  })
  it('handles repeated letters like Wordle', () => {
    expect(score('speed', 'abide')).toEqual(['absent', 'absent', 'present', 'absent', 'present'])
    expect(score('eerie', 'there')).toEqual(['present', 'absent', 'present', 'absent', 'correct'])
    expect(score('lolly', 'hello')).toEqual(['absent', 'present', 'correct', 'correct', 'absent'])
  })
})

describe('hard mode', () => {
  it('requires greens in place and yellows included', () => {
    expect(hardModeViolation('stare', 'crane', ['trace'])).toBe('2nd letter must be R')
    expect(hardModeViolation('plaid', 'crane', ['crisp'])).toBe('1st letter must be C')
    expect(hardModeViolation('candy', 'crane', ['opera'])).toBe('Guess must contain E')
    expect(hardModeViolation('crane', 'crane', ['trace', 'opera'])).toBeNull()
  })
})

describe('answers', () => {
  it('round-trips the obfuscation', () => {
    expect(decodeAnswer(encodeAnswer('hello'))).toBe('hello')
  })
})

describe('duel', () => {
  it('alternates turns and finishes when solved', () => {
    let m = makeMatch('duel', ['crane'])
    const r1 = applyGuesses(m, 'b', [{ board: 0, word: 'slate' }], valid, 1)
    expect(r1.ok).toBe(false)
    const r2 = applyGuesses(m, 'a', [{ board: 0, word: 'slate' }], valid, 1)
    if (!r2.ok) throw new Error(r2.error)
    m = r2.match
    expect(m.turn).toBe('b')
    const r3 = applyGuesses(m, 'b', [{ board: 0, word: 'crane' }], valid, 2)
    if (!r3.ok) throw new Error(r3.error)
    expect(r3.match.status).toBe('finished')
    expect(r3.match.winner).toBe('b')
  })

  it('lets a turn cover any subset of boards', () => {
    const m = makeMatch('duel', ['crane', 'slate', 'pious'])
    const r = applyGuesses(m, 'a', [{ board: 0, word: 'crane' }, { board: 2, word: 'adieu' }], valid, 1)
    if (!r.ok) throw new Error(r.error)
    expect(r.match.boards.map((b) => b.guesses.length)).toEqual([1, 0, 1])
    expect(r.match.boards[0].solvedBy).toBe('a')
    expect(r.match.turn).toBe('b')
    const again = applyGuesses(r.match, 'b', [{ board: 0, word: 'crane' }], valid, 2)
    expect(again.ok).toBe(false)
  })

  it('applies hard mode to hints revealed by either player', () => {
    let m = makeMatch('duel', ['crane'], true)
    const r = applyGuesses(m, 'a', [{ board: 0, word: 'trace' }], valid, 1)
    if (!r.ok) throw new Error(r.error)
    m = r.match
    const bad = applyGuesses(m, 'b', [{ board: 0, word: 'stout' }], valid, 2)
    expect(bad.ok).toBe(false)
  })

  it('breaks board-count ties by fewer rows, then by the second player', () => {
    const m = makeMatch('duel', ['crane', 'slate'])
    m.boards[0] = { ...m.boards[0], solvedBy: 'a', guesses: Array(4).fill({ w: 'x', by: 'a', turn: 0, at: 0 }) }
    m.boards[1] = { ...m.boards[1], solvedBy: 'b', guesses: Array(3).fill({ w: 'x', by: 'a', turn: 0, at: 0 }) }
    expect(duelWinner(m)).toBe('b')
    m.boards[1].guesses = Array(4).fill({ w: 'x', by: 'a', turn: 0, at: 0 })
    expect(duelWinner(m)).toBe('b')
  })

  it('alternates who goes first between matches', () => {
    const m = makeMatch('duel', ['crane'])
    expect(nextFirstPlayer([m], 'a', 'b', 'a')).toBe('b')
    expect(nextFirstPlayer([], 'a', 'b', 'a')).toBe('a')
  })
})

describe('team', () => {
  it('lets anyone guess and fails after the limit', () => {
    let m = makeMatch('team', ['crane'])
    for (let i = 0; i < 5; i++) {
      const r = applyGuesses(m, i % 2 ? 'b' : 'a', [{ board: 0, word: 'slate' }], valid, i)
      if (!r.ok) throw new Error(r.error)
      m = r.match
      expect(m.status).toBe('active')
    }
    const r = applyGuesses(m, 'a', [{ board: 0, word: 'slate' }], valid, 9)
    if (!r.ok) throw new Error(r.error)
    expect(r.match.status).toBe('finished')
    expect(r.match.result).toBe('lost')
  })

  it('wins only when every board is solved', () => {
    const m = makeMatch('team', ['crane', 'slate'])
    const r1 = applyGuesses(m, 'a', [{ board: 0, word: 'crane' }], valid, 1)
    if (!r1.ok) throw new Error(r1.error)
    expect(r1.match.status).toBe('active')
    const r2 = applyGuesses(r1.match, 'a', [{ board: 1, word: 'slate' }], valid, 2)
    if (!r2.ok) throw new Error(r2.error)
    expect(r2.match.result).toBe('won')
  })
})
