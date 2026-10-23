import { DUEL_VISIBLE_ROWS, decodeAnswer, guessedThisTurn, isOpen, score } from '../game/logic'
import type { Match, Mark } from '../types'

const MIN_OPEN_ENDED_ROWS = 6

type RowSpec =
  | { kind: 'revealed'; word: string; marks: Mark[]; by: 'me' | 'them'; flip: boolean }
  | { kind: 'input'; letters: string }
  | { kind: 'empty' }

/** Number of rows the board will draw; used for sizing. */
export function boardRowCount(match: Match, index: number, expanded: boolean) {
  return rowSpecs(match, index, '', '', 0, expanded).rows.length
}

function rowSpecs(match: Match, index: number, me: string, draft: string, seen: number, expanded: boolean) {
  const board = match.boards[index]
  const answer = board.a ? decodeAnswer(board.a) : ''
  const all = board.guesses
  const hidden = match.mode !== 'team' && !expanded ? Math.max(0, all.length - DUEL_VISIBLE_ROWS) : 0
  const rows: RowSpec[] = all.slice(hidden).map((g, i) => ({
    kind: 'revealed',
    word: g.w,
    marks: score(g.w, answer),
    by: g.by === me ? 'me' : 'them',
    flip: hidden + i >= seen,
  }))
  if (isOpen(board) && match.status === 'active' && (match.mode !== 'faceoff' || board.a)) {
    rows.push({ kind: 'input', letters: draft })
  }
  const target = match.mode === 'team' ? (match.maxGuesses ?? 6) : MIN_OPEN_ENDED_ROWS
  while (rows.length < target) rows.push({ kind: 'empty' })
  return { rows, hidden, answer }
}

interface Props {
  match: Match
  index: number
  me: string
  draft: string
  seen: number
  selected: boolean
  canType: boolean
  expanded: boolean
  shaking: boolean
  nameOf: (uid: string) => string
  onSelect: () => void
  onToggleExpand: () => void
}

export function Board({ match, index, me, draft, seen, selected, canType, expanded, shaking, nameOf, onSelect, onToggleExpand }: Props) {
  const board = match.boards[index]
  const multi = match.boards.length > 1
  const faceoff = match.mode === 'faceoff'
  const { rows, hidden, answer } = rowSpecs(match, index, me, canType ? draft : '', seen, expanded)
  const revealing = board.guesses.length > seen
  const len = match.length
  const active = match.status === 'active'
  const showAnswer = match.status === 'finished' && !board.solvedBy && !revealing && !!answer && (!faceoff || board.guesser === me)
  const n = board.guesses.length
  const guessCount = `${n} guess${n === 1 ? '' : 'es'}`

  let label: string = String(index + 1)
  let status = ''
  if (faceoff) {
    const mine = board.guesser === me
    label = mine ? 'You' : nameOf(board.guesser ?? '')
    if (!board.a) status = mine ? 'Waiting for their word' : 'Pick their word'
    else if (board.solvedBy && !revealing) status = `✓ in ${n}`
    else if (!mine) status = `Your word: ${answer.toUpperCase()}`
    else if (n) status = guessCount
  } else if (board.solvedBy && !revealing) {
    status = `✓ ${board.solvedBy === me ? 'You' : nameOf(board.solvedBy)}`
  } else if (board.failed && !revealing) {
    status = '✗ Out of guesses'
  } else if (match.mode === 'duel' && active && match.turn === me && guessedThisTurn(match, board)) {
    status = 'Guessed this turn'
  } else if (match.mode === 'team' && match.maxGuesses) {
    status = `${match.maxGuesses - n} left`
  } else if (n > 0) {
    status = guessCount
  }

  const spent = !isOpen(board) || (match.mode === 'duel' && match.turn === me && guessedThisTurn(match, board))
  const classes = ['board', selected && multi && canType ? 'selected' : '', active && spent ? 'done' : ''].join(' ')
  return (
    <div className={classes} onClick={onSelect}>
      {multi && (
        <div className="board-head">
          <b>{label}</b>
          <span>{status}</span>
        </div>
      )}
      {match.mode !== 'team' && board.guesses.length > DUEL_VISIBLE_ROWS && (
        <button
          className="earlier"
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand()
          }}
        >
          {expanded ? 'Show recent only' : `+${hidden} earlier`}
        </button>
      )}
      <div className={`rows ${canType ? '' : 'inactive'}`}>
        {rows.map((row, r) => {
          if (row.kind === 'revealed') {
            return (
              <div className="row-wrap" data-by={row.by} key={r}>
                <div className="row">
                  {row.word.split('').map((c, i) => (
                    <div
                      key={i}
                      className={`tile ${row.flip ? 'flip' : ''}`}
                      data-state="revealed"
                      data-mark={row.marks[i]}
                      style={row.flip ? { animationDelay: `${i * 220}ms` } : undefined}
                    >
                      {c}
                    </div>
                  ))}
                </div>
              </div>
            )
          }
          const letters = row.kind === 'input' ? row.letters : ''
          return (
            <div className="row-wrap" key={r}>
              <div className={`row ${row.kind === 'input' && shaking ? 'shake' : ''}`}>
                {Array.from({ length: len }, (_, i) => (
                  <div key={i} className="tile" data-state={letters[i] ? 'tbd' : 'empty'}>
                    {letters[i] ?? ''}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {showAnswer && <div className="answer">{answer}</div>}
    </div>
  )
}
