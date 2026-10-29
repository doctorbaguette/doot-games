
import { describe, expect, it } from 'vitest'
import { scoreExternalDuel } from './score'

describe('External Challenge scoring', () => {
  it('awards 1000 points to the winner', () => {
    const scores = scoreExternalDuel('alice', 'bob', 'alice')

    expect(scores.get('alice')).toBe(1000)
    expect(scores.get('bob')).toBe(0)
  })

  it('supports custom point values', () => {
    const scores = scoreExternalDuel('alice', 'bob', 'bob', 500)

    expect(scores.get('alice')).toBe(0)
    expect(scores.get('bob')).toBe(500)
  })

  it('rejects a winner who is not participating', () => {
    expect(() =>
      scoreExternalDuel('alice', 'bob', 'charlie'),
    ).toThrow()
  })
})
