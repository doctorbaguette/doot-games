import { describe, expect, it } from 'vitest'
import { BIRTHDAY_CELLS, birthdayBoardSchema, birthdayLeaderboard, finishBirthdayCell, newBirthdayBoard, readBirthdayBoard, startBirthdayCell } from './birthdayBoard'
import { birthdayGame } from './birthdayBoardGames'
import { sessionPlacementPoints } from './sessionScoring'

describe('Birthday board prototype', () => {
  it('defines exactly the three requested fields and reuses the registered External Challenge', () => {
    expect(BIRTHDAY_CELLS.map(c => c.id)).toEqual(['brains', 'draw', 'versus'])
    expect(birthdayGame('brains').config.rounds.map(r => r.block)).toEqual(['guess'])
    expect(birthdayGame('draw').config.rounds.map(r => r.block)).toEqual(['draw', 'drawvote'])
    const versus = birthdayGame('versus')
    expect(versus.plugin.manifest.id).toBe('external-challenge')
    expect(versus.plugin.components?.Host).toBeUndefined()
    expect(versus.config.rounds).toEqual(versus.plugin.defaultConfig.rounds)
    expect(versus.plugin.blocks[0]!.solo).toBe(true)
  })
  it('plays cells in arbitrary order, locks completed fields and counts each result only once', () => {
    let state = newBirthdayBoard()
    for (const [index, cell] of ['versus', 'brains', 'draw'].entries()) {
      state = startBirthdayCell(state, cell as 'versus' | 'brains' | 'draw', `run-${index}`)
      expect(() => startBirthdayCell(state, 'brains')).toThrow()
      expect(() => finishBirthdayCell(state, 'old-run', {})).toThrow()
      state = finishBirthdayCell(state, `run-${index}`, { leaderboard: [{ id: 'alice', name: 'Alice', score: 1300 }, { id: 'bob', name: 'Bob', score: 0 }] })
      expect(state.active).toBeNull()
      expect(() => finishBirthdayCell(state, `run-${index}`, {})).toThrow()
    }
    expect(state.completed.map(c => c.cellId)).toEqual(['versus', 'brains', 'draw'])
    expect(birthdayLeaderboard(state)).toEqual([{ id: 'alice', name: 'Alice', points: 15 }])
    expect(() => startBirthdayCell(state, 'versus')).toThrow()
  })
  it('keeps the exact existing placement rule, including tied scores and entries without an ID', () => {
    expect(sessionPlacementPoints({ leaderboard: [
      { name: 'No ID', score: 100 }, { id: 'a', name: 'A', score: 90 },
      { id: 'b', name: 'B', score: 90 }, { id: 'c', name: 'C', score: 50 },
      { id: 'zero', name: 'Zero', score: 0 },
    ] })).toEqual([{ id: 'a', name: 'A', points: 3 }, { id: 'b', name: 'B', points: 2 }, { id: 'c', name: 'C', points: 1 }])
  })
  it('restores active and completed board state without storing question answers in the public snapshot', () => {
    let state = finishBirthdayCell(startBirthdayCell(newBirthdayBoard(), 'brains', 'first'), 'first', {})
    state = startBirthdayCell(state, 'versus', 'second')
    expect(readBirthdayBoard(JSON.stringify(state))).toEqual(state)
    expect(readBirthdayBoard('{')).toBeNull()
    expect(JSON.stringify(state)).not.toContain('correct')
    expect(birthdayBoardSchema.safeParse({ ...state, completed: [...state.completed, ...state.completed] }).success).toBe(false)
  })
})
