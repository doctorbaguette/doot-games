
import { BASE_POINTS } from '../scoring'

export function scoreExternalDuel(
  playerA: string,
  playerB: string,
  winnerId: string,
  winPoints = BASE_POINTS,
): Map<string, number> {
  if (!playerA || !playerB || playerA === playerB) {
    throw new Error('Two different players are required')
  }

  if (winnerId !== playerA && winnerId !== playerB) {
    throw new Error('Winner must be one of the participants')
  }

  if (!Number.isSafeInteger(winPoints) || winPoints < 0) {
    throw new Error('Points must be a non-negative integer')
  }

  return new Map([
    [playerA, winnerId === playerA ? winPoints : 0],
    [playerB, winnerId === playerB ? winPoints : 0],
  ])
}
