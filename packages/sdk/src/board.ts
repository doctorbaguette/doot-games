import { z } from 'zod'

export const boardGameTypeSchema = z.enum(['brains', 'draw', 'versus'])
export type BoardGameType = z.infer<typeof boardGameTypeSchema>
const idSchema = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/)
// A discriminated target leaves room for future saved-game/question/media targets.
// Phase 1 deliberately rejects those rather than pretending they can be played.
export const boardTargetSchema = z.object({ kind: z.literal('builtin'), game: boardGameTypeSchema }).strict()
export const boardCellSchema = z.object({
  id: idSchema,
  label: z.string().trim().min(1, 'Bitte jedes Feld beschriften.').max(120),
  value: z.number().int().min(0).max(1000000),
  target: boardTargetSchema,
}).strict()
export const boardDefinitionSchema = z.object({
  version: z.literal(1),
  title: z.string().trim().min(1, 'Bitte einen Namen für die Gameshow eingeben.').max(120),
  categories: z.array(z.object({
    id: idSchema,
    name: z.string().trim().min(1, 'Bitte jede Kategorie benennen.').max(80),
    cells: z.array(boardCellSchema).min(1).max(10),
  }).strict()).min(1).max(12),
}).strict().refine(board => new Set(board.categories.map(c => c.id)).size === board.categories.length
  && new Set(board.categories.flatMap(c => c.cells.map(f => f.id))).size === board.categories.flatMap(c => c.cells).length,
{ message: 'Kategorien und Felder benötigen eindeutige IDs.' })
export type BoardDefinition = z.infer<typeof boardDefinitionSchema>

export const publicBoardSchema = z.object({
  version: z.literal(1), title: z.string().max(120),
  categories: z.array(z.object({ id: idSchema, name: z.string().max(80), cells: z.array(z.object({ id: idSchema, label: z.string().max(120), value: z.number().int().nonnegative() }).strict()).min(1).max(10) }).strict()).min(1).max(12),
}).strict()
export type PublicBoard = z.infer<typeof publicBoardSchema>
/** Allowlist projection: adding private target fields later cannot leak them. */
export function publicBoard(board: BoardDefinition): PublicBoard {
  return { version: 1, title: board.title, categories: board.categories.map(c => ({ id: c.id, name: c.name, cells: c.cells.map(f => ({ id: f.id, label: f.label, value: f.value })) })) }
}
export function createDefaultBoard(): BoardDefinition {
  return {
    version: 1, title: 'Birthday Gameshow 2027',
    categories: ['BRAINS', 'DRAW', 'VERSUS', 'Kategorie 4', 'Kategorie 5', 'Kategorie 6'].map((name, c) => ({
      id: `category-${c + 1}`, name,
      cells: Array.from({ length: 5 }, (_, f) => ({ id: `cell-${c + 1}-${f + 1}`, label: `Feld ${f + 1}`, value: (f + 1) * 100, target: { kind: 'builtin', game: (['brains', 'draw', 'versus'] as const)[c] ?? 'brains' } })),
    })),
  }
}
