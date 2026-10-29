import { describe, expect, it } from 'vitest'
import { boardDefinitionSchema, createDefaultBoard, publicBoard } from '@doot-games/sdk'
import { birthdayBoardSchema, finishBirthdayCell, newBirthdayBoard, startBirthdayCell } from './birthdayBoard'
import { freezeBirthdayShow, readBirthdayShow } from './birthdayShowSnapshot'
import { birthdayGameForField } from './birthdayBoardGames'

describe('prepared board and evening snapshot', () => {
  it('defaults to six categories and five fields with stable IDs and supported targets', () => {
    const board = createDefaultBoard()
    expect(board.categories).toHaveLength(6)
    expect(board.categories.every(c => c.cells.length === 5)).toBe(true)
    expect(boardDefinitionSchema.safeParse(board).success).toBe(true)
    const duplicate = structuredClone(board)
    duplicate.categories[1]!.cells[0]!.id = duplicate.categories[0]!.cells[0]!.id
    expect(boardDefinitionSchema.safeParse(duplicate).success).toBe(false)
  })
  it('freezes target, name, order and values; later edits never change the current show or its recovery', () => {
    const template = createDefaultBoard()
    const show = freezeBirthdayShow(template, 'pl_birthday')
    template.title = 'Changed next day'
    template.categories.reverse()
    template.categories.at(-1)!.cells[0]!.target.game = 'versus'
    template.categories.at(-1)!.cells[0]!.value = 999
    expect(show.definition!.title).toBe('Birthday Gameshow 2027')
    expect(birthdayGameForField('cell-1-1', show.definition).plugin.manifest.id).toBe('guess')
    expect(show.state.board!.categories[0]!.cells[0]!.value).toBe(100)
    expect(readBirthdayShow(JSON.stringify(show), 'pl_birthday')).toEqual(show)
    expect(readBirthdayShow(JSON.stringify(show), 'another-board')).toBeNull()
    const nextShow = freezeBirthdayShow(template, 'pl_birthday')
    expect(nextShow.definition!.title).toBe('Changed next day')
    expect(nextShow.state.sessionId).not.toBe(show.state.sessionId)
  })
  it('publishes only display information and does not leak targets or future protected contents', () => {
    const board = createDefaultBoard()
    const malicious = structuredClone(board) as unknown as { categories: Array<{ cells: Array<Record<string, unknown>> }> }
    malicious.categories[0]!.cells[0]!.question = { correct: 2, image: 'private-media' }
    const visible = publicBoard(malicious as unknown as typeof board)
    expect(JSON.stringify(visible)).not.toContain('target')
    expect(JSON.stringify(visible)).not.toContain('correct')
    expect(JSON.stringify(visible)).not.toContain('private-media')
    expect(boardDefinitionSchema.safeParse(malicious).success).toBe(false)
  })
  it('plays an arbitrary prepared field, preserves completion on refresh and retains the prototype', () => {
    const board = createDefaultBoard()
    board.categories[0]!.cells[0]!.target.game = 'versus'
    const show = freezeBirthdayShow(board, 'saved')
    expect(birthdayGameForField('cell-1-1', show.definition).plugin.manifest.id).toBe('external-challenge')
    show.state = finishBirthdayCell(startBirthdayCell(show.state, 'cell-1-1', 'run'), 'run', { leaderboard: [{ id: 'a', name: 'A', score: 1000 }] })
    expect(readBirthdayShow(JSON.stringify(show), 'saved')!.state.completed).toHaveLength(1)
    expect(() => startBirthdayCell(show.state, 'cell-1-1')).toThrow()
    expect(() => startBirthdayCell(show.state, 'missing')).toThrow()
    const legacy = newBirthdayBoard()
    expect(readBirthdayShow(JSON.stringify(legacy))?.state).toEqual(legacy)
    expect(birthdayBoardSchema.safeParse(legacy).success).toBe(true)
    expect(birthdayGameForField('brains').plugin.manifest.id).toBe('guess')
  })
})
