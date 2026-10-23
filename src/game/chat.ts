import { addDoc, collection, doc, limitToLast, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase'
import type { ChatMessage } from '../types'

export const MAX_CHAT_LENGTH = 500

const messagesOf = (matchId: string) => collection(db, 'matches', matchId, 'messages')

export async function sendMessage(matchId: string, uid: string, text: string) {
  const at = Date.now()
  await addDoc(messagesOf(matchId), { by: uid, text: text.slice(0, MAX_CHAT_LENGTH), at })
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

// When you last read each match's chat lives in this device's storage.
const readKey = (matchId: string) => `chatRead:${matchId}`

export function chatReadAt(matchId: string) {
  try {
    return Number(localStorage.getItem(readKey(matchId))) || 0
  } catch {
    return 0
  }
}

export function markChatRead(matchId: string, at: number) {
  try {
    if (at > chatReadAt(matchId)) localStorage.setItem(readKey(matchId), String(at))
  } catch {
    /* storage unavailable */
  }
}

export function hasUnreadChat(match: { id: string; lastChat?: { by: string; at: number } }, me: string) {
  return !!match.lastChat && match.lastChat.by !== me && match.lastChat.at > chatReadAt(match.id)
}
