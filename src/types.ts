export type Mode = 'duel' | 'team'
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
  /** the answer, lightly obfuscated so it isn't readable at a glance */
  a: string
  guesses: Guess[]
  solvedBy: string | null
  failed: boolean
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
  /** duel only: whose turn it is */
  turn: string | null
  turnCount: number
  boards: BoardState[]
  /** duel only */
  winner: string | null
  /** team only */
  result: 'won' | 'lost' | null
  endReason: 'solved' | 'failed' | 'resigned' | null
  lastMove: { by: string; at: number } | null
}

export interface GuessEntry {
  board: number
  word: string
}
