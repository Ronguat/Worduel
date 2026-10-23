import { describe, expect, it } from 'vitest'
import { applyGuesses, boardTurn, decodeAnswer, duelWinner, encodeAnswer, hardModeViolation, needsMe, teamMaxGuesses, newMatchData, nextFirstPlayer, score, setFaceoffWord, startWith } from './logic'
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

describe('team guess limits', () => {
  it('gives 6 guesses for 4 and 5 letters, 7 for 6', () => {
    expect([4, 5, 6].map((n) => teamMaxGuesses(n as 4 | 5 | 6))).toEqual([6, 6, 7])
  })
  it('plays a four-letter board', () => {
    const base = newMatchData({ mode: 'duel', length: 4, boardCount: 1, hardMode: true, answers: ['fate'], creator: 'a', creatorProfile: { name: 'A', photo: null }, now: 0 })
    let m: Match = { id: 'm', ...startWith(base, 'b', { name: 'B', photo: null }, 'a', 0) }
    const r1 = applyGuesses(m, 'a', [{ board: 0, word: 'gate' }], valid, 1)
    if (!r1.ok) throw new Error(r1.error)
    m = r1.match
    expect(applyGuesses(m, 'b', [{ board: 0, word: 'fish' }], valid, 2).ok).toBe(false) // hard mode: _ATE
    const r2 = applyGuesses(m, 'b', [{ board: 0, word: 'fate' }], valid, 2)
    if (!r2.ok) throw new Error(r2.error)
    expect(r2.match.winner).toBe('b')
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
    expect(boardTurn(m, 0)).toBe('b')
    const r3 = applyGuesses(m, 'b', [{ board: 0, word: 'crane' }], valid, 2)
    if (!r3.ok) throw new Error(r3.error)
    expect(r3.match.status).toBe('finished')
    expect(r3.match.winner).toBe('b')
  })

  it('gives each board its own turns', () => {
    const m = makeMatch('duel', ['crane', 'slate', 'pious'])
    // first moves alternate across boards
    expect([0, 1, 2].map((i) => boardTurn(m, i))).toEqual(['a', 'b', 'a'])
    expect(needsMe(m, 'a') && needsMe(m, 'b')).toBe(true)
    expect(applyGuesses(m, 'a', [{ board: 1, word: 'adieu' }], valid, 1).ok).toBe(false)

    const r1 = applyGuesses(m, 'a', [{ board: 0, word: 'adieu' }], valid, 1)
    if (!r1.ok) throw new Error(r1.error)
    expect(boardTurn(r1.match, 0)).toBe('b')
    expect(boardTurn(r1.match, 2)).toBe('a')
    expect(applyGuesses(r1.match, 'a', [{ board: 0, word: 'stout' }], valid, 2).ok).toBe(false)

    const r2 = applyGuesses(r1.match, 'a', [{ board: 2, word: 'pious' }], valid, 2)
    if (!r2.ok) throw new Error(r2.error)
    expect(r2.match.boards[2].solvedBy).toBe('a')
    expect(needsMe(r2.match, 'a')).toBe(false)

    const r3 = applyGuesses(r2.match, 'b', [{ board: 1, word: 'stout' }], valid, 3)
    if (!r3.ok) throw new Error(r3.error)
    expect(boardTurn(r3.match, 0)).toBe('b')
    expect(boardTurn(r3.match, 1)).toBe('a')
    expect(needsMe(r3.match, 'a')).toBe(true)
  })

  it('works out turns for matches made before per-board turns', () => {
    // you: STARE (board 1), them: MASKS (board 1), you: BREAK (board 2)
    const m = makeMatch('duel', ['mangs', 'freak'])
    m.boards[0].guesses = [
      { w: 'stare', by: 'a', turn: 0, at: 0 },
      { w: 'masks', by: 'b', turn: 1, at: 0 },
    ]
    m.boards[1].guesses = [{ w: 'break', by: 'a', turn: 2, at: 0 }]
    m.turnCount = 3
    m.turn = 'b'
    expect(boardTurn(m, 0)).toBe('a')
    expect(boardTurn(m, 1)).toBe('b')
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
