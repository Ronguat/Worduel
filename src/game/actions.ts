import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, type User } from 'firebase/auth'
import { collection, deleteDoc, doc, runTransaction, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import type { GuessEntry, Match, Mode, Profile, WordLength } from '../types'
import { applyGuesses, newMatchData, nextFirstPlayer, resign, setFaceoffWord, startWith, type ApplyResult } from './logic'
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

export function profileOf(user: User): Profile {
  const name = user.displayName?.split(' ')[0] || user.email?.split('@')[0] || 'Player'
  return { name, photo: user.photoURL ?? null }
}

export function saveProfile(user: User) {
  return setDoc(doc(db, 'users', user.uid), profileOf(user), { merge: true })
}

const matchRef = (id: string) => doc(db, 'matches', id)

export async function createMatch(
  user: User,
  opts: { mode: Mode; length: WordLength; boardCount: number; hardMode: boolean },
  opponent: { uid: string; profile: Profile } | null,
  history: Match[],
) {
  const ref = doc(collection(db, 'matches'))
  const now = Date.now()
  let data = newMatchData({
    ...opts,
    answers: opts.mode === 'faceoff' ? [] : await pickAnswers(opts.length, opts.boardCount),
    creator: user.uid,
    creatorProfile: profileOf(user),
    now,
  })
  if (opponent) {
    const first = nextFirstPlayer(history, user.uid, opponent.uid, user.uid)
    data = startWith(data, opponent.uid, opponent.profile, first, now)
  }
  await setDoc(ref, data)
  return ref.id
}

export async function joinMatch(user: User, id: string, history: Match[]) {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(matchRef(id))
    if (!snap.exists()) throw new Error('Match not found')
    const m = snap.data() as Omit<Match, 'id'>
    if (m.players.includes(user.uid)) return
    if (m.status !== 'waiting' || m.players.length !== 1) throw new Error('This match already has two players')
    const first = nextFirstPlayer(history, m.createdBy, user.uid, m.createdBy)
    tx.set(matchRef(id), startWith(m, user.uid, profileOf(user), first, Date.now()))
  })
}

/** Reads the match, applies `update`, and writes the result, all in one transaction. */
async function transact(matchId: string, update: (m: Match) => ApplyResult) {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(matchRef(matchId))
    if (!snap.exists()) throw new Error('Match not found')
    const result = update({ id: matchId, ...(snap.data() as Omit<Match, 'id'>) })
    if (!result.ok) throw new Error(result.error)
    const { id: _id, ...data } = result.match
    tx.set(matchRef(matchId), data)
  })
}

export async function submitGuesses(uid: string, matchId: string, length: WordLength, entries: GuessEntry[]) {
  const words = await loadValidWords(length)
  await transact(matchId, (m) => applyGuesses(m, uid, entries, (w) => words.has(w), Date.now()))
}

export async function pickFaceoffWord(uid: string, matchId: string, length: WordLength, word: string) {
  const words = await loadValidWords(length)
  await transact(matchId, (m) => setFaceoffWord(m, uid, word, (w) => words.has(w), Date.now()))
}

export async function resignMatch(uid: string, matchId: string) {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(matchRef(matchId))
    if (!snap.exists()) throw new Error('Match not found')
    const m = { id: matchId, ...(snap.data() as Omit<Match, 'id'>) }
    if (m.status !== 'active') return
    const { id: _id, ...data } = resign(m, uid, Date.now())
    tx.set(matchRef(matchId), data)
  })
}

export const deleteMatch = (id: string) => deleteDoc(matchRef(id))
