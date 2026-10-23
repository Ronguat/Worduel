import type { User } from 'firebase/auth'
import { useState } from 'react'
import { logOut } from '../game/actions'
import { hasUnreadChat } from '../game/chat'
import { faceoffBoards, needsMe, otherPlayer } from '../game/logic'
import { go } from '../hooks'
import type { Match } from '../types'
import { Header, HelpButton, ThemeButton } from './Chrome'

function ago(t: number) {
  const s = (Date.now() - t) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`
  return new Date(t).toLocaleDateString()
}

export function describe(m: Match) {
  const mode = { duel: 'Duel', team: 'Team', faceoff: 'Face-off' }[m.mode]
  return [mode, `${m.length} letters`, m.boardCount > 1 ? `${m.boardCount} boards` : null, m.hardMode ? 'Hard' : null]
    .filter(Boolean)
    .join(' · ')
}

function MatchCard({ m, me }: { m: Match; me: string }) {
  const opp = otherPlayer(m, me)
  const oppName = (opp && m.profiles[opp]?.name) || 'someone'
  const title =
    m.status === 'waiting'
      ? 'Open invite'
      : m.mode === 'team'
        ? `Team with ${oppName}`
        : m.mode === 'faceoff'
          ? `Face-off vs ${oppName}`
          : `vs ${oppName}`
  const guesses = m.boards.reduce((s, b) => s + b.guesses.length, 0)
  const solved = m.boards.filter((b) => b.solvedBy).length
  const fo = m.mode === 'faceoff' ? faceoffBoards(m, me) : null
  const progress = fo
    ? `${fo.mine?.guesses.length ?? 0} vs ${fo.theirs?.guesses.length ?? 0} guesses`
    : m.boardCount > 1
      ? `${solved}/${m.boardCount} solved`
      : guesses
        ? `${guesses} guess${guesses === 1 ? '' : 'es'}`
        : 'No guesses yet'

  let pill = { text: '', cls: '' }
  if (m.status === 'waiting') pill = { text: 'Waiting', cls: '' }
  else if (m.status === 'active') {
    if (m.mode === 'team') pill = { text: 'Play', cls: 'go' }
    else if (fo?.theirs && !fo.theirs.a) pill = { text: 'Pick a word', cls: 'go' }
    else pill = needsMe(m, me) ? { text: 'Your turn', cls: 'go' } : { text: 'Waiting', cls: '' }
  } else if (m.result === 'draw') pill = { text: 'Draw', cls: '' }
  else {
    const won = m.mode === 'team' ? m.result === 'won' : m.winner === me
    pill = { text: won ? 'Won' : 'Lost', cls: won ? 'win' : 'loss' }
  }

  return (
    <button className="card" onClick={() => go(`/m/${m.id}`)}>
      <div className="grow">
        <div className="line1">
          {title}
          {hasUnreadChat(m, me) && (
            <span className="unread-dot" title="Unread chat">
              💬
            </span>
          )}
        </div>
        <div className="line2">
          {describe(m)} · {progress} · {ago(m.updatedAt)}
        </div>
      </div>
      <span className={`pill ${pill.cls}`}>{pill.text}</span>
    </button>
  )
}

function records(matches: Match[], me: string) {
  const by: Record<string, { name: string; dw: number; dl: number; tw: number; tl: number; fw: number; fl: number; fd: number }> = {}
  for (const m of matches) {
    if (m.status !== 'finished') continue
    const opp = otherPlayer(m, me)
    if (!opp) continue
    const r = (by[opp] ??= { name: m.profiles[opp]?.name || 'Opponent', dw: 0, dl: 0, tw: 0, tl: 0, fw: 0, fl: 0, fd: 0 })
    if (m.mode === 'duel') m.winner === me ? r.dw++ : r.dl++
    else if (m.mode === 'faceoff') m.result === 'draw' ? r.fd++ : m.winner === me ? r.fw++ : r.fl++
    else m.result === 'won' ? r.tw++ : r.tl++
  }
  return Object.entries(by)
}

export function Lobby({ user, matches, theme }: { user: User; matches: Match[] | null; theme: { dark: boolean; toggle: () => void } }) {
  const [menu, setMenu] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const me = user.uid
  const list = matches ?? []
  const yourTurn = list.filter((m) => needsMe(m, me))
  const theirTurn = list.filter((m) => m.status === 'active' && !needsMe(m, me))
  const waiting = list.filter((m) => m.status === 'waiting')
  const finished = list.filter((m) => m.status === 'finished')
  const recs = records(list, me)

  const section = (title: string, items: Match[], limit?: number) =>
    items.length > 0 && (
      <div className="section">
        <h2>{title}</h2>
        <div className="list">
          {items.slice(0, limit).map((m) => (
            <MatchCard key={m.id} m={m} me={me} />
          ))}
        </div>
      </div>
    )

  return (
    <div className="screen" onClick={() => menu && setMenu(false)}>
      <Header
        left={<HelpButton />}
        right={
          <>
            <ThemeButton {...theme} />
            <button
              className="icon-btn"
              aria-label="Account"
              onClick={(e) => {
                e.stopPropagation()
                setMenu((o) => !o)
              }}
            >
              {user.photoURL ? <img className="avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : '👤'}
            </button>
          </>
        }
      />
      {menu && (
        <div className="menu" onClick={(e) => e.stopPropagation()}>
          <div className="who">Signed in as {user.email}</div>
          <button onClick={() => logOut()}>Sign out</button>
        </div>
      )}
      <div className="page">
        <div className="page-inner">
          <button className="btn block" onClick={() => go('/new')}>
            New match
          </button>

          {matches === null && <div className="empty">Loading your matches…</div>}
          {matches && list.length === 0 && (
            <div className="empty">
              No matches yet. Start one and send the invite link to a friend. After your first match together, you can start new
              ones with them directly.
            </div>
          )}

          {section('Your turn', yourTurn)}
          {section('Waiting on them', theirTurn)}
          {section('Waiting for a friend to join', waiting)}

          {recs.length > 0 && (
            <div className="section">
              <h2>Record</h2>
              <div className="records">
                {recs.map(([uid, r]) => (
                  <div className="record" key={uid}>
                    <div className="who">vs {r.name}</div>
                    <div className="stat">
                      Duels <b>{r.dw}–{r.dl}</b>
                    </div>
                    <div className="stat">
                      Face-offs <b>{r.fw}–{r.fl}</b>
                      {r.fd > 0 && ` (${r.fd} drawn)`}
                    </div>
                    <div className="stat">
                      Team <b>{r.tw}–{r.tl}</b>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {section('Finished', finished, showAll ? undefined : 10)}
          {finished.length > 10 && (
            <button className="link-btn" onClick={() => setShowAll((s) => !s)}>
              {showAll ? 'Show fewer' : `Show all ${finished.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
