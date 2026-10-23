export type Mode = 'duel' | 'team' | 'faceoff'
export type WordLength = 5 | 6
export type Mark = 'correct' | 'present' | 'absent'

export interface Profile {
  name: string
  photo: string | null
}

export interface Guess {
  /** the guessed word, lowercase */
  w: string
  /** uid of the player who made it */
  by: string
  /** turn number the guess was made on */
  turn: number
  at: number
}

export interface BoardState {
  /** the answer, lightly obfuscated so it isn't readable at a glance ('' until picked in face-off) */
  a: string
  guesses: Guess[]
  solvedBy: string | null
  failed: boolean
  /** face-off only: the player guessing on this board (the other player picked its word) */
  guesser?: string
}

export interface Match {
  id: string
  mode: Mode
  length: WordLength
  boardCount: number
  hardMode: boolean
  /** team mode only: guesses allowed per board */
  maxGuesses: number | null
  players: string[]
  profiles: Record<string, Profile>
  createdBy: string
  createdAt: number
  updatedAt: number
  status: 'waiting' | 'active' | 'finished'
  /** duel only */
  firstPlayer: string | null
  /** unused since duels moved to per-board turns (see boardTurn); kept for older matches */
  turn: string | null
  turnCount: number
  boards: BoardState[]
  /** duel and face-off */
  winner: string | null
  /** team: won/lost; face-off: draw */
  result: 'won' | 'lost' | 'draw' | null
  endReason: 'solved' | 'failed' | 'resigned' | null
  lastMove: { by: string; at: number } | null
  /** most recent chat message, so the lobby can flag unread chat */
  lastChat?: { by: string; at: number }
}

export interface ChatMessage {
  id: string
  by: string
  text: string
  at: number
  /** the message being replied to, with a short plain-text snippet of it */
  replyTo?: ReplyRef
}

export interface ReplyRef {
  id: string
  by: string
  text: string
}

export interface GuessEntry {
  board: number
  word: string
}
