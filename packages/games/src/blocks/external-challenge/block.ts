import { defineBlock, z } from '@doot-games/sdk'
import ChallengeHost from './ChallengeHost.vue'
import ChallengePlayer from './ChallengePlayer.vue'
import { scoreExternalDuel } from './score'
import { scoringPlayers, tournamentSchema, tournamentScores, type Tournament } from './tournament'

export const duelSchema = z.object({
  playerA: z.string().min(1),
  playerB: z.string().min(1),
  nameA: z.string(),
  nameB: z.string(),
  winnerId: z.string().nullable(),
  confirmed: z.boolean(),
}).refine(d => d.playerA !== d.playerB && (d.winnerId === null || [d.playerA, d.playerB].includes(d.winnerId))
  && (!d.confirmed || !!d.winnerId))
export const externalChallengeContentSchema = z.object({
  title: z.string().default('Nidhogg Duel'),
  description: z.string().default('Ein Duell außerhalb von Doot.'),
})
export type ExternalChallengeContent = z.infer<typeof externalChallengeContentSchema> & {
  // Runtime-only host state: deliberately excluded from authored/saved content.
  duel?: z.infer<typeof duelSchema>
  tournament?: Tournament
}

export const externalChallengeBlock = defineBlock<ExternalChallengeContent, Record<string, never>>({
  kind: 'external-challenge',
  name: 'External Challenge',
  scoring: 'Jeder Matchsieg bringt 1000 Punkte, ein richtiger Zuschauertipp 300 Punkte. Freilose geben keine Punkte.',
  solo: true,
  contentSchema: externalChallengeContentSchema,
  defaultContent: () => externalChallengeContentSchema.parse({}),
  defaultTimer: null,
  timerOf: () => null,
  emptyInput: () => ({}),
  isComplete: () => false,
  HostDisplay: ChallengeHost,
  PlayerInput: ChallengePlayer,
  aggregate: ({ rounds, players }) => {
    const totals = new Map<string, { id: string; name: string; score: number }>()
    for (const { content } of rounds) {
      if (content.tournament !== undefined) {
        const parsed = tournamentSchema.safeParse(content.tournament)
        if (!parsed.success) continue
        const roster = new Map(scoringPlayers(parsed.data).map(p => [p.id, p.name]))
        for (const [id, score] of tournamentScores(parsed.data)) {
          const name = roster.get(id)!
          const previous = totals.get(id)
          totals.set(id, { id, name, score: (previous?.score ?? 0) + score })
        }
        continue
      }
      // Keep already recorded single-duel rounds readable.
      const parsed = duelSchema.safeParse(content.duel)
      if (!parsed.success || !parsed.data.confirmed) continue
      const d = parsed.data
      if (!d.winnerId) continue
      for (const [id, score] of scoreExternalDuel(d.playerA, d.playerB, d.winnerId)) {
        const name = players.find(p => p.id === id)?.name ?? (id === d.playerA ? d.nameA : d.nameB)
        const previous = totals.get(id)
        totals.set(id, { id, name, score: (previous?.score ?? 0) + score })
      }
    }
    return { leaderboard: [...totals.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)) }
  },
})
