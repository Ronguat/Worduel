import { useState, type ReactNode } from 'react'
import { parseMd, type MdNode } from '../game/markdown'

function Spoiler({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false)
  return (
    <span
      className={`spoiler ${shown ? 'shown' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={shown ? undefined : 'Spoiler, tap to reveal'}
      onClick={(e) => {
        e.stopPropagation()
        setShown((s) => !s)
      }}
    >
      {children}
    </span>
  )
}

function render(nodes: MdNode[]): ReactNode[] {
  return nodes.map((n, i) => {
    if (typeof n === 'string') return n
    switch (n.t) {
      case 'code':
        return <code key={i}>{n.v}</code>
      case 'a':
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            {n.href}
          </a>
        )
      case 'b':
        return <strong key={i}>{render(n.c)}</strong>
      case 'i':
        return <em key={i}>{render(n.c)}</em>
      case 's':
        return <s key={i}>{render(n.c)}</s>
      case 'spoiler':
        return <Spoiler key={i}>{render(n.c)}</Spoiler>
    }
  })
}

export function Markdown({ text }: { text: string }) {
  return <>{render(parseMd(text))}</>
}
