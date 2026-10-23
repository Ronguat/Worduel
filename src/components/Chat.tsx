import { useEffect, useRef, useState } from 'react'
import { MAX_CHAT_LENGTH, markChatRead, replyRef, sendMessage } from '../game/chat'
import { hasFormatting } from '../game/markdown'
import { useStoredState } from '../hooks'
import type { ChatMessage } from '../types'
import { Markdown } from './Markdown'

const EMOJI = [
  '😂', '🤣', '😅', '😭', '😤', '😎', '🤔', '🙃', '😏', '😬', '😜', '😱', '🤯', '🥳', '😈', '💀',
  '👀', '🙄', '😴', '🤓', '😵', '🤡', '😘', '🤗', '👍', '👎', '👏', '🙌', '🤞', '💪', '🙏', '🤝',
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
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pressTimer = useRef<number>()
  const nameOf = (uid: string) => (uid === me ? 'You' : opponentName)

  const startReply = (m: ChatMessage) => {
    setReplyTo(m)
    inputRef.current?.focus()
  }

  // Phones have no right-click, so a long-press starts a reply instead.
  const pressHandlers = (m: ChatMessage) => ({
    onContextMenu: (e: React.MouseEvent) => {
      if (e.shiftKey) return // shift + right-click keeps the browser's own menu
      e.preventDefault()
      startReply(m)
    },
    onTouchStart: () => {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = window.setTimeout(() => {
        navigator.vibrate?.(10)
        startReply(m)
      }, 450)
    },
    onTouchMove: () => window.clearTimeout(pressTimer.current),
    onTouchEnd: () => window.clearTimeout(pressTimer.current),
    onTouchCancel: () => window.clearTimeout(pressTimer.current),
  })

  const jumpTo = (id: string) => {
    const el = document.getElementById(`msg-${id}`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setFlashId(id)
    window.setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1400)
  }

  const last = messages[messages.length - 1]
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
    if (last) markChatRead(matchId, last.at)
  }, [matchId, last])

  const send = async () => {
    const t = text.trim()
    if (!t) return
    const reply = replyTo
    setText('')
    setPicker(false)
    setReplyTo(null)
    setError(null)
    try {
      await sendMessage(matchId, me, t, reply ? replyRef(reply) : undefined)
    } catch (e) {
      console.error(e)
      setText(t)
      setReplyTo(reply)
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
        {messages.length === 0 && (
          <div className="chat-empty">
            No messages yet. Talk some trash. 🗑️
            <div className="chat-tips">
              Right-click a message to reply (long-press on a phone).
              <br />
              <b>**bold**</b> · <i>*italic*</i> · <s>~~strike~~</s> · <code>`code`</code> · ||spoiler||
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const showTime = !prev || m.at - prev.at > 15 * 60 * 1000
          const big = !m.replyTo && m.text.length <= 12 && EMOJI_ONLY.test(m.text)
          const side = m.by === me ? 'mine' : 'theirs'
          return (
            <div key={m.id} id={`msg-${m.id}`} className={`msg ${side}`}>
              {showTime && <div className="chat-time">{timeLabel(m.at)}</div>}
              <div
                className={`bubble ${side} ${big ? 'big' : ''} ${flashId === m.id ? 'flash' : ''}`}
                title={`${timeLabel(m.at)} · right-click to reply`}
                {...pressHandlers(m)}
              >
                {m.replyTo && (
                  <button
                    className="quote"
                    data-by={m.replyTo.by === me ? 'me' : 'them'}
                    onClick={() => jumpTo(m.replyTo!.id)}
                    aria-label={`Reply to ${nameOf(m.replyTo.by)}: ${m.replyTo.text}. Show original`}
                  >
                    <b>{nameOf(m.replyTo.by)}</b>
                    <span>{m.replyTo.text}</span>
                  </button>
                )}
                <Markdown text={m.text} />
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
      {replyTo && (
        <div className="reply-bar" data-by={replyTo.by === me ? 'me' : 'them'}>
          <button className="reply-target" onClick={() => jumpTo(replyTo.id)}>
            <b>Replying to {replyTo.by === me ? 'yourself' : opponentName}</b>
            <span>{replyRef(replyTo).text}</span>
          </button>
          <button className="icon-btn" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
            ✕
          </button>
        </div>
      )}
      {hasFormatting(text) && (
        <div className="md-preview" aria-label="Preview">
          <span>Preview</span>
          <div className="bubble mine">
            <Markdown text={text} />
          </div>
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
          placeholder={replyTo ? 'Reply' : 'Message'}
          enterKeyHint="send"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && replyTo) {
              e.preventDefault()
              setReplyTo(null)
            }
          }}
        />
        <button type="submit" className="send" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </aside>
  )
}
