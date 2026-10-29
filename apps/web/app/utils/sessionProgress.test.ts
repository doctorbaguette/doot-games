import { describe, expect, it } from 'vitest'
import { readSessionProgress } from './sessionProgress'

const state = {
  version: 1, picks: ['external-challenge', 'guess'], index: 1, captured: 0, finished: false,
  scores: [['alice', { name: 'Alice', points: 5 }]],
}
const candidates = ['external-challenge', 'guess']
describe('session progress recovery', () => {
  it('preserves lineup, current leg, captured marker and existing placement points', () => {
    expect(readSessionProgress(JSON.stringify(state), candidates)).toEqual(state)
  })
  it('preserves a captured final result so the host does not award placement points twice', () => {
    const finished = { ...state, captured: 1, finished: true }
    expect(readSessionProgress(JSON.stringify(finished), candidates)).toEqual(finished)
  })
  it.each([null, '{', '{}', 'null'])('ignores missing or invalid storage: %s', raw => {
    expect(readSessionProgress(raw, candidates)).toBeNull()
  })
  it('rejects invalid indices, totals and unavailable plugins', () => {
    for (const invalid of [{ ...state, index: 2 }, { ...state, captured: 2 }, { ...state, scores: [['alice', { name: 'Alice', points: -1 }]] }]) {
      expect(readSessionProgress(JSON.stringify(invalid), candidates)).toBeNull()
    }
    expect(readSessionProgress(JSON.stringify(state), ['guess'])).toBeNull()
  })
})
