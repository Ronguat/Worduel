import type { User } from 'firebase/auth'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createMatch, deleteMatch, joinMatch, pickFaceoffWord, resignMatch, revealWord, submitGuesses } from '../game/actions'
import {
  canGuessOn,
  decodeAnswer,
  faceoffBoards,
  hardModeViolation,
  isPlayingOn,
  isOpen,
  keyboardStatus,
  needsMe,
  otherPlayer,
  progress,
} from '../game/logic'
import { loadValidWords } from '../game/words'
import { chatReadAt, useMessages } from '../game/chat'
import { go, useMatch, useMediaQuery, useStoredState, useToast } from '../hooks'
import { useNameOf } from '../profiles'
import type { Match, Profile } from '../types'
import { Board, boardRowCount } from './Board'
import { Chat } from './Chat'
import { BackButton, Header, HelpButton, ThemeButton } from './Chrome'
import { MODE_NAMES, describe } from './Lobby'
import { Keyboard } from './Keyboard'

interface Props {
  id: string
  user: User
  me: Profile
  history: Match[]
  theme: { dark: boolean; toggle: () => void }
}

export function MatchView({ id, user, me: myProfile, history, theme }: Props) {
  const live = useMatch(id)
  // The copy of the match our own last action wrote. Shown until the live update catches up, so a
  // move never seems to vanish if the live connection stalls (common on phones after backgrounding).
  const [saved, setSaved] = useState<Match | null>(null)
  const savedIsNewer = !!saved && saved.id === id && (!live || progress(saved) > progress(live))
  useEffect(() => {
    if (saved && !savedIsNewer) setSaved(null)
  }, [saved, savedIsNewer])
  const match = savedIsNewer ? saved : live
  if (!match) {
    return (
      <div className="screen">
        <Header left={<BackButton />} right={<ThemeButton {...theme} />} />
        <div className="center">
          {match === undefined ? <p>Loading…</p> : <p>This match doesn't exist, or it was deleted.</p>}
        </div>
      </div>
    )
  }
  return <Game key={id} match={match} user={user} myProfile={myProfile} history={history} theme={theme} onSaved={setSaved} />
}

const GAP = 5
const ROW_PAD = 8
const BOARD_PAD = 12
const BOARD_GAP = 10

function layout(w: number, h: number, n: number, len: number, rows: number, extraH: number) {
  let best = { tile: 0, cols: 1 }
  for (let cols = 1; cols <= n; cols++) {
    const lines = Math.ceil(n / cols)
    const boardW = (w - (cols - 1) * BOARD_GAP) / cols
    const boardH = (h - (lines - 1) * BOARD_GAP) / lines
    const tW = (boardW - BOARD_PAD - ROW_PAD - (len - 1) * GAP) / len
    const tH = (boardH - BOARD_PAD - extraH - (rows - 1) * GAP) / rows
    const t = Math.min(tW, tH)
    if (t > best.tile + 0.5) best = { tile: t, cols }
  }
  return { tile: Math.max(16, Math.min(62, Math.floor(best.tile))), cols: best.cols }
}

interface Drafts {
  drafts: string[]
  /** face-off: the word being typed for the opponent */
  pick?: string
}

function Game({
  match,
  user,
  myProfile,
  history,
  theme,
  onSaved,
}: {
  match: Match
  user: User
  myProfile: Profile
  history: Match[]
  theme: Props['theme']
  onSaved: (m: Match) => void
}) {
  const me = user.uid
  const isPlayer = match.players.includes(me)
  const opp = otherPlayer(match, me)
  const nameOf = useNameOf(match.profiles)
  const nBoards = match.boards.length
  const multi = nBoards > 1
  const active = match.status === 'active'
  const faceoff = match.mode === 'faceoff'
  const fo = faceoff ? faceoffBoards(match, me) : null
  const mustPick = active && isPlayer && !!fo?.theirs && !fo.theirs.a
  const myTurn = needsMe(match, me)
  const typeable = match.boards.map((_, i) => canGuessOn(match, me, i))
  const typeableKey = typeable.join(',')
  // face-off: the result is settled but you're still allowed to finish your word
  const myPlayOn = isPlayer && !!fo?.mine && isPlayingOn(match, fo.mine)
  // In face-off your own board comes first.
  const boardOrder = match.boards.map((_, i) => i)
  if (fo?.mine && match.boards.indexOf(fo.mine) === 1) boardOrder.reverse()
  const counts = match.boards.map((b) => b.guesses.length)

  const [{ drafts, pick = '' }, setDraftState] = useStoredState<Drafts>(`draft:${match.id}`, { drafts: [] })
  const [storedSeen, setSeen] = useStoredState<number[] | null>(`seen:${match.id}`, null)
  const seen = storedSeen ?? counts
  const [selected, setSelected] = useState(() => Math.max(0, typeable.indexOf(true)))
  const [expanded, setExpanded] = useState<boolean[]>([])
  const [shake, setShake] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, showToast] = useToast()

  const chatEnabled = isPlayer && !!opp
  const wide = useMediaQuery('(min-width: 900px)')
  const [chatOpen, setChatOpen] = useState(false)
  const messages = useMessages(match.id, chatEnabled)
  const lastMsg = messages[messages.length - 1]
  const unread = !wide && !chatOpen && !!lastMsg && lastMsg.by !== me && lastMsg.at > chatReadAt(match.id)

  // Remember what has been revealed so new guesses (including ones made while you were away) flip in.
  const countsKey = counts.join(',')
  useEffect(() => {
    if (!storedSeen) {
      setSeen(counts)
      return
    }
    if (counts.every((c, i) => c <= (storedSeen[i] ?? 0))) return
    const t = window.setTimeout(() => setSeen(counts), match.length * 220 + 600)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countsKey, storedSeen])
  const revealing = counts.some((c, i) => c > (seen[i] ?? 0))

  // Keep the selection on a board you can guess on, moving forward to the next one after a guess.
  useEffect(() => {
    if (typeable[selected]) return
    for (let k = 1; k <= nBoards; k++) {
      const j = (selected + k) % nBoards
      if (typeable[j]) return setSelected(j)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeableKey, selected, nBoards])

  const setBoardDraft = (b: number, draft: string) =>
    setDraftState((s) => {
      const d = [...s.drafts]
      d[b] = draft
      return { ...s, drafts: d }
    })
  const setPick = (word: string) => setDraftState((s) => ({ ...s, pick: word }))

  const fail = (b: number, msg: string) => {
    showToast(msg)
    setShake(b)
    window.setTimeout(() => setShake(null), 500)
  }

  /** Runs a server action, reporting failures as a toast. Resolves true on success. */
  const run = async (action: () => Promise<Match | null | void>) => {
    setBusy(true)
    try {
      const written = await action()
      if (written) onSaved(written)
      return true
    } catch (e) {
      showToast((e as Error).message || 'Something went wrong', 3000)
      return false
    } finally {
      setBusy(false)
    }
  }

  const commit = async (b: number, word: string) => {
    const board = match.boards[b]
    if (word.length < match.length) return fail(b, 'Not enough letters')
    const words = await loadValidWords(match.length)
    if (!words.has(word)) return fail(b, 'Not in word list')
    if (match.hardMode) {
      const v = hardModeViolation(word, decodeAnswer(board.a), board.guesses.map((g) => g.w))
      if (v) return fail(b, v)
    }
    if (await run(() => submitGuesses(me, match.id, match.length, [{ board: b, word }]))) setBoardDraft(b, '')
  }

  const commitPick = async (word: string) => {
    if (word.length < match.length) return fail(-1, 'Not enough letters')
    const words = await loadValidWords(match.length)
    if (!words.has(word)) return fail(-1, 'Not in word list')
    if (await run(() => pickFaceoffWord(me, match.id, match.length, word))) setPick('')
  }

  const onKey = (key: string) => {
    if (!isPlayer || busy) return
    if (!active && !typeable.some(Boolean)) return
    if (mustPick) {
      if (key === 'Backspace') setPick(pick.slice(0, -1))
      else if (key === 'Enter') void commitPick(pick)
      else if (/^[a-z]$/.test(key) && pick.length < match.length) setPick(pick + key)
      return
    }
    const b = selected
    if (!typeable[b]) {
      if (match.mode === 'duel' && isOpen(match.boards[b])) {
        return showToast(multi ? `It's ${nameOf(opp)}'s move on this board` : `It's ${nameOf(opp)}'s turn`)
      }
      if (fo?.mine && !fo.mine.a) showToast(`Waiting for ${nameOf(opp)} to pick your word`)
      else if (fo?.mine?.solvedBy) showToast(`Waiting for ${nameOf(opp)} to finish`)
      else if (match.mode === 'duel' && isOpen(match.boards[b])) showToast('You already guessed on this board this turn')
      return
    }
    const draft = drafts[b] ?? ''
    if (key === 'Backspace') setBoardDraft(b, draft.slice(0, -1))
    else if (key === 'Enter') void commit(b, draft)
    else if (/^[a-z]$/.test(key) && draft.length < match.length) setBoardDraft(b, draft + key)
  }

  const onKeyRef = useRef(onKey)
  onKeyRef.current = onKey
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return
      if (e.key === 'Enter' || e.key === 'Backspace') {
        e.preventDefault()
        onKeyRef.current(e.key)
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        onKeyRef.current(e.key.toLowerCase())
      } else if (multi && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const dir = e.key === 'ArrowRight' ? 1 : -1
        setSelected((s) => (s + dir + nBoards) % nBoards)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [multi, nBoards])

  // Size tiles to fit the space between the banner and the keyboard.
  const areaRef = useRef<HTMLDivElement>(null)
  const [area, setArea] = useState({ w: 360, h: 420 })
  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setArea({ w: entry.contentRect.width, h: entry.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const rowCount = Math.max(...match.boards.map((_, i) => boardRowCount(match, i, !!expanded[i])))
  const hasEarlier = match.mode !== 'team' && counts.some((c) => c > 8)
  const { tile, cols } = layout(area.w, area.h, Math.max(1, nBoards), match.length, rowCount, (multi ? 18 : 0) + (hasEarlier ? 20 : 0))

  // The keyboard reflects the board you're guessing on. In face-off that's your own, until you've finished
  // (and watched your last guess flip in); then it follows your opponent's board while they're still going.
  const mineIndex = fo?.mine ? match.boards.indexOf(fo.mine) : -1
  const theirIndex = fo?.theirs ? match.boards.indexOf(fo.theirs) : -1
  const followTheirs =
    !!fo?.mine &&
    !!fo.theirs?.a &&
    !isOpen(fo.mine) &&
    counts[mineIndex] <= (seen[mineIndex] ?? 0) &&
    isOpen(fo.theirs) &&
    (active || isPlayingOn(match, fo.theirs))
  const keyIndex = followTheirs ? theirIndex : fo?.mine ? mineIndex : selected
  const keyBoard = match.boards[keyIndex]
  const marks = useMemo(
    () =>
      mustPick || !keyBoard?.a
        ? {}
        : keyboardStatus(decodeAnswer(keyBoard.a), keyBoard.guesses.slice(0, seen[keyIndex] ?? 0).map((g) => g.w)),
    [mustPick, keyBoard, seen, keyIndex],
  )

  const rematch = async () => {
    if (!opp) return
    setBusy(true)
    try {
      const id = await createMatch(
        user,
        myProfile,
        { mode: match.mode, length: match.length, boardCount: 1, hardMode: match.hardMode },
        { uid: opp, profile: match.profiles[opp] },
        history,
      )
      go(`/m/${id}`)
    } catch (e) {
      showToast((e as Error).message, 3000)
    } finally {
      setBusy(false)
    }
  }

  const shareLink = async () => {
    const url = location.href
    const text = `Play Worduel with me (${match.mode}, ${match.length} letters)`
    try {
      if (navigator.share) await navigator.share({ title: 'Worduel', text, url })
      else {
        await navigator.clipboard.writeText(url)
        showToast('Link copied')
      }
    } catch {
      /* share cancelled */
    }
  }

  const join = async () => {
    setBusy(true)
    try {
      const written = await joinMatch(user, myProfile, match.id, history)
      if (written) onSaved(written)
    } catch (e) {
      showToast((e as Error).message, 3000)
    } finally {
      setBusy(false)
    }
  }

  const doResign = async () => {
    setMenuOpen(false)
    const q = match.mode === 'team' ? 'Give up? This counts as a team loss.' : `Resign? ${nameOf(opp)} will win this match.`
    if (!confirm(q)) return
    try {
      onSaved(await resignMatch(me, match.id))
    } catch (e) {
      showToast((e as Error).message, 3000)
    }
  }

  const doDelete = async () => {
    setMenuOpen(false)
    if (!confirm('Delete this invite?')) return
    await deleteMatch(match.id)
    go('/')
  }

  // --- banner ---
  const solvedBy = (uid: string) => match.boards.filter((b) => b.solvedBy === uid).length
  const solvedCount = match.boards.filter((b) => b.solvedBy).length
  let banner: React.ReactNode
  let bannerClass = 'banner'
  if (match.status === 'waiting') {
    banner = isPlayer ? 'Waiting for your friend to join' : `${nameOf(match.createdBy)} invited you`
  } else if (match.status === 'finished' && !revealing) {
    let sub = ''
    if (myPlayOn) sub = "You can keep guessing to finish the word, or reveal it."
    else if (fo?.theirs && isPlayingOn(match, fo.theirs)) sub = `${nameOf(opp)} can still keep guessing your word`
    banner = (
      <>
        {resultText(match, me, nameOf)}
        {faceoff && match.endReason !== 'resigned' && <span className="sub">{faceoffScore(match, me, nameOf)}</span>}
        {sub && <span className="sub">{sub}</span>}
      </>
    )
  } else if (match.mode === 'duel') {
    const score = multi && opp ? `You ${solvedBy(me)} · ${nameOf(opp)} ${solvedBy(opp)}` : null
    const myBoards = typeable.filter(Boolean).length
    if (!isPlayer) banner = 'Duel in progress'
    else if (myTurn) {
      bannerClass += ' your-turn'
      banner = (
        <>
          Your turn
          <span className="sub">
            {multi ? `Your move on ${myBoards} of ${match.boards.filter(isOpen).length} boards · ${score}` : score}
          </span>
        </>
      )
    } else {
      banner = (
        <>
          {nameOf(opp)}'s turn
          {score && <span className="sub">{score}</span>}
        </>
      )
    }
  } else if (faceoff && fo?.mine && fo.theirs) {
    const { mine, theirs } = fo
    const them = nameOf(opp)
    let sub = ''
    if (mustPick) {
      banner = `Pick a word for ${them}`
      sub = mine.a ? `${them} already picked yours` : 'Any real word. Fewest guesses wins.'
    } else if (!mine.a) {
      banner = `Waiting for ${them} to pick your word`
    } else if (mine.solvedBy) {
      banner = `Solved in ${mine.guesses.length}!`
      sub = `${them} has used ${theirs.guesses.length} guess${theirs.guesses.length === 1 ? '' : 'es'} so far`
    } else {
      banner = `Guess ${them}'s word`
      sub = theirs.solvedBy
        ? `${them} solved yours in ${theirs.guesses.length}. Beat that!`
        : `${them} has used ${theirs.guesses.length} guess${theirs.guesses.length === 1 ? '' : 'es'}`
    }
    if (myTurn) bannerClass += ' your-turn'
    banner = (
      <>
        {banner}
        {sub && <span className="sub">{sub}</span>}
      </>
    )
  } else {
    banner = (
      <>
        Team play
        <span className="sub">{multi ? `${solvedCount} of ${match.boardCount} solved · guess any time` : 'Either of you can guess any time'}</span>
      </>
    )
  }

  const menuItems: [string, () => void][] = []
  if (isPlayer && active) menuItems.push([match.mode === 'duel' ? 'Resign' : 'Give up', doResign])
  if (match.status === 'waiting' && match.createdBy === me) menuItems.push(['Delete invite', doDelete])

  return (
    <div className="match-layout">
    <div className="screen" onClick={() => menuOpen && setMenuOpen(false)}>
      <Header
        left={
          <>
            <BackButton />
            <HelpButton />
          </>
        }
        right={
          <>
            <ThemeButton {...theme} />
            {chatEnabled && !wide && (
              <button className="icon-btn badge-wrap" onClick={() => setChatOpen(true)} aria-label="Open chat">
                💬
                {unread && <span className="badge" />}
              </button>
            )}
            {menuItems.length > 0 && (
              <button
                className="icon-btn"
                aria-label="Match options"
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuOpen((o) => !o)
                }}
              >
                ⋯
              </button>
            )}
          </>
        }
      />
      {menuOpen && (
        <div className="menu" onClick={(e) => e.stopPropagation()}>
          {menuItems.map(([label, fn]) => (
            <button key={label} onClick={fn}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className={bannerClass}>{banner}</div>
      <div className="match-meta">
        {MODE_NAMES[match.mode]} · {match.length} letters · {match.hardMode ? <b>Hard mode</b> : 'Hard mode off'}
      </div>

      <div className="boards-area" ref={areaRef}>
        <div
          className={`boards ${multi ? 'multi' : ''}`}
          style={{ '--tile': `${tile}px`, gridTemplateColumns: `repeat(${cols}, auto)` } as React.CSSProperties}
        >
          {boardOrder.map((i) => (
            <Board
              key={i}
              match={match}
              index={i}
              me={me}
              draft={drafts[i] ?? ''}
              seen={seen[i] ?? 0}
              selected={i === selected}
              canType={typeable[i] && !mustPick}
              expanded={!!expanded[i]}
              shaking={shake === i}
              nameOf={(uid) => nameOf(uid)}
              onSelect={() => setSelected(i)}
              onToggleExpand={() =>
                setExpanded((e) => {
                  const n = [...e]
                  n[i] = !n[i]
                  return n
                })
              }
            />
          ))}
        </div>
      </div>

      {match.status === 'waiting' &&
        (isPlayer ? (
          <div className="panel">
            <div>Send this link to your friend. Once they open it and join, the match starts.</div>
            <div className="actions">
              <button className="btn" onClick={shareLink}>
                Share invite link
              </button>
            </div>
          </div>
        ) : (
          <div className="panel">
            <div>{describe(match)}</div>
            <button className="btn" disabled={busy} onClick={join}>
              Join match
            </button>
          </div>
        ))}

      {(active || myPlayOn || followTheirs) && isPlayer && (
        <>
          {mustPick && (
            <div className="pick">
              <div className={`row ${shake === -1 ? 'shake' : ''}`} style={{ '--tile': '44px' } as React.CSSProperties}>
                {Array.from({ length: match.length }, (_, i) => (
                  <div key={i} className="tile" data-state={pick[i] ? 'tbd' : 'empty'}>
                    {pick[i] ?? ''}
                  </div>
                ))}
              </div>
              <div className="hint">Type their word and press Enter. They won't see it until the end.</div>
            </div>
          )}
          {followTheirs && <div className="kb-caption">Keyboard shows {nameOf(opp)}'s guesses</div>}
          <Keyboard marks={marks} disabled={!mustPick && !followTheirs && !typeable.some(Boolean)} onKey={onKey} />
        </>
      )}

      {match.status === 'finished' && !revealing && (
        <div className="panel">
          <div className="actions">
            {myPlayOn && (
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => confirm('Reveal your word? You won’t be able to keep guessing.') && run(() => revealWord(me, match.id))}
              >
                Reveal word
              </button>
            )}
            {isPlayer && opp && (
              <button className="btn" disabled={busy} onClick={rematch}>
                Rematch
              </button>
            )}
            {!myPlayOn && (
              <button className="btn secondary" onClick={() => go('/')}>
                All matches
              </button>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" key={toast.key}>
          {toast.text}
        </div>
      )}
    </div>
    {chatEnabled && (wide || chatOpen) && (
      <Chat
        matchId={match.id}
        me={me}
        opponentName={nameOf(opp)}
        messages={messages}
        onClose={wide ? undefined : () => setChatOpen(false)}
      />
    )}
    </div>
  )
}

/** Face-off guess counts, e.g. "You 2 · Bob 4" ("—" for a word that wasn't solved). */
export function faceoffScore(match: Match, me: string, nameOf: (uid: string | null) => string) {
  const { mine, theirs } = faceoffBoards(match, me)
  const tally = (b: typeof mine) => (b?.solvedBy ? String(b.guesses.length) : '—')
  return `You ${tally(mine)} · ${nameOf(otherPlayer(match, me))} ${tally(theirs)}`
}

export function resultText(match: Match, me: string, nameOf: (uid: string | null) => string) {
  if (match.mode === 'team') {
    if (match.result === 'won') return 'Solved! Nice teamwork 🎉'
    return match.endReason === 'resigned' ? 'You gave up' : 'Out of guesses'
  }
  const opp = otherPlayer(match, me)
  if (match.mode === 'faceoff' && match.endReason !== 'resigned') {
    if (match.result === 'draw') return 'Draw!'
    return match.winner === me ? 'You win! 🎉' : `${nameOf(match.winner)} wins`
  }
  if (match.endReason === 'resigned') {
    return match.winner === me ? `${nameOf(opp)} resigned. You win!` : 'You resigned'
  }
  const mine = match.boards.filter((b) => b.solvedBy === me).length
  const theirs = match.boards.filter((b) => b.solvedBy && b.solvedBy !== me).length
  const tally = match.boardCount > 1 ? ` ${Math.max(mine, theirs)}–${Math.min(mine, theirs)}` : ''
  return match.winner === me ? `You win${tally}! 🎉` : `${nameOf(match.winner)} wins${tally}`
}
