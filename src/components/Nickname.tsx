import type { User } from 'firebase/auth'
import { useState } from 'react'
import { MAX_NICKNAME, cleanNickname, saveNickname } from '../profiles'

/** Text field + save button for choosing a nickname. Calls onDone after a successful save. */
export function NicknameForm({ user, initial, cta, onDone }: { user: User; initial: string; cta: string; onDone?: () => void }) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const result = cleanNickname(value)
    if ('error' in result) return setError(result.error)
    setBusy(true)
    setError(null)
    try {
      await saveNickname(user, result.name)
      onDone?.()
    } catch (e) {
      console.error(e)
      setError("Couldn't save. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="nickname-form"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <input
        value={value}
        autoFocus
        maxLength={MAX_NICKNAME * 2}
        placeholder="Nickname"
        aria-label="Nickname"
        enterKeyHint="done"
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="hint">This is the name your opponents see. Emoji welcome. You can change it any time.</div>
      {error && <div className="form-error">{error}</div>}
      <button className="btn block" type="submit" disabled={busy}>
        {cta}
      </button>
    </form>
  )
}
