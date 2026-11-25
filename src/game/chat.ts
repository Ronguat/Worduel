import { addDoc, collection, doc, limitToLast, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore'
import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../firebase'
import type { ChatMessage, Match, ReplyRef } from '../types'
import { parseMd, toPlain } from './markdown'

export const MAX_CHAT_LENGTH = 500
const MAX_SNIPPET = 140

/** What a reply carries of the original: who wrote it and a plain-text snippet (spoilers stay hidden). */
export function replyRef(m: ChatMessage): ReplyRef {
  const plain = toPlain(parseMd(m.text)).replace(/\s+/g, ' ').trim()
  const text = [...plain].length > MAX_SNIPPET ? [...plain].slice(0, MAX_SNIPPET - 1).join('') + '…' : plain
  return { id: m.id, by: m.by, text }
}

const messagesOf = (matchId: string) => collection(db, 'matches', matchId, 'messages')

export async function sendMessage(matchId: string, uid: string, text: string, replyTo?: ReplyRef) {
  const at = Date.now()
  await addDoc(messagesOf(matchId), { by: uid, text: text.slice(0, MAX_CHAT_LENGTH), at, ...(replyTo ? { replyTo } : {}) })
  await updateDoc(doc(db, 'matches', matchId), { lastChat: { by: uid, at } })
}

export function useMessages(matchId: string, enabled: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  useEffect(() => {
    if (!enabled) return
    const q = query(messagesOf(matchId), orderBy('at'), limitToLast(300))
    return onSnapshot(
      q,
      (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) }))),
      (err) => console.error(err),
    )
  }, [matchId, enabled])
  return messages
}

// When you last read a match's chat is saved on the match (per player), so it carries across devices, and in
// this device's storage, so it updates instantly and works offline. Whichever is later wins.
const readKey = (matchId: string) => `chatRead:${matchId}`

type ChatState = Pick<Match, 'id' | 'lastChat' | 'chatRead'>

function localReadAt(matchId: string) {
  try {
    return Number(localStorage.getItem(readKey(matchId))) || 0
  } catch {
    return 0
  }
}

export function chatReadAt(match: ChatState, me: string) {
  return Math.max(localReadAt(match.id), match.chatRead?.[me] ?? 0)
}

/** Records that `me` has read up to `last`. Saved to the match only when it's news: an unread message from the other player. */
export function markChatRead(match: ChatState, me: string, last: Pick<ChatMessage, 'by' | 'at'>) {
  try {
    if (last.at > localReadAt(match.id)) localStorage.setItem(readKey(match.id), String(last.at))
  } catch {
    /* storage unavailable */
  }
  if (last.by !== me && last.at > (match.chatRead?.[me] ?? 0)) {
    updateDoc(doc(db, 'matches', match.id), { [`chatRead.${me}`]: last.at }).catch((e) => console.warn('Saving chat read failed', e))
  }
}

export function hasUnreadChat(match: ChatState, me: string) {
  return !!match.lastChat && match.lastChat.by !== me && match.lastChat.at > chatReadAt(match, me)
}

// Typing: each player has a doc at matches/{id}/typing/{uid} holding when they last typed (0 once they stop). It's
// pinged at most every TYPING_PING ms while typing, and the other side shows "typing" for TYPING_SHOW ms after each
// ping arrives. The timeout runs on the receiver's clock from when the ping arrived, so clock differences between
// devices don't matter; the sender's own timestamp is only used to skip stale pings found when the chat first loads.
const TYPING_PING = 4000
const TYPING_SHOW = 7000

const typingDoc = (matchId: string, uid: string) => doc(db, 'matches', matchId, 'typing', uid)

function writeTyping(matchId: string, uid: string, at: number) {
  setDoc(typingDoc(matchId, uid), { at }).catch((e) => console.warn('Saving typing state failed', e))
}

/** Tells the other player when you're typing: call `typed` on each edit and `stopped` when you send or leave. */
export function useTypingSender(matchId: string, uid: string) {
  const lastPing = useRef(0)
  const stopped = useCallback(() => {
    if (!lastPing.current) return
    lastPing.current = 0
    writeTyping(matchId, uid, 0)
  }, [matchId, uid])
  const typed = useCallback(
    (text: string) => {
      if (!text.trim()) return stopped()
      const now = Date.now()
      if (now - lastPing.current < TYPING_PING) return
      lastPing.current = now
      writeTyping(matchId, uid, now)
    },
    [matchId, uid, stopped],
  )
  // Leaving the chat (closing it, switching match, hiding the app) stops it.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && stopped()
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      stopped()
    }
  }, [stopped])
  return { typed, stopped }
}

/** Whether the other player is typing right now. A message from them sent after their last ping ends it at once. */
export function useOtherTyping(matchId: string, me: string, enabled: boolean, lastMessage?: Pick<ChatMessage, 'by' | 'at'>) {
  // `at` is the ping's own timestamp (the sender's clock, comparable with their messages); `until` is on ours
  const [ping, setPing] = useState({ at: 0, until: 0 })
  const [, setTick] = useState(0)
  useEffect(() => {
    setPing({ at: 0, until: 0 })
    if (!enabled) return
    let first = true
    return onSnapshot(
      collection(db, 'matches', matchId, 'typing'),
      (snap) => {
        for (const change of snap.docChanges()) {
          if (change.doc.id === me || change.type === 'removed') continue
          const at = Number(change.doc.data().at) || 0
          const received = Date.now()
          if (!at) setPing({ at: 0, until: 0 })
          else if (!first || received - at < TYPING_SHOW) setPing({ at, until: received + TYPING_SHOW })
        }
        first = false
      },
      (err) => console.warn('Typing listener failed', err),
    )
  }, [matchId, me, enabled])

  const theirLast = lastMessage && lastMessage.by !== me ? lastMessage.at : 0
  const typing = ping.until > Date.now() && theirLast < ping.at

  // Re-render when the indicator should time out.
  useEffect(() => {
    if (!typing) return
    const t = window.setTimeout(() => setTick((n) => n + 1), ping.until - Date.now() + 50)
    return () => window.clearTimeout(t)
  }, [typing, ping.until])

  return typing
}
