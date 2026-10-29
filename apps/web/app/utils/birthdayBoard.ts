import { publicBoard, publicBoardSchema, z, type BoardDefinition, type StandardResults } from '@doot-games/sdk'
import { sessionPlacementPoints } from './sessionScoring'

export const BIRTHDAY_BOARD_CHANNEL = 'birthday-board/state'
export const BIRTHDAY_CELLS = [
  { id: 'brains', category: 'BRAINS', title: 'Quizfrage', description: 'Eine Frage. Vier Antworten. Wer weiß es?' },
  { id: 'draw', category: 'DRAW', title: 'Zeichnen & Abstimmen', description: 'Stifte bereit: Zeichnen, anschauen und den Favoriten wählen.' },
  { id: 'versus', category: 'VERSUS', title: 'Nidhogg-Turnier', description: 'Das ganze K.-o.-Turnier mit Turnierbaum und Zuschauerwetten.' },
] as const
export const cellIdSchema = z.string().min(1).max(80)
export type BirthdayCellId = z.infer<typeof cellIdSchema>
const runSchema = z.object({ cellId: cellIdSchema, runId: z.string().min(1) })
const scoreSchema = z.object({ id: z.string().min(1), name: z.string(), points: z.number().int().nonnegative() })
export const birthdayBoardSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().min(1),
  board: publicBoardSchema.optional(),
  active: runSchema.nullable(),
  lastRun: runSchema.nullable(),
  completed: z.array(runSchema.extend({ scores: z.array(scoreSchema) })).max(120),
}).refine(s => new Set(s.completed.map(c => c.cellId)).size === s.completed.length
  && new Set(s.completed.map(c => c.runId)).size === s.completed.length
  && (!s.active || (!s.completed.some(c => c.cellId === s.active!.cellId || c.runId === s.active!.runId)
    && s.lastRun?.runId === s.active.runId && s.lastRun.cellId === s.active.cellId))
  && [...s.completed, ...(s.active ? [s.active] : []), ...(s.lastRun ? [s.lastRun] : [])]
    .every(run => (s.board ? s.board.categories.flatMap(c => c.cells) : BIRTHDAY_CELLS).some(c => c.id === run.cellId)))
export type BirthdayBoardState = z.infer<typeof birthdayBoardSchema>
export function executionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
export function newBirthdayBoard(definition?: BoardDefinition): BirthdayBoardState {
  return { version: 1, sessionId: executionId(), ...(definition ? { board: publicBoard(definition) } : {}), active: null, lastRun: null, completed: [] }
}
export function startBirthdayCell(state: BirthdayBoardState, cellId: BirthdayCellId, runId = executionId()): BirthdayBoardState {
  const cells = state.board ? state.board.categories.flatMap(c => c.cells) : BIRTHDAY_CELLS
  if (!cells.some(c => c.id === cellId) || state.active || state.completed.some(c => c.cellId === cellId || c.runId === runId)) throw new Error('Dieses Feld kann gerade nicht gestartet werden.')
  const run = { cellId, runId }
  return { ...state, active: run, lastRun: run }
}
export function finishBirthdayCell(state: BirthdayBoardState, runId: string, results: StandardResults): BirthdayBoardState {
  if (!state.active || state.active.runId !== runId) throw new Error('Dieses Ergebnis gehört nicht zum laufenden Feld.')
  return { ...state, active: null, completed: [...state.completed, { ...state.active, scores: sessionPlacementPoints(results) }] }
}
export function birthdayLeaderboard(state: BirthdayBoardState) {
  const totals = new Map<string, { id: string; name: string; points: number }>()
  for (const cell of state.completed) for (const score of cell.scores) {
    totals.set(score.id, { ...score, points: (totals.get(score.id)?.points ?? 0) + score.points })
  }
  return [...totals.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
}
export function readBirthdayBoard(raw: string | null): BirthdayBoardState | null {
  try { const parsed = birthdayBoardSchema.safeParse(JSON.parse(raw ?? 'null')); return parsed.success ? parsed.data : null }
  catch { return null }
}
