import type { BoardState, GuessEntry, Mark, Match, Mode, WordLength } from '../types'

export const DUEL_VISIBLE_ROWS = 8

export function teamMaxGuesses(length: WordLength) {
  return length === 6 ? 7 : 6
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

/**
 * Duel: whose move it is on board `i`. Each board alternates on its own: whoever didn't make the last guess.
 * First moves alternate across boards, starting with the match's first player on board 1.
 */
export function boardTurn(match: Match, i: number): string | null {
  const board = match.boards[i]
  if (!board || !match.firstPlayer) return null
  const last = board.guesses[board.guesses.length - 1]
  if (last) return otherPlayer(match, last.by)
  return i % 2 === 0 ? match.firstPlayer : otherPlayer(match, match.firstPlayer)
}

/** Whether `uid` may type a guess on board `i` right now. */
/**
 * Face-off: once the result is settled, the loser may keep guessing their word (or reveal it).
 * Those guesses never change the result.
 */
export function isPlayingOn(match: Match, board: BoardState | undefined) {
  return (
    !!board && match.mode === 'faceoff' && match.status === 'finished' && match.endReason === 'solved' && !!board.a && isOpen(board)
  )
}

export function canGuessOn(match: Match, uid: string, i: number) {
  const board = match.boards[i]
  if (!board || !match.players.includes(uid) || !isOpen(board)) return false
  if (match.status !== 'active') return isPlayingOn(match, board) && board.guesser === uid
  if (match.mode === 'duel') return boardTurn(match, i) === uid
  if (match.mode === 'faceoff') return board.guesser === uid && !!board.a
  return true
}

/** Face-off: the board `uid` is guessing on, and the one their opponent is guessing on (`uid`'s word). */
export function faceoffBoards(match: Match, uid: string) {
  return {
    mine: match.boards.find((b) => b.guesser === uid) ?? null,
    theirs: match.boards.find((b) => b.guesser && b.guesser !== uid) ?? null,
  }
}

/** Does this match have something for `uid` to do? */
export function needsMe(match: Match, uid: string) {
  if (match.status !== 'active' || !match.players.includes(uid)) return false
  if (match.mode === 'duel') return match.boards.some((b, i) => isOpen(b) && boardTurn(match, i) === uid)
  if (match.mode === 'faceoff') {
    const { mine, theirs } = faceoffBoards(match, uid)
    return (!!theirs && !theirs.a) || (!!mine && !!mine.a && isOpen(mine))
  }
  return true
}

/** Duel winner: most boards solved, then fewest rows used on the boards won, then whoever moved second on board 1. */
export function duelWinner(match: Match): string | null {
  if (match.players.length < 2) return null
  const tally = match.players.map((uid) => {
    const won = match.boards.filter((b) => b.solvedBy === uid)
    return { uid, boards: won.length, rows: won.reduce((s, b) => s + b.guesses.length, 0) }
  })
  tally.sort((x, y) => y.boards - x.boards || x.rows - y.rows || (x.uid === match.firstPlayer ? 1 : -1))
  return tally[0].uid
}

/**
 * Face-off result once it's decided: fewer guesses wins, equal is a draw.
 * Decided early when one player has solved and the other has already used as many guesses without solving.
 */
export function faceoffOutcome(match: Match): { winner: string | null; draw: boolean } | null {
  const [x, y] = match.boards
  if (!x || !y || !x.guesser || !y.guesser) return null
  if (x.solvedBy && y.solvedBy) {
    if (x.guesses.length === y.guesses.length) return { winner: null, draw: true }
    return { winner: x.guesses.length < y.guesses.length ? x.guesser : y.guesser, draw: false }
  }
  if (x.solvedBy && y.guesses.length >= x.guesses.length) return { winner: x.guesser, draw: false }
  if (y.solvedBy && x.guesses.length >= y.guesses.length) return { winner: y.guesser, draw: false }
  return null
}

/**
 * How far along a match is. Every action (join, pick, guess, reveal, finish) increases it,
 * so a newer copy of a match can be told apart from an older one without trusting clocks.
 */
export function progress(m: Match) {
  let n = m.players.length + (m.status === 'finished' ? 1 : 0)
  for (const b of m.boards) n += b.guesses.length * 4 + (b.a ? 1 : 0) + (b.failed ? 1 : 0) + (b.solvedBy ? 1 : 0)
  return n
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
  const playingOn = match.status !== 'active' && entries.every((e) => isPlayingOn(match, match.boards[e.board]))
  if (match.status !== 'active' && !playingOn) return { ok: false, error: 'This match is over' }
  if (!match.players.includes(uid)) return { ok: false, error: "You're not in this match" }
  if (entries.length === 0) return { ok: false, error: 'Make at least one guess' }
  if (new Set(entries.map((e) => e.board)).size !== entries.length) {
    return { ok: false, error: 'Only one guess per board per turn' }
  }

  const label = (i: number) => (match.boardCount > 1 ? `Board ${i + 1}: ` : '')
  const boards = match.boards.map((b) => ({ ...b, guesses: [...b.guesses] }))
  for (const { board: i, word } of entries) {
    const board = boards[i]
    if (!board) return { ok: false, error: 'No such board' }
    if (!isOpen(board)) return { ok: false, error: `${label(i)}already finished` }
    if (match.mode === 'duel' && boardTurn(match, i) !== uid) {
      return { ok: false, error: `${label(i)}it's not your move` }
    }
    if (match.mode === 'faceoff' && (board.guesser !== uid || !board.a)) {
      return { ok: false, error: "You can't guess on that board" }
    }
    if (word.length !== match.length) return { ok: false, error: 'Not enough letters' }
    if (!isValidWord(word)) return { ok: false, error: `${word.toUpperCase()} is not in the word list` }
    const answer = decodeAnswer(board.a)
    if (match.hardMode) {
      const v = hardModeViolation(word, answer, board.guesses.map((g) => g.w))
      if (v) return { ok: false, error: label(i) + v }
    }
    board.guesses.push({ w: word, by: uid, turn: match.turnCount, at: now })
    if (word === answer) board.solvedBy = uid
    else if (match.maxGuesses && board.guesses.length >= match.maxGuesses) board.failed = true
  }

  let next: Match = { ...match, boards, turnCount: match.turnCount + 1, updatedAt: now, lastMove: { by: uid, at: now } }

  if (match.mode === 'duel') {
    if (boards.every((b) => b.solvedBy)) {
      next = { ...next, status: 'finished', endReason: 'solved', turn: null }
      next.winner = duelWinner(next)
    }
  } else if (match.mode === 'faceoff') {
    const out = playingOn ? null : faceoffOutcome(next)
    if (out) {
      next = { ...next, status: 'finished', endReason: 'solved', winner: out.winner, result: out.draw ? 'draw' : null }
    }
  } else {
    if (boards.some((b) => b.failed)) {
      next = { ...next, status: 'finished', result: 'lost', endReason: 'failed' }
    } else if (boards.every((b) => b.solvedBy)) {
      next = { ...next, status: 'finished', result: 'won', endReason: 'solved' }
    }
  }
  return { ok: true, match: next }
}

/** Face-off: `uid` picks the word their opponent has to guess. */
export function setFaceoffWord(match: Match, uid: string, word: string, isValidWord: (w: string) => boolean, now: number): ApplyResult {
  if (match.mode !== 'faceoff' || match.status !== 'active') return { ok: false, error: 'Not a face-off in progress' }
  const i = match.boards.findIndex((b) => b.guesser && b.guesser !== uid)
  if (i < 0 || !match.players.includes(uid)) return { ok: false, error: "You're not in this match" }
  if (match.boards[i].a) return { ok: false, error: 'You already picked a word' }
  if (word.length !== match.length) return { ok: false, error: 'Not enough letters' }
  if (!isValidWord(word)) return { ok: false, error: `${word.toUpperCase()} is not in the word list` }
  const boards = match.boards.map((b, j) => (j === i ? { ...b, a: encodeAnswer(word) } : b))
  return { ok: true, match: { ...match, boards, updatedAt: now, lastMove: { by: uid, at: now } } }
}

/** Face-off: after losing, stop playing on and reveal your word. */
export function revealFaceoffWord(match: Match, uid: string, now: number): ApplyResult {
  const i = match.boards.findIndex((b) => b.guesser === uid)
  if (i < 0 || !isPlayingOn(match, match.boards[i])) return { ok: false, error: 'Nothing to reveal' }
  const boards = match.boards.map((b, j) => (j === i ? { ...b, failed: true } : b))
  return { ok: true, match: { ...match, boards, updatedAt: now, lastMove: { by: uid, at: now } } }
}

export function resign(match: Match, uid: string, now: number): Match {
  return {
    ...match,
    status: 'finished',
    endReason: 'resigned',
    turn: null,
    winner: match.mode === 'team' ? null : otherPlayer(match, uid),
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
    boardCount: opts.mode === 'faceoff' ? 1 : opts.boardCount,
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
    boards:
      opts.mode === 'faceoff' ? [] : opts.answers.map((w) => ({ a: encodeAnswer(w), guesses: [], solvedBy: null, failed: false })),
    winner: null,
    result: null,
    endReason: null,
    lastMove: null,
  }
}

/** Adds the second player and starts the match. */
export function startWith(match: Omit<Match, 'id'>, uid: string, profile: { name: string; photo: string | null }, firstPlayer: string, now: number) {
  const players = [...match.players, uid]
  return {
    ...match,
    players,
    profiles: { ...match.profiles, [uid]: profile },
    status: 'active' as const,
    firstPlayer: match.mode === 'duel' ? firstPlayer : null,
    boards:
      match.mode === 'faceoff'
        ? players.map((p) => ({ a: '', guesses: [], solvedBy: null, failed: false, guesser: p }))
        : match.boards,
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
