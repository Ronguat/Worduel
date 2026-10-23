import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { signIn } from './game/actions'
import { needsMe } from './game/logic'
import { useAuthUser, useMyMatches, useRoute } from './hooks'
import { Header, ThemeButton, useTheme } from './components/Chrome'
import { Lobby } from './components/Lobby'
import { MatchView } from './components/MatchView'
import { NewMatch } from './components/NewMatch'
import { NicknameForm } from './components/Nickname'
import { ProfilesContext, googleFirstName, useMyProfile, useProfiles } from './profiles'
import type { Profile } from './types'

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
  const me = useMyProfile(user)
  const matches = useMyMatches(user.uid)
  const profiles = useProfiles((matches ?? []).flatMap((m) => m.players))

  const myTurns = (matches ?? []).filter((m) => m.mode !== 'team' && needsMe(m, user.uid)).length
  useEffect(() => {
    document.title = myTurns ? `(${myTurns}) Worduel` : 'Worduel'
  }, [myTurns])

  if (me === undefined) {
    return (
      <div className="screen">
        <div className="center">
          <div className="logo">Worduel</div>
        </div>
      </div>
    )
  }
  if (me === null) return <FirstNickname user={user} theme={theme} />

  const myProfile: Profile = { name: me.name, photo: user.photoURL ?? null }
  return (
    <ProfilesContext.Provider value={profiles}>
      {route.name === 'match' ? (
        <MatchView id={route.id} user={user} me={myProfile} history={matches ?? []} theme={theme} />
      ) : route.name === 'new' ? (
        <NewMatch user={user} me={myProfile} history={matches ?? []} />
      ) : (
        <Lobby user={user} me={myProfile} matches={matches} theme={theme} />
      )}
    </ProfilesContext.Provider>
  )
}

function FirstNickname({ user, theme }: { user: User; theme: ReturnType<typeof useTheme> }) {
  return (
    <div className="screen">
      <Header right={<ThemeButton {...theme} />} />
      <div className="center">
        <div className="logo">Welcome!</div>
        <p>What should other players call you?</p>
        <NicknameForm user={user} initial={googleFirstName(user)} cta="Let's play" />
      </div>
    </div>
  )
}
