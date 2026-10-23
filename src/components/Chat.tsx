import { useEffect, useRef, useState } from 'react'
import { MAX_CHAT_LENGTH, markChatRead, sendMessage } from '../game/chat'
import { useStoredState } from '../hooks'
import type { ChatMessage } from '../types'

const EMOJI = [
  '😂', '🤣', '😅', '😭', '😤', '😎', '🤔', '🙃', '😏', '😬', '🥲', '😱', '🤯', '🥳', '😈', '💀',
  '👀', '🙄', '😴', '🤓', '🫠', '🤡', '😘', '🤗', '👍', '👎', '👏', '🙌', '🤞', '💪', '🫡', '🤝',
  '🔥', '💯', '🎉', '🏆', '🧠', '🍀', '🎯', '💥', '❤️', '💔', '🐐', '🍿', '⏰', '✅', '🟩', '🟨',
]

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u

function timeLabel(t: number) {
  const d = new Date(t)
  const sameDay = d.toDateString() === new Date().toDateString()
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return sameDay ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`
}

interface Props {
  matchId: string
  me: string
  opponentName: string
  messages: ChatMessage[]
  /** set when the chat is a drawer that can be closed */
  onClose?: () => void
}

export function Chat({ matchId, me, opponentName, messages, onClose }: Props) {
  const [text, setText] = useStoredState(`chatDraft:${matchId}`, '')
  const [picker, setPicker] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const last = messages[messages.length - 1]
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
    if (last) markChatRead(matchId, last.at)
  }, [matchId, last])

  const send = async () => {
    const t = text.trim()
    if (!t) return
    setText('')
    setPicker(false)
    setError(null)
    try {
      await sendMessage(matchId, me, t)
    } catch (e) {
      console.error(e)
      setText(t)
      setError("Couldn't send. Check your connection and try again.")
    }
  }

  const insert = (emoji: string) => {
    const el = inputRef.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const next = (text.slice(0, start) + emoji + text.slice(end)).slice(0, MAX_CHAT_LENGTH)
    setText(next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  return (
    <aside className={`chat ${onClose ? 'drawer' : ''}`} aria-label="Chat">
      <div className="chat-head">
        <span>Chat with {opponentName}</span>
        {onClose && (
          <button className="icon-btn" onClick={onClose} aria-label="Close chat">
            ✕
          </button>
        )}
      </div>
      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && <div className="chat-empty">No messages yet. Talk some trash. 🗑️</div>}
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const showTime = !prev || m.at - prev.at > 15 * 60 * 1000
          const big = m.text.length <= 12 && EMOJI_ONLY.test(m.text)
          return (
            <div key={m.id}>
              {showTime && <div className="chat-time">{timeLabel(m.at)}</div>}
              <div className={`bubble ${m.by === me ? 'mine' : 'theirs'} ${big ? 'big' : ''}`} title={timeLabel(m.at)}>
                {m.text}
              </div>
            </div>
          )
        })}
      </div>
      {error && <div className="chat-error">{error}</div>}
      {picker && (
        <div className="emoji-grid">
          {EMOJI.map((e) => (
            <button key={e} onClick={() => insert(e)}>
              {e}
            </button>
          ))}
        </div>
      )}
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <button type="button" className="icon-btn" onClick={() => setPicker((p) => !p)} aria-label="Emoji">
          😀
        </button>
        <input
          ref={inputRef}
          value={text}
          maxLength={MAX_CHAT_LENGTH}
          placeholder="Message"
          enterKeyHint="send"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="send" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </aside>
  )
}
