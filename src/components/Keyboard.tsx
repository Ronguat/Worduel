import type { Mark } from '../types'

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']

interface Props {
  marks: Record<string, Mark>
  disabled: boolean
  onKey: (key: string) => void
}

export function Keyboard({ marks, disabled, onKey }: Props) {
  const press = (k: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLButtonElement).blur()
    onKey(k)
  }
  return (
    <div className={`keyboard ${disabled ? 'disabled' : ''}`}>
      {ROWS.map((row, r) => (
        <div className="kb-row" key={r}>
          {r === 1 && <div className="spacer" />}
          {r === 2 && (
            <button className="key wide" onClick={press('Enter')}>
              Enter
            </button>
          )}
          {row.split('').map((c) => (
            <button key={c} className="key" data-mark={marks[c]} onClick={press(c)}>
              {c}
            </button>
          ))}
          {r === 1 && <div className="spacer" />}
          {r === 2 && (
            <button className="key wide" onClick={press('Backspace')} aria-label="Backspace">
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
