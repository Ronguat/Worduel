import { onAuthStateChanged, type User } from 'firebase/auth'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { useCallback, useEffect, useRef, useState } from 'react'
import { auth, db } from './firebase'
import type { Match } from './types'

/** undefined while loading, null when signed out */
export function useAuthUser() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  useEffect(() => onAuthStateChanged(auth, setUser), [])
  return user
}

export function useMyMatches(uid: string) {
  const [matches, setMatches] = useState<Match[] | null>(null)
  useEffect(() => {
    const q = query(collection(db, 'matches'), where('players', 'array-contains', uid))
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Match, 'id'>) }))
        list.sort((a, b) => b.updatedAt - a.updatedAt)
        setMatches(list)
      },
      (err) => {
        console.error(err)
        setMatches([])
      },
    )
  }, [uid])
  return matches
}

/** undefined while loading, null if missing or unreadable */
export function useMatch(id: string) {
  const [match, setMatch] = useState<Match | null | undefined>(undefined)
  useEffect(() => {
    setMatch(undefined)
    return onSnapshot(
      doc(db, 'matches', id),
      (snap) => setMatch(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Match, 'id'>) } : null),
      (err) => {
        console.error(err)
        setMatch(null)
      },
    )
  }, [id])
  return match
}

export type Route = { name: 'lobby' } | { name: 'new' } | { name: 'match'; id: string }

function parseHash(): Route {
  const h = location.hash.replace(/^#\/?/, '')
  const [a, b] = h.split('/')
  if (a === 'm' && b) return { name: 'match', id: b }
  if (a === 'new') return { name: 'new' }
  return { name: 'lobby' }
}

export function useRoute() {
  const [route, setRoute] = useState(parseHash)
  useEffect(() => {
    const on = () => setRoute(parseHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function go(path: string) {
  location.hash = path
}

export function useToast() {
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null)
  const timer = useRef<number>()
  const show = useCallback((text: string, ms = 1800) => {
    window.clearTimeout(timer.current)
    setToast({ text, key: Date.now() })
    timer.current = window.setTimeout(() => setToast(null), ms)
  }, [])
  return [toast, show] as const
}

export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage unavailable */
    }
  }, [key, value])
  return [value, setValue] as const
}

export function useMediaQuery(q: string) {
  const [matches, setMatches] = useState(() => window.matchMedia?.(q).matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.(q)
    if (!mq) return
    const on = () => setMatches(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [q])
  return matches
}
