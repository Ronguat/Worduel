import { addDoc, collection, doc, limitToLast, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore'
import { useEffect, useState } from 'react'
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
