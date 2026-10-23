import type { BoardState, GuessEntry, Mark, Match, Mode, WordLength } from '../types'

export const DUEL_VISIBLE_ROWS = 8

export function teamMaxGuesses(length: WordLength) {
  return length === 5 ? 6 : 7
}

export function encodeAnswer(word: string) {
  return btoa(word.split('').reverse().join(''))
}

export function decodeAnswer(a: string) {
  return atob(a).split('').reverse().join('')
}

export function score(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array(guess.length).fill('absent')
  const remaining: Record<string, number> = {}
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) marks[i] = 'correct'
    else remaining[answer[i]] = (remaining[answer[i]] ?? 0) + 1
  }
  for (let i = 0; i < guess.length; i++) {
    if (marks[i] === 'correct') continue
    if (remaining[guess[i]] > 0) {
      marks[i] = 'present'
      remaining[guess[i]]--
    }
  }
  return marks
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th']

/** Returns a message if `guess` ignores a hint revealed by an earlier guess, else null. */
export function hardModeViolation(guess: string, answer: string, prior: string[]): string | null {
  for (const word of prior) {
    const marks = score(word, answer)
    for (let i = 0; i < word.length; i++) {
      if (marks[i] === 'correct' && guess[i] !== word[i]) {
        return `${ORDINALS[i]} letter must be ${word[i].toUpperCase()}`
      }
    }
  }
  for (const word of prior) {
    const marks = score(word, answer)
    const needed: Record<string, number> = {}
    for (let i = 0; i < word.length; i++) {
      if (marks[i] !== 'absent') needed[word[i]] = (needed[word[i]] ?? 0) + 1
    }
    for (const [letter, n] of Object.entries(needed)) {
      const have = guess.split('').filter((c) => c === letter).length
      if (have < n) {
        const L = letter.toUpperCase()
        return n === 1 ? `Guess must contain ${L}` : `Guess must contain ${n} ${L}s`
      }
    }
  }
  return null
}

export function isOpen(board: BoardState) {
  return !board.solvedBy && !board.failed
}

export function otherPlayer(match: Match, uid: string) {
  return match.players.find((p) => p !== uid) ?? null
}

/** Duel winner: most boards solved, then fewest rows used on the boards won, then the player who went second. */
export function duelWinner(match: Match): string | null {
  if (match.players.length < 2) return null
  const tally = match.players.map((uid) => {
    const won = match.boards.filter((b) => b.solvedBy === uid)
    return { uid, boards: won.length, rows: won.reduce((s, b) => s + b.guesses.length, 0) }
  })
  tally.sort((x, y) => y.boards - x.boards || x.rows - y.rows || (x.uid === match.firstPlayer ? 1 : -1))
  return tally[0].uid
}

export type ApplyResult = { ok: true; match: Match } | { ok: false; error: string }

/** Validates and applies one player's guesses. Pure: returns a new match object. */
export function applyGuesses(
  match: Match,
  uid: string,
  entries: GuessEntry[],
  isValidWord: (w: string) => boolean,
  now: number,
): ApplyResult {
  if (match.status !== 'active') return { ok: false, error: 'This match is over' }
  if (!match.players.includes(uid)) return { ok: false, error: "You're not in this match" }
  if (match.mode === 'duel' && match.turn !== uid) return { ok: false, error: 'Not your turn' }
  if (entries.length === 0) return { ok: false, error: 'Make at least one guess' }
  if (new Set(entries.map((e) => e.board)).size !== entries.length) {
    return { ok: false, error: 'Only one guess per board per turn' }
  }

  const boards = match.boards.map((b) => ({ ...b, guesses: [...b.guesses] }))
  for (const { board: i, word } of entries) {
    const board = boards[i]
    if (!board) return { ok: false, error: 'No such board' }
    if (!isOpen(board)) return { ok: false, error: `Board ${i + 1} is already finished` }
    if (word.length !== match.length) return { ok: false, error: 'Not enough letters' }
    if (!isValidWord(word)) return { ok: false, error: `${word.toUpperCase()} is not in the word list` }
    const answer = decodeAnswer(board.a)
    if (match.hardMode) {
      const v = hardModeViolation(word, answer, board.guesses.map((g) => g.w))
      if (v) return { ok: false, error: match.boardCount > 1 ? `Board ${i + 1}: ${v}` : v }
    }
    board.guesses.push({ w: word, by: uid, turn: match.turnCount, at: now })
    if (word === answer) board.solvedBy = uid
    else if (match.maxGuesses && board.guesses.length >= match.maxGuesses) board.failed = true
  }

  const next: Match = {
    ...match,
    boards,
    turnCount: match.turnCount + 1,
    updatedAt: now,
    lastMove: { by: uid, at: now },
  }

  if (match.mode === 'duel') {
    if (boards.every((b) => b.solvedBy)) {
      next.status = 'finished'
      next.endReason = 'solved'
      next.turn = null
      next.winner = duelWinner(next)
    } else {
      next.turn = otherPlayer(match, uid)
    }
  } else {
    if (boards.some((b) => b.failed)) {
      next.status = 'finished'
      next.result = 'lost'
      next.endReason = 'failed'
    } else if (boards.every((b) => b.solvedBy)) {
      next.status = 'finished'
      next.result = 'won'
      next.endReason = 'solved'
    }
  }
  return { ok: true, match: next }
}

export function resign(match: Match, uid: string, now: number): Match {
  return {
    ...match,
    status: 'finished',
    endReason: 'resigned',
    turn: null,
    winner: match.mode === 'duel' ? otherPlayer(match, uid) : null,
    result: match.mode === 'team' ? 'lost' : null,
    updatedAt: now,
    lastMove: { by: uid, at: now },
  }
}

/** Who should go first in a new duel between a and b: alternates from their most recent duel. */
export function nextFirstPlayer(history: Match[], a: string, b: string, fallback: string): string {
  const last = history
    .filter((m) => m.mode === 'duel' && m.firstPlayer && m.players.includes(a) && m.players.includes(b))
    .sort((x, y) => y.createdAt - x.createdAt)[0]
  if (!last) return fallback
  return last.firstPlayer === a ? b : a
}

export function newMatchData(opts: {
  mode: Mode
  length: WordLength
  boardCount: number
  hardMode: boolean
  answers: string[]
  creator: string
  creatorProfile: { name: string; photo: string | null }
  now: number
}): Omit<Match, 'id'> {
  return {
    mode: opts.mode,
    length: opts.length,
    boardCount: opts.boardCount,
    hardMode: opts.hardMode,
    maxGuesses: opts.mode === 'team' ? teamMaxGuesses(opts.length) : null,
    players: [opts.creator],
    profiles: { [opts.creator]: opts.creatorProfile },
    createdBy: opts.creator,
    createdAt: opts.now,
    updatedAt: opts.now,
    status: 'waiting',
    firstPlayer: null,
    turn: null,
    turnCount: 0,
    boards: opts.answers.map((w) => ({ a: encodeAnswer(w), guesses: [], solvedBy: null, failed: false })),
    winner: null,
    result: null,
    endReason: null,
    lastMove: null,
  }
}

/** Adds the second player and starts the match. */
export function startWith(match: Omit<Match, 'id'>, uid: string, profile: { name: string; photo: string | null }, firstPlayer: string, now: number) {
  return {
    ...match,
    players: [...match.players, uid],
    profiles: { ...match.profiles, [uid]: profile },
    status: 'active' as const,
    firstPlayer: match.mode === 'duel' ? firstPlayer : null,
    turn: match.mode === 'duel' ? firstPlayer : null,
    updatedAt: now,
  }
}

const RANK: Record<Mark, number> = { absent: 1, present: 2, correct: 3 }

export function keyboardStatus(answer: string, words: string[]): Record<string, Mark> {
  const out: Record<string, Mark> = {}
  for (const w of words) {
    score(w, answer).forEach((m, i) => {
      const c = w[i]
      if (!out[c] || RANK[m] > RANK[out[c]]) out[c] = m
    })
  }
  return out
}
