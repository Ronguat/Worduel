import { DUEL_VISIBLE_ROWS, decodeAnswer, isOpen, score } from '../game/logic'
import type { Match, Mark } from '../types'

const MIN_DUEL_ROWS = 6

type RowSpec =
  | { kind: 'revealed'; word: string; marks: Mark[]; by: 'me' | 'them'; flip: boolean }
  | { kind: 'input'; letters: string; staged: boolean }
  | { kind: 'empty' }

/** Number of rows the board will draw; used for sizing. */
export function boardRowCount(match: Match, index: number, expanded: boolean) {
  return rowSpecs(match, index, '', '', null, 0, expanded).rows.length
}

function rowSpecs(match: Match, index: number, me: string, draft: string, staged: string | null, seen: number, expanded: boolean) {
  const board = match.boards[index]
  const answer = decodeAnswer(board.a)
  const all = board.guesses
  const hidden = match.mode === 'duel' && !expanded ? Math.max(0, all.length - DUEL_VISIBLE_ROWS) : 0
  const rows: RowSpec[] = all.slice(hidden).map((g, i) => ({
    kind: 'revealed',
    word: g.w,
    marks: score(g.w, answer),
    by: g.by === me ? 'me' : 'them',
    flip: hidden + i >= seen,
  }))
  if (isOpen(board) && match.status === 'active') {
    rows.push({ kind: 'input', letters: staged ?? draft, staged: staged != null })
  }
  const target = match.mode === 'team' ? (match.maxGuesses ?? 6) : MIN_DUEL_ROWS
  while (rows.length < target) rows.push({ kind: 'empty' })
  return { rows, hidden, answer }
}

interface Props {
  match: Match
  index: number
  me: string
  draft: string
  staged: string | null
  seen: number
  selected: boolean
  canType: boolean
  expanded: boolean
  shaking: boolean
  nameOf: (uid: string) => string
  onSelect: () => void
  onToggleExpand: () => void
}

export function Board({ match, index, me, draft, staged, seen, selected, canType, expanded, shaking, nameOf, onSelect, onToggleExpand }: Props) {
  const board = match.boards[index]
  const multi = match.boardCount > 1
  const { rows, hidden, answer } = rowSpecs(match, index, me, draft, staged, seen, expanded)
  const revealing = board.guesses.length > seen
  const len = match.length
  const showAnswer = match.status === 'finished' && !board.solvedBy && !revealing

  let status = ''
  if (board.solvedBy && !revealing) {
    status = `✓ ${board.solvedBy === me ? 'You' : nameOf(board.solvedBy)}`
  } else if (board.failed && !revealing) {
    status = '✗ Out of guesses'
  } else if (staged) {
    status = 'Queued'
  } else if (match.mode === 'team' && match.maxGuesses) {
    status = `${match.maxGuesses - board.guesses.length} left`
  } else if (board.guesses.length > 0) {
    status = `${board.guesses.length} guess${board.guesses.length === 1 ? '' : 'es'}`
  }

  const active = match.status === 'active'
  const classes = ['board', selected && multi && canType ? 'selected' : '', active && !isOpen(board) ? 'done' : ''].join(' ')
  return (
    <div className={classes} onClick={onSelect}>
      {multi && (
        <div className="board-head">
          <b>{index + 1}</b>
          <span>{status}</span>
        </div>
      )}
      {match.mode === 'duel' && board.guesses.length > DUEL_VISIBLE_ROWS && (
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
          const state = row.kind === 'input' && row.staged ? 'staged' : 'tbd'
          return (
            <div className="row-wrap" key={r}>
              <div className={`row ${row.kind === 'input' && shaking ? 'shake' : ''}`}>
                {Array.from({ length: len }, (_, i) => (
                  <div key={i} className="tile" data-state={letters[i] ? state : 'empty'}>
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
