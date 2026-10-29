import { describe, expect, it } from 'vitest'
import type { GameComposition } from '@doot-games/sdk'
import { externalChallenge } from '../../games/external-challenge'
import { scoreGame } from '../../runtime/derive'
import { duelSchema, externalChallengeBlock } from './block'
import { confirmMatch, createTournament, currentMatch, startMatch, tournamentScores } from './tournament'

const duel = {
  playerA: 'a', playerB: 'b', nameA: 'Alice', nameB: 'Bob',
  winnerId: 'a', confirmed: true,
}

function score(duels: unknown[]) {
  const config: GameComposition = {
    title: 'Duels',
    rounds: duels.map(duel => ({ block: 'external-challenge', content: { title: 'Duell', duel } })),
  }
  return scoreGame(externalChallenge, config, {
    players: [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Charlie' }],
    inputsFor: () => new Map(), answerKeys: {},
  })
}

describe('External Challenge block', () => {
  it('scores the tournament through scoreGame and ignores legacy duel data when a tournament exists', () => {
    let tournament = createTournament([{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }])
    const match = currentMatch(tournament)!
    tournament = confirmMatch(startMatch(tournament, match.id), match.id, 'b')
    const result = scoreGame(externalChallenge, {
      title: 'Tournament',
      rounds: [{ block: 'external-challenge', content: { tournament, duel } }],
    }, { players: [], inputsFor: () => new Map(), answerKeys: {} })
    expect(result.leaderboard).toEqual([
      { id: 'b', name: 'Bob', score: 1000 }, { id: 'a', name: 'Alice', score: 0 },
    ])
    expect([...tournamentScores(tournament).values()].reduce((a, b) => a + b)).toBe(1000)
  })
  it('uses the solo flow without a timer or phone submissions', () => {
    expect(externalChallengeBlock.solo).toBe(true)
    expect(externalChallengeBlock.timerOf?.(externalChallengeBlock.defaultContent())).toBeNull()
  })

  it('feeds confirmed host results into normal game scoring by participant ID', () => {
    expect(score([duel]).leaderboard).toEqual([
      { id: 'a', name: 'Alice', score: 1000 },
      { id: 'b', name: 'Bob', score: 0 },
    ])
  })

  it('sums several duels without awarding points to spectators', () => {
    expect(score([duel, duel, { ...duel, winnerId: 'b' }]).leaderboard).toEqual([
      { id: 'a', name: 'Alice', score: 2000 },
      { id: 'b', name: 'Bob', score: 1000 },
    ])
  })

  it.each([
    undefined,
    { ...duel, confirmed: false },
    { ...duel, winnerId: null },
    { ...duel, winnerId: 'c' },
    { ...duel, winnerId: '' },
    { ...duel, playerB: 'a' },
  ])('ignores incomplete or invalid results: %j', invalid => {
    expect(score([invalid]).leaderboard ?? []).toEqual([])
  })

  it('retains the selected names when duel participants have disconnected', () => {
    const result = externalChallengeBlock.aggregate!({
      rounds: [{ index: 0, content: { title: 'Duell', description: '', duel } }],
      players: [], inputsFor: () => new Map(), answerFor: () => undefined,
    })
    expect(result.leaderboard?.map(p => p.name)).toEqual(['Alice', 'Bob'])
  })

  it('allows choosing a winner before confirmation', () => {
    expect(duelSchema.safeParse({ ...duel, confirmed: false }).success).toBe(true)
    expect(duelSchema.safeParse({ ...duel, winnerId: null, confirmed: false }).success).toBe(true)
  })
})
