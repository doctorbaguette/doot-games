import { boardDefinitionSchema, publicBoard, z, type BoardDefinition } from '@doot-games/sdk'
import { birthdayBoardSchema, newBirthdayBoard } from './birthdayBoard'

export const birthdayShowSnapshotSchema = z.object({
  version: z.literal(1), sourceId: z.string(), frozenAt: z.number(),
  definition: boardDefinitionSchema.optional(),
  state: birthdayBoardSchema,
}).refine(s => s.definition ? JSON.stringify(publicBoard(s.definition)) === JSON.stringify(s.state.board) : s.state.board === undefined,
{ message: 'Die Show-Konfiguration passt nicht zum Board-Zustand.' })
export type BirthdayShowSnapshot = z.infer<typeof birthdayShowSnapshotSchema>
export function freezeBirthdayShow(definition?: BoardDefinition, sourceId = 'prototype'): BirthdayShowSnapshot {
  const copy = definition ? boardDefinitionSchema.parse(JSON.parse(JSON.stringify(definition))) : undefined
  return { version: 1, sourceId, frozenAt: Date.now(), ...(copy ? { definition: copy } : {}), state: newBirthdayBoard(copy) }
}
export function readBirthdayShow(raw: string | null, sourceId = 'prototype'): BirthdayShowSnapshot | null {
  try {
    const data = JSON.parse(raw ?? 'null')
    const parsed = birthdayShowSnapshotSchema.safeParse(data)
    if (parsed.success && parsed.data.sourceId === sourceId) return parsed.data
    // The original three-field prototype stored just its public progress.
    const legacy = sourceId === 'prototype' ? birthdayBoardSchema.safeParse(data) : null
    if (legacy?.success && !legacy.data.board) return { ...freezeBirthdayShow(), state: legacy.data }
    return null
  } catch { return null }
}
