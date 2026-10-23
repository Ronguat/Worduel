import type { User } from 'firebase/auth'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { db } from './firebase'
import type { Profile } from './types'

export const MAX_NICKNAME = 20

/** The default nickname offered on first sign-in. */
export function googleFirstName(user: User) {
  return (user.displayName?.split(' ')[0] || user.email?.split('@')[0] || 'Player').slice(0, MAX_NICKNAME)
}

/** Trims and validates a nickname; returns an error message, or the cleaned name. */
export function cleanNickname(raw: string): { name: string } | { error: string } {
  const name = raw.replace(/\s+/g, ' ').trim()
  if (!name) return { error: 'Pick a name' }
  if ([...name].length > MAX_NICKNAME) return { error: `Keep it to ${MAX_NICKNAME} characters` }
  return { name }
}

export function saveNickname(user: User, name: string) {
  return setDoc(doc(db, 'users', user.uid), { name, photo: user.photoURL ?? null }, { merge: true })
}

/** Your own profile: undefined while loading, null if you haven't picked a nickname yet. */
export function useMyProfile(user: User) {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'users', user.uid),
        { includeMetadataChanges: true },
        (snap) => {
          // A missing doc in the offline cache doesn't mean it's missing on the server.
          if (!snap.exists()) setProfile(snap.metadata.fromCache ? undefined : null)
          else setProfile(snap.data() as Profile)
        },
        (err) => {
          console.error(err)
          setProfile(null)
        },
      ),
    [user.uid],
  )
  return profile
}

/** Live profiles for a set of players, so nickname changes show up everywhere. */
export function useProfiles(uids: string[]) {
  const key = [...new Set(uids)].sort().join(',')
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  useEffect(() => {
    const unsubs = key
      .split(',')
      .filter(Boolean)
      .map((uid) =>
        onSnapshot(
          doc(db, 'users', uid),
          (snap) => snap.exists() && setProfiles((p) => ({ ...p, [uid]: snap.data() as Profile })),
          (err) => console.error(err),
        ),
      )
    return () => unsubs.forEach((u) => u())
  }, [key])
  return profiles
}

export const ProfilesContext = createContext<Record<string, Profile>>({})

/**
 * Returns a function giving a player's current nickname, falling back to the name
 * stored with a match (from when it started) for players we aren't watching.
 */
export function useNameOf(snapshot?: Record<string, Profile>) {
  const live = useContext(ProfilesContext)
  return useCallback(
    (uid: string | null | undefined) => (uid && (live[uid]?.name || snapshot?.[uid]?.name)) || 'Opponent',
    [live, snapshot],
  )
}
