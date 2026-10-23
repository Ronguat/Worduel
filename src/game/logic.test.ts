import { describe, expect, it } from 'vitest'
import { applyGuesses, decodeAnswer, duelWinner, encodeAnswer, endTurn, hardModeViolation, needsMe, newMatchData, nextFirstPlayer, score, setFaceoffWord, startWith } from './logic'
import type { Match } from '../types'

const valid = () => true

function makeMatch(mode: 'duel' | 'team' | 'faceoff', answers: string[], hardMode = false): Match {
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

  it('lets a turn cover any subset of boards, one guess at a time', () => {
    const m = makeMatch('duel', ['crane', 'slate', 'pious'])
    const r1 = applyGuesses(m, 'a', [{ board: 0, word: 'crane' }], valid, 1)
    if (!r1.ok) throw new Error(r1.error)
    expect(r1.match.boards[0].solvedBy).toBe('a')
    expect(r1.match.turn).toBe('a')
    const r2 = applyGuesses(r1.match, 'a', [{ board: 2, word: 'adieu' }], valid, 2)
    if (!r2.ok) throw new Error(r2.error)
    expect(r2.match.boards.map((b) => b.guesses.length)).toEqual([1, 0, 1])
    expect(r2.match.turn).toBe('a')
    expect(applyGuesses(r2.match, 'a', [{ board: 2, word: 'stout' }], valid, 3).ok).toBe(false)
    const ended = endTurn(r2.match, 'a', 3)
    if (!ended.ok) throw new Error(ended.error)
    expect(ended.match.turn).toBe('b')
    expect(applyGuesses(ended.match, 'b', [{ board: 0, word: 'crane' }], valid, 4).ok).toBe(false)
    const r3 = applyGuesses(ended.match, 'b', [{ board: 2, word: 'stout' }], valid, 4)
    if (!r3.ok) throw new Error(r3.error)
    expect(r3.match.turn).toBe('b')
  })

  it('passes the turn automatically once every open board has a guess', () => {
    const m = makeMatch('duel', ['crane', 'slate'])
    expect(endTurn(m, 'a', 1).ok).toBe(false)
    const r1 = applyGuesses(m, 'a', [{ board: 0, word: 'adieu' }], valid, 1)
    if (!r1.ok) throw new Error(r1.error)
    const r2 = applyGuesses(r1.match, 'a', [{ board: 1, word: 'adieu' }], valid, 2)
    if (!r2.ok) throw new Error(r2.error)
    expect(r2.match.turn).toBe('b')
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

describe('face-off', () => {
  const pick = (m: Match, uid: string, w: string) => {
    const r = setFaceoffWord(m, uid, w, valid, 1)
    if (!r.ok) throw new Error(r.error)
    return r.match
  }
  const play = (m: Match, uid: string, w: string) => {
    const r = applyGuesses(m, uid, [{ board: m.boards.findIndex((b) => b.guesser === uid), word: w }], valid, 2)
    if (!r.ok) throw new Error(r.error)
    return r.match
  }

  it("has each player pick the other one's word", () => {
    let m = makeMatch('faceoff', [])
    expect(m.boards.map((b) => b.guesser)).toEqual(['a', 'b'])
    expect(needsMe(m, 'a')).toBe(true)
    expect(applyGuesses(m, 'a', [{ board: 0, word: 'crane' }], valid, 1).ok).toBe(false)
    m = pick(m, 'b', 'crane')
    expect(decodeAnswer(m.boards[0].a)).toBe('crane')
    expect(setFaceoffWord(m, 'b', 'slate', valid, 1).ok).toBe(false)
    m = play(m, 'a', 'slate')
    expect(applyGuesses(m, 'a', [{ board: 1, word: 'slate' }], valid, 1).ok).toBe(false)
  })

  it('awards the win to fewer guesses, ending early when decided', () => {
    let m = pick(pick(makeMatch('faceoff', []), 'a', 'pious'), 'b', 'crane')
    m = play(m, 'a', 'slate')
    m = play(m, 'a', 'crane')
    expect(m.status).toBe('active')
    m = play(m, 'b', 'adieu')
    expect(m.status).toBe('active')
    m = play(m, 'b', 'stout')
    expect(m.status).toBe('finished')
    expect(m.winner).toBe('a')
  })

  it('calls equal guess counts a draw', () => {
    let m = pick(pick(makeMatch('faceoff', []), 'a', 'pious'), 'b', 'crane')
    m = play(m, 'a', 'crane')
    m = play(m, 'b', 'pious')
    expect(m.status).toBe('finished')
    expect(m.winner).toBeNull()
    expect(m.result).toBe('draw')
  })
})
