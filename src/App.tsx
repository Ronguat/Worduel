import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { saveProfile, signIn } from './game/actions'
import { needsMe } from './game/logic'
import { useAuthUser, useMyMatches, useRoute } from './hooks'
import { Header, ThemeButton, useTheme } from './components/Chrome'
import { Lobby } from './components/Lobby'
import { MatchView } from './components/MatchView'
import { NewMatch } from './components/NewMatch'

export default function App() {
  const user = useAuthUser()
  const theme = useTheme()
  if (user === undefined) {
    return (
      <div className="screen">
        <div className="center">
          <div className="logo">Worduel</div>
        </div>
      </div>
    )
  }
  if (!user) return <SignIn theme={theme} />
  return <SignedIn user={user} theme={theme} />
}

function SignIn({ theme }: { theme: ReturnType<typeof useTheme> }) {
  const [error, setError] = useState<string | null>(null)
  const invited = location.hash.startsWith('#/m/')
  return (
    <div className="screen">
      <Header right={<ThemeButton {...theme} />} />
      <div className="center">
        <div className="logo">Worduel</div>
        <p>
          {invited
            ? "You've been invited to a match. Sign in to join."
            : 'Wordle with a friend, one guess at a time. Matches save as you go, so you can chip away whenever.'}
        </p>
        <button className="btn" onClick={() => signIn().catch((e) => setError(e.message))}>
          Sign in with Google
        </button>
        {error && <p>{error}</p>}
      </div>
    </div>
  )
}

function SignedIn({ user, theme }: { user: User; theme: ReturnType<typeof useTheme> }) {
  const route = useRoute()
  const matches = useMyMatches(user.uid)

  useEffect(() => {
    saveProfile(user).catch(console.error)
  }, [user])

  const myTurns = (matches ?? []).filter((m) => m.mode !== 'team' && needsMe(m, user.uid)).length
  useEffect(() => {
    document.title = myTurns ? `(${myTurns}) Worduel` : 'Worduel'
  }, [myTurns])

  if (route.name === 'match') return <MatchView id={route.id} user={user} history={matches ?? []} theme={theme} />
  if (route.name === 'new') return <NewMatch user={user} history={matches ?? []} />
  return <Lobby user={user} matches={matches} theme={theme} />
}
