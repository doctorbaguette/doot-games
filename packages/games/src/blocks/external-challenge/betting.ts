import { z } from '@doot-games/sdk'

export const BET_POINTS = 300
export const bettingPlayerSchema = z.object({ id: z.string().min(1), name: z.string() })
export const bettingSchema = z.object({
  id: z.string().min(1),
  eligible: z.array(bettingPlayerSchema),
  picks: z.array(z.object({ playerId: z.string().min(1), pickId: z.string().min(1) })),
})
export const betRequestSchema = z.object({ pickId: z.string().min(1) }).strict()
export type BettingWindow = z.infer<typeof bettingSchema>

// Match Doot's host identity fallback for local HTTP/LAN development, where
// randomUUID may be unavailable. This is a replay discriminator, not a secret.
export function newBettingWindowId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function validBetting(window: BettingWindow, slots: Array<string | null>): boolean {
  const eligible = new Set(window.eligible.map(p => p.id))
  return eligible.size === window.eligible.length
    && !slots.some(id => id && eligible.has(id))
    && new Set(window.picks.map(p => p.playerId)).size === window.picks.length
    && window.picks.every(p => eligible.has(p.playerId) && slots.includes(p.pickId))
}

/** No counters or point writes: one final pick per identity, scored only on reveal. */
export function betSummary(match: {
  status: string; winnerId: string | null; slots: Array<string | null>; betting?: BettingWindow
}) {
  const picks = match.betting?.picks ?? []
  const successful = match.status === 'completed'
    ? picks.filter(p => p.pickId === match.winnerId).map(p => match.betting!.eligible.find(e => e.id === p.playerId)!)
    : []
  return {
    distribution: match.slots.map(id => ({ id, count: picks.filter(p => p.pickId === id).length })),
    successful,
  }
}

/** Window IDs prevent retained messages from a reset/replayed match being reused. */
export function betChannel(round: number, windowId: string, playerId: string): string {
  return `external-challenge/bets/${round}/${windowId}/${playerId}`
}

export function parseBetRequest(round: number, key: string, value: unknown) {
  const parts = key.split('/')
  const parsed = betRequestSchema.safeParse(value)
  if (parts.length !== 5 || parts[0] !== 'external-challenge' || parts[1] !== 'bets'
    || parts[2] !== String(round) || !parts[3] || !parts[4] || !parsed.success) return null
  // Identity comes from the player's channel, never from a player-supplied payload.
  return { windowId: parts[3], playerId: parts[4], pickId: parsed.data.pickId }
}
