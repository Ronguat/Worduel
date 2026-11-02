import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, type User } from 'firebase/auth'
import { collection, deleteDoc, deleteField, doc, runTransaction, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import type { GuessEntry, Match, Mode, Profile, WordLength } from '../types'
import {
  applyGuesses,
  callOff,
  newMatchData,
  nextFirstPlayer,
  resign,
  revealFaceoffWord,
  setFaceoffWord,
  startWith,
  type ApplyResult,
} from './logic'
import { loadValidWords, pickAnswers } from './words'

export async function signIn() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    await signInWithPopup(auth, provider)
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider)
    } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      throw e
    }
  }
}

export const logOut = () => signOut(auth)

const matchRef = (id: string) => doc(db, 'matches', id)

type MatchOptions = { mode: Mode; length: WordLength; boardCount: number; hardMode: boolean }
type Opponent = { uid: string; profile: Profile }

async function buildMatch(user: User, me: Profile, opts: MatchOptions, opponent: Opponent | null, history: Match[]) {
  const now = Date.now()
  let data = newMatchData({
    ...opts,
    answers: opts.mode === 'faceoff' ? [] : await pickAnswers(opts.length, opts.boardCount),
    creator: user.uid,
    creatorProfile: me,
    now,
  })
  if (opponent) {
    const first = nextFirstPlayer(history, user.uid, opponent.uid, user.uid)
    data = startWith(data, opponent.uid, opponent.profile, first, now)
  }
  return data
}

export async function createMatch(user: User, me: Profile, opts: MatchOptions, opponent: Opponent | null, history: Match[]) {
  const ref = doc(collection(db, 'matches'))
  await setDoc(ref, await buildMatch(user, me, opts, opponent, history))
  return ref.id
}

/**
 * Starts a rematch of a finished match and links it from the old one, or returns the rematch the other
 * player already started, so both pressing Rematch end up in the same match. Classic duels rematch as duels
 * (the 'faceoff' mode).
 */
export async function startRematch(user: User, me: Profile, old: Match, opponent: Opponent, history: Match[]) {
  const mode = old.mode === 'duel' ? 'faceoff' : old.mode
  const data = { ...(await buildMatch(user, me, { mode, length: old.length, hardMode: old.hardMode, boardCount: 1 }, opponent, history)), rematchOf: old.id }
  const ref = doc(collection(db, 'matches'))
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(matchRef(old.id))
    const existing = (snap.data() as Match | undefined)?.rematch
    if (existing) return existing.id
    tx.set(ref, data)
    tx.update(matchRef(old.id), { rematch: { id: ref.id, by: user.uid } })
    return ref.id
  })
}

// Each action resolves with the match as written, so the screen can show it right away
// even if the live update is slow to arrive (e.g. a phone resuming from the background).

export async function joinMatch(user: User, me: Profile, id: string, history: Match[]): Promise<Match | null> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(matchRef(id))
    if (!snap.exists()) throw new Error('Match not found')
    const m = snap.data() as Omit<Match, 'id'>
    if (m.players.includes(user.uid)) return null
    if (m.status !== 'waiting' || m.players.length !== 1) throw new Error('This match already has two players')
    const first = nextFirstPlayer(history, m.createdBy, user.uid, m.createdBy)
    const data = startWith(m, user.uid, me, first, Date.now())
    tx.set(matchRef(id), data)
    return { id, ...data }
  })
}

/** Reads the match, applies `update`, and writes the result, all in one transaction. */
function transact(matchId: string, update: (m: Match) => ApplyResult): Promise<Match> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(matchRef(matchId))
    if (!snap.exists()) throw new Error('Match not found')
    const result = update({ id: matchId, ...(snap.data() as Omit<Match, 'id'>) })
    if (!result.ok) throw new Error(result.error)
    const { id: _id, ...data } = result.match
    tx.set(matchRef(matchId), data)
    return result.match
  })
}

export async function submitGuesses(uid: string, matchId: string, length: WordLength, entries: GuessEntry[]) {
  const words = await loadValidWords(length)
  return transact(matchId, (m) => applyGuesses(m, uid, entries, (w) => words.has(w), Date.now()))
}

export async function pickFaceoffWord(uid: string, matchId: string, length: WordLength, word: string) {
  const words = await loadValidWords(length)
  return transact(matchId, (m) => setFaceoffWord(m, uid, word, (w) => words.has(w), Date.now()))
}

export const revealWord = (uid: string, matchId: string) => transact(matchId, (m) => revealFaceoffWord(m, uid, Date.now()))

export const resignMatch = (uid: string, matchId: string) =>
  transact(matchId, (m) => (m.status === 'active' ? { ok: true, match: resign(m, uid, Date.now()) } : { ok: true, match: m }))

/**
 * Cancels (creator) or declines (other player) a match nobody has guessed in yet. If it was a rematch, the
 * finished match it came from is unlinked so Rematch starts a fresh one.
 */
export function callOffMatch(uid: string, matchId: string) {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(matchRef(matchId))
    if (!snap.exists()) throw new Error('Match not found')
    const result = callOff({ id: matchId, ...(snap.data() as Omit<Match, 'id'>) }, uid, Date.now())
    if (!result.ok) throw new Error(result.error)
    const parentId = result.match.rematchOf
    const parent = parentId ? await tx.get(matchRef(parentId)) : null
    const { id: _id, ...data } = result.match
    tx.set(matchRef(matchId), data)
    if (parentId && (parent?.data() as Match | undefined)?.rematch?.id === matchId) {
      tx.update(matchRef(parentId), { rematch: deleteField() })
    }
    return result.match
  })
}

export const deleteMatch = (id: string) => deleteDoc(matchRef(id))
