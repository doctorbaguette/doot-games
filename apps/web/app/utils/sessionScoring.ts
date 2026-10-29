import type { StandardResults } from '@doot-games/sdk'

/** Existing session rule, shared by linear sessions and the board prototype. */
export function sessionPlacementPoints(results?: StandardResults): Array<{ id: string; name: string; points: number }> {
  return (results?.leaderboard ?? []).filter(e => (e.score ?? 0) > 0).sort((a, b) => b.score - a.score)
    .flatMap((e, rank) => e.id ? [{ id: e.id, name: e.name, points: rank === 0 ? 5 : rank === 1 ? 3 : rank === 2 ? 2 : 1 }] : [])
}
