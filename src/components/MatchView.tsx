import type { User } from 'firebase/auth'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createMatch, deleteMatch, joinMatch, resignMatch, submitGuesses } from '../game/actions'
import { decodeAnswer, hardModeViolation, isOpen, keyboardStatus, otherPlayer } from '../game/logic'
import { loadValidWords } from '../game/words'
import { go, useMatch, useStoredState, useToast } from '../hooks'
import type { GuessEntry, Match } from '../types'
import { Board, boardRowCount } from './Board'
import { BackButton, Header, HelpButton, ThemeButton } from './Chrome'
import { Keyboard } from './Keyboard'

interface Props {
  id: string
  user: User
  history: Match[]
  theme: { dark: boolean; toggle: () => void }
}

export function MatchView({ id, user, history, theme }: Props) {
  const match = useMatch(id)
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
  return <Game key={id} match={match} user={user} history={history} theme={theme} />
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
  staged: (string | null)[]
}

function Game({ match, user, history, theme }: { match: Match; user: User; history: Match[]; theme: Props['theme'] }) {
  const me = user.uid
  const isPlayer = match.players.includes(me)
  const opp = otherPlayer(match, me)
  const nameOf = useCallback((uid: string | null) => (uid && match.profiles[uid]?.name) || 'Opponent', [match.profiles])
  const multi = match.boardCount > 1
  const stageMode = match.mode === 'duel' && multi
  const active = match.status === 'active'
  const myTurn = active && isPlayer && (match.mode === 'team' || match.turn === me)
  const counts = match.boards.map((b) => b.guesses.length)

  const [{ drafts, staged }, setDraftState] = useStoredState<Drafts>(`draft:${match.id}`, { drafts: [], staged: [] })
  const [storedSeen, setSeen] = useStoredState<number[] | null>(`seen:${match.id}`, null)
  const seen = storedSeen ?? counts
  const [selected, setSelected] = useState(() => Math.max(0, match.boards.findIndex(isOpen)))
  const [expanded, setExpanded] = useState<boolean[]>([])
  const [shake, setShake] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, showToast] = useToast()

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

  // Keep the selection on a board that can still be played.
  useEffect(() => {
    if (!isOpen(match.boards[selected]) && match.boards.some(isOpen)) {
      setSelected(match.boards.findIndex(isOpen))
    }
  }, [match, selected])

  const setBoardDraft = (b: number, draft: string, stage: string | null = null) =>
    setDraftState((s) => {
      const d = [...s.drafts]
      const st = [...s.staged]
      d[b] = draft
      st[b] = stage
      return { drafts: d, staged: st }
    })

  const fail = (b: number, msg: string) => {
    showToast(msg)
    setShake(b)
    window.setTimeout(() => setShake(null), 500)
  }

  const send = async (entries: GuessEntry[]) => {
    setBusy(true)
    try {
      await submitGuesses(me, match.id, match.length, entries)
      setDraftState((s) => {
        const d = [...s.drafts]
        const st = [...s.staged]
        for (const e of entries) {
          d[e.board] = ''
          st[e.board] = null
        }
        return { drafts: d, staged: st }
      })
    } catch (e) {
      showToast((e as Error).message || 'Something went wrong', 3000)
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
    if (stageMode) {
      setBoardDraft(b, '', word)
      for (let k = 1; k < match.boardCount; k++) {
        const j = (b + k) % match.boardCount
        if (isOpen(match.boards[j]) && !staged[j]) {
          setSelected(j)
          break
        }
      }
      return
    }
    await send([{ board: b, word }])
  }

  const queued: GuessEntry[] = staged.flatMap((w, i) => (w && match.boards[i] && isOpen(match.boards[i]) ? [{ board: i, word: w }] : []))

  const onKey = (key: string) => {
    if (!active || !isPlayer) return
    if (!myTurn) return showToast(`It's ${nameOf(opp)}'s turn`)
    if (busy) return
    const b = selected
    if (!isOpen(match.boards[b])) return
    const draft = drafts[b] ?? ''
    const stagedWord = staged[b] ?? null
    if (key === 'Backspace') {
      if (stagedWord) setBoardDraft(b, stagedWord)
      else setBoardDraft(b, draft.slice(0, -1))
    } else if (key === 'Enter') {
      if (stagedWord) {
        if (queued.length) void send(queued)
      } else void commit(b, draft)
    } else if (/^[a-z]$/.test(key) && !stagedWord && draft.length < match.length) {
      setBoardDraft(b, draft + key)
    }
  }

  const onKeyRef = useRef(onKey)
  onKeyRef.current = onKey
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'Enter' || e.key === 'Backspace') {
        e.preventDefault()
        onKeyRef.current(e.key)
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        onKeyRef.current(e.key.toLowerCase())
      } else if (multi && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const dir = e.key === 'ArrowRight' ? 1 : -1
        setSelected((s) => (s + dir + match.boardCount) % match.boardCount)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [multi, match.boardCount])

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
  const hasEarlier = match.mode === 'duel' && counts.some((c) => c > 8)
  const { tile, cols } = layout(area.w, area.h, match.boardCount, match.length, rowCount, (multi ? 18 : 0) + (hasEarlier ? 20 : 0))

  const selBoard = match.boards[selected]
  const marks = useMemo(
    () => keyboardStatus(decodeAnswer(selBoard.a), selBoard.guesses.slice(0, seen[selected] ?? 0).map((g) => g.w)),
    [selBoard, seen, selected],
  )

  const rematch = async () => {
    if (!opp) return
    setBusy(true)
    try {
      const id = await createMatch(
        user,
        { mode: match.mode, length: match.length, boardCount: match.boardCount, hardMode: match.hardMode },
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
      await joinMatch(user, match.id, history)
    } catch (e) {
      showToast((e as Error).message, 3000)
    } finally {
      setBusy(false)
    }
  }

  const doResign = async () => {
    setMenuOpen(false)
    const q = match.mode === 'duel' ? `Resign? ${nameOf(opp)} will win this match.` : 'Give up? This counts as a team loss.'
    if (!confirm(q)) return
    try {
      await resignMatch(me, match.id)
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
    banner = resultText(match, me, nameOf)
  } else if (match.mode === 'duel') {
    const score = multi && opp ? `You ${solvedBy(me)} · ${nameOf(opp)} ${solvedBy(opp)}` : null
    if (!isPlayer) banner = `${nameOf(match.turn)}'s turn`
    else if (myTurn) {
      bannerClass += ' your-turn'
      banner = (
        <>
          Your turn
          <span className="sub">{stageMode ? 'Pick boards, type a guess on each, then submit' : score}</span>
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

      <div className="boards-area" ref={areaRef}>
        <div
          className={`boards ${multi ? 'multi' : ''}`}
          style={{ '--tile': `${tile}px`, gridTemplateColumns: `repeat(${cols}, auto)` } as React.CSSProperties}
        >
          {match.boards.map((_, i) => (
            <Board
              key={i}
              match={match}
              index={i}
              me={me}
              draft={drafts[i] ?? ''}
              staged={staged[i] ?? null}
              seen={seen[i] ?? 0}
              selected={i === selected}
              canType={myTurn}
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
            <div>
              {match.mode === 'duel' ? 'Duel' : 'Team'} · {match.length} letters · {match.boardCount} board
              {match.boardCount > 1 ? 's' : ''}
              {match.hardMode ? ' · Hard mode' : ''}
            </div>
            <button className="btn" disabled={busy} onClick={join}>
              Join match
            </button>
          </div>
        ))}

      {active && isPlayer && (
        <>
          {stageMode && myTurn && (
            <div className="submit-bar">
              <span>
                {queued.length} of {match.boards.filter(isOpen).length} queued
              </span>
              <button className="btn" disabled={!queued.length || busy} onClick={() => send(queued)}>
                Submit turn
              </button>
            </div>
          )}
          <Keyboard marks={marks} disabled={!myTurn} onKey={onKey} />
        </>
      )}

      {match.status === 'finished' && !revealing && (
        <div className="panel">
          <div className="actions">
            {isPlayer && opp && (
              <button className="btn" disabled={busy} onClick={rematch}>
                Rematch
              </button>
            )}
            <button className="btn secondary" onClick={() => go('/')}>
              All matches
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" key={toast.key}>
          {toast.text}
        </div>
      )}
    </div>
  )
}

export function resultText(match: Match, me: string, nameOf: (uid: string | null) => string) {
  if (match.mode === 'team') {
    if (match.result === 'won') return 'Solved! Nice teamwork 🎉'
    return match.endReason === 'resigned' ? 'You gave up' : 'Out of guesses'
  }
  const opp = otherPlayer(match, me)
  if (match.endReason === 'resigned') {
    return match.winner === me ? `${nameOf(opp)} resigned. You win!` : 'You resigned'
  }
  const mine = match.boards.filter((b) => b.solvedBy === me).length
  const theirs = match.boards.filter((b) => b.solvedBy && b.solvedBy !== me).length
  const tally = match.boardCount > 1 ? ` ${Math.max(mine, theirs)}–${Math.min(mine, theirs)}` : ''
  return match.winner === me ? `You win${tally}! 🎉` : `${nameOf(match.winner)} wins${tally}`
}
