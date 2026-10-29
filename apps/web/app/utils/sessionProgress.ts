import { z } from '@doot-games/sdk'

const progressSchema = z.object({
  version: z.literal(1),
  picks: z.array(z.string().min(1)).min(1),
  index: z.number().int().nonnegative(),
  captured: z.number().int().min(-1),
  finished: z.boolean(),
  scores: z.array(z.tuple([z.string(), z.object({ name: z.string(), points: z.number().int().nonnegative() })])),
}).refine(p => p.index < p.picks.length && p.captured <= p.index)

export type SessionProgress = z.infer<typeof progressSchema>

/** The tab already persists its room/token. Keep its lineup and placement totals
 * beside them; the engine remains responsible for resuming the actual game. */
export function readSessionProgress(raw: string | null, candidates: string[]): SessionProgress | null {
  try {
    const parsed = progressSchema.safeParse(JSON.parse(raw ?? 'null'))
    if (!parsed.success || parsed.data.picks.some(id => !candidates.includes(id))) return null
    return parsed.data
  } catch { return null }
}
