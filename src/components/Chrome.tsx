import { useEffect, useState, type ReactNode } from 'react'
import { go, useStoredState } from '../hooks'

export function Header({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="header">
      <div className="side">{left}</div>
      <h1 onClick={() => go('/')}>Worduel</h1>
      <div className="side right">{right}</div>
    </header>
  )
}

export function BackButton() {
  return (
    <button className="icon-btn" onClick={() => go('/')} aria-label="Back to matches">
      ‹
    </button>
  )
}

type Theme = 'system' | 'light' | 'dark'

function systemDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
}

export function useTheme() {
  const [theme, setTheme] = useStoredState<Theme>('theme', 'system')
  const [sysDark, setSysDark] = useState(systemDark)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const on = () => setSysDark(mq.matches)
    mq?.addEventListener('change', on)
    return () => mq?.removeEventListener('change', on)
  }, [])
  const dark = theme === 'dark' || (theme === 'system' && sysDark)
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121213' : '#ffffff')
  }, [dark])
  return { dark, toggle: () => setTheme(dark ? 'light' : 'dark') }
}

export function ThemeButton({ dark, toggle }: { dark: boolean; toggle: () => void }) {
  return (
    <button className="icon-btn" onClick={toggle} aria-label="Toggle dark mode">
      {dark ? '☀' : '☾'}
    </button>
  )
}

export function HelpButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)} aria-label="How to play">
        ?
      </button>
      {open && <Help onClose={() => setOpen(false)} />}
    </>
  )
}

export function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        {children}
      </div>
    </div>
  )
}

function Help({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <h2>How to play</h2>
      <p>
        Guess the hidden word. After each guess the tiles show how close you were: <b>green</b> is the right letter in
        the right spot, <b>yellow</b> is in the word but elsewhere, <b>grey</b> isn't in the word.
      </p>
      <p>
        Rows are tinted by who guessed them: <span className="dot me" />
        you and <span className="dot them" />
        your opponent or teammate. Matches save as you go, so close the app whenever and pick it back up later.
      </p>
      <h3>Duel</h3>
      <ul>
        <li>You take turns guessing on a shared board. There's no guess limit; whoever lands the word wins it.</li>
        <li>Who goes first alternates from match to match.</li>
      </ul>
      <h3>Face-off</h3>
      <ul>
        <li>Each of you picks a word for the other to guess. Any real word counts.</li>
        <li>Guess at your own pace on your own board. You can watch your opponent's progress on your word.</li>
        <li>Fewer guesses wins; the same number is a draw.</li>
        <li>
          Once the result is settled, the loser can keep guessing to finish the word (it won't change the result) or
          reveal it.
        </li>
      </ul>
      <h3>Team</h3>
      <ul>
        <li>You're on the same side. Either of you can guess any time, as often as you like.</li>
        <li>You get 6 guesses (7 for six-letter words).</li>
      </ul>
      <h3>Hard mode</h3>
      <p>Every revealed hint must be used in later guesses, no matter who revealed it.</p>
      <h3>Chat</h3>
      <ul>
        <li>Right-click a message to reply to it (long-press on a phone). Tap a quote to jump to the original.</li>
        <li>
          Formatting: <code>**bold**</code>, <code>*italic*</code>, <code>~~strike~~</code>, <code>`code`</code>, and{' '}
          <code>||spoiler||</code>, which stays hidden until tapped. A preview appears while you type.
        </li>
      </ul>
    </Modal>
  )
}
