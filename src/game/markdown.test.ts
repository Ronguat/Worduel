import { describe, expect, it } from 'vitest'
import { hasFormatting, parseMd, toPlain } from './markdown'

describe('chat markdown', () => {
  it('parses the basic styles', () => {
    expect(parseMd('**bold** and *it* and _it_ and ~~no~~')).toEqual([
      { t: 'b', c: ['bold'] },
      ' and ',
      { t: 'i', c: ['it'] },
      ' and ',
      { t: 'i', c: ['it'] },
      ' and ',
      { t: 's', c: ['no'] },
    ])
  })

  it('nests styles', () => {
    expect(parseMd('*a **b** c*')).toEqual([{ t: 'i', c: ['a ', { t: 'b', c: ['b'] }, ' c'] }])
    expect(parseMd('||it was **CRANE**||')).toEqual([{ t: 'spoiler', c: ['it was ', { t: 'b', c: ['CRANE'] }] }])
  })

  it('keeps code literal', () => {
    expect(parseMd('try `**this**`')).toEqual(['try ', { t: 'code', v: '**this**' }])
  })

  it('links bare urls without trailing punctuation', () => {
    expect(parseMd('see https://example.com/a_b, ok')).toEqual(['see ', { t: 'a', href: 'https://example.com/a_b' }, ', ok'])
  })

  it('leaves ordinary punctuation alone', () => {
    for (const s of ['2 * 3 * 4', 'snake_case_name', 'a ** b', 'lol *', '5*5=25', 'well... ok', 'a | b || c']) {
      expect(parseMd(s)).toEqual([s])
      expect(hasFormatting(s)).toBe(false)
    }
  })

  it('honors escapes', () => {
    expect(parseMd('\\*not italic\\*')).toEqual(['*not italic*'])
  })

  it('makes plain text with spoilers hidden', () => {
    expect(toPlain(parseMd('**hint:** ||crane||'))).toBe('hint: ▒▒▒')
  })
})
