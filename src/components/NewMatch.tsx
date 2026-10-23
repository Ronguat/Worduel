import type { User } from 'firebase/auth'
import { useMemo, useState } from 'react'
import { createMatch } from '../game/actions'
import { otherPlayer, teamMaxGuesses } from '../game/logic'
import { go, useStoredState } from '../hooks'
import { useNameOf } from '../profiles'
import type { Match, Mode, Profile, WordLength } from '../types'
import { BackButton, Header, HelpButton } from './Chrome'

const MAX_BOARDS = 8

interface Settings {
  mode: Mode
  length: WordLength
  boardCount: number
  hardMode: boolean
}

export function NewMatch({ user, me, history }: { user: User; me: Profile; history: Match[] }) {
  const stored = useMemo(() => Object.assign({}, ...history.map((m) => m.profiles)), [history])
  const nameOf = useNameOf(stored)
  const [settings, setSettings] = useStoredState<Settings>('newMatchSettings', { mode: 'duel', length: 5, boardCount: 1, hardMode: true })
  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }))

  // People you've already played with, most recent first.
  const opponents = useMemo(() => {
    const seen = new Map<string, Profile>()
    for (const m of history) {
      const opp = otherPlayer(m, user.uid)
      if (opp && !seen.has(opp)) seen.set(opp, m.profiles[opp])
    }
    return [...seen.entries()]
  }, [history, user.uid])
  const [opponent, setOpponent] = useState<string | null>(opponents[0]?.[0] ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const opp = opponents.find(([uid]) => uid === opponent)
      const id = await createMatch(user, me, settings, opp ? { uid: opp[0], profile: { ...opp[1], name: nameOf(opp[0]) } } : null, history)
      go(`/m/${id}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const { mode, length, boardCount, hardMode } = settings
  return (
    <div className="screen">
      <Header left={<BackButton />} right={<HelpButton />} />
      <div className="page">
        <div className="page-inner">
          <div className="field">
            <label>Play with</label>
            <div className="segmented">
              {opponents.map(([uid, p]) => (
                <button key={uid} aria-pressed={opponent === uid} onClick={() => setOpponent(uid)}>
                  {nameOf(uid) || p?.name}
                </button>
              ))}
              <button aria-pressed={opponent === null} onClick={() => setOpponent(null)}>
                Someone new (invite link)
              </button>
            </div>
          </div>

          <div className="field">
            <label>Mode</label>
            <div className="segmented">
              <button aria-pressed={mode === 'duel'} onClick={() => set({ mode: 'duel' })}>
                Duel
              </button>
              <button aria-pressed={mode === 'team'} onClick={() => set({ mode: 'team' })}>
                Team
              </button>
              <button aria-pressed={mode === 'faceoff'} onClick={() => set({ mode: 'faceoff' })}>
                Face-off
              </button>
            </div>
            <div className="hint">
              {mode === 'duel'
                ? 'Take turns guessing on shared boards. No guess limit; whoever gets the word wins it.'
                : mode === 'team'
                  ? `Work together; either of you can guess any time. ${teamMaxGuesses(length)} guesses per board.`
                  : "Each of you picks a word for the other, then guess at your own pace. Fewer guesses wins; a tie is a draw."}
            </div>
          </div>

          <div className="field">
            <label>Word length</label>
            <div className="segmented">
              {([5, 6] as const).map((n) => (
                <button key={n} aria-pressed={length === n} onClick={() => set({ length: n })}>
                  {n} letters
                </button>
              ))}
            </div>
          </div>

          {mode !== 'faceoff' && (
          <div className="field">
            <label>Boards</label>
            <div className="stepper">
              <button onClick={() => set({ boardCount: Math.max(1, boardCount - 1) })} aria-label="Fewer boards">
                −
              </button>
              <span>{boardCount}</span>
              <button onClick={() => set({ boardCount: Math.min(MAX_BOARDS, boardCount + 1) })} aria-label="More boards">
                +
              </button>
            </div>
            <div className="hint">
              {boardCount === 1
                ? 'One puzzle.'
                : mode === 'duel'
                  ? `${boardCount} separate puzzles, each taking turns on its own. Most boards won takes the match.`
                  : `${boardCount} separate puzzles. Solve them all to win.`}
            </div>
          </div>
          )}

          <div className="field">
            <div className="switch">
              <label htmlFor="hard">Hard mode</label>
              <input id="hard" type="checkbox" checked={hardMode} onChange={(e) => set({ hardMode: e.target.checked })} />
            </div>
            <div className="hint">Revealed hints must be used in later guesses, whoever revealed them.</div>
          </div>

          {error && <div className="empty">{error}</div>}
          <button className="btn block" disabled={busy} onClick={create}>
            {opponent ? 'Start match' : 'Create invite'}
          </button>
        </div>
      </div>
    </div>
  )
}
