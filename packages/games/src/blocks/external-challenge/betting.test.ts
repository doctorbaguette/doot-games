import { describe, expect, it, vi } from 'vitest'
import { betChannel, betSummary } from './betting'
import { acceptBetRequest, bracket, confirmMatch, correctWinner, createTournament, currentMatch, openBetting, recordBet, startMatch, tournamentSchema, tournamentScores, type Tournament } from './tournament'
import { externalChallenge } from '../../games/external-challenge'
import { scoreGame } from '../../runtime/derive'

const lobby = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `Spieler ${i}` }))
const create = () => openBetting(createTournament(lobby, () => .5), lobby, () => 'window-1')
function win(t: Tournament): Tournament {
  const m = currentMatch(t)!
  return confirmMatch(startMatch(t, m.id), m.id, m.slots[0]!)
}

describe('spectator bets', () => {
  it('supports creating betting windows on an HTTP LAN host without randomUUID', () => {
    vi.stubGlobal('crypto', {})
    try {
      const t = openBetting(createTournament(lobby), lobby)
      expect(currentMatch(t)!.betting!.id.length).toBeGreaterThan(0)
    } finally { vi.unstubAllGlobals() }
  })
  it('adds several successful tips to the same player without double credit through scoreGame', () => {
    const spectator = { id: 'spectator', name: 'Zuschauer' }
    let t = createTournament(lobby)
    let sequence = 0
    while (currentMatch(t)) {
      t = openBetting(t, [spectator], () => `window-${sequence++}`)
      const m = currentMatch(t)!
      t = recordBet(t, m.betting!.id, spectator.id, m.slots[0]!)
      t = win(t)
    }
    const score = () => scoreGame(externalChallenge, {
      title: 'Bets', rounds: [{ block: 'external-challenge', content: { tournament: t } }],
    }, { players: [], inputsFor: () => new Map(), answerKeys: {} }).leaderboard?.find(p => p.id === spectator.id)?.score
    expect(score()).toBe(900)
    expect(score()).toBe(900)
    expect([...tournamentScores(t).values()].reduce((a, b) => a + b)).toBe(3900)
  })
  it('opens only the next regular match, with no windows for byes or later matches', () => {
    const t = openBetting(createTournament([...lobby, { id: 'p4', name: 'E' }, { id: 'p5', name: 'F' }]), lobby)
    expect(t.matches.filter(m => m.betting)).toHaveLength(1)
    expect(t.matches.filter(m => m.status === 'bye').every(m => !m.betting)).toBe(true)
    expect(currentMatch(t)!.betting).toBeDefined()
    expect(openBetting(t, lobby)).toBe(t)
    expect(openBetting(win(t), lobby).seeds).toEqual(t.seeds)
  })
  it('accepts one changeable pick per non-participating player and rejects self-bets', () => {
    const t = create()
    const m = currentMatch(t)!
    const id = m.betting!.id
    const bettor = m.betting!.eligible[0]!.id
    const first = recordBet(t, id, bettor, m.slots[0]!)
    const changed = recordBet(first, id, bettor, m.slots[1]!)
    expect(currentMatch(changed)!.betting!.picks).toEqual([{ playerId: bettor, pickId: m.slots[1] }])
    expect(recordBet(changed, id, bettor, m.slots[1]!)).toBe(changed)
    expect(recordBet(t, id, m.slots[0]!, m.slots[1]!)).toBe(t)
    expect(recordBet(t, id, 'unknown', m.slots[0]!)).toBe(t)
    expect(recordBet(t, id, bettor, 'unknown')).toBe(t)
    expect(currentMatch(t)!.betting!.picks).toEqual([])
  })
  it('freezes picks at start and awards 300 only on winner confirmation, alongside the 1000 duel points', () => {
    let t = create()
    const m = currentMatch(t)!
    const [right, wrong] = m.betting!.eligible
    t = recordBet(t, m.betting!.id, right!.id, m.slots[0]!)
    t = recordBet(t, m.betting!.id, wrong!.id, m.slots[1]!)
    const running = startMatch(t, m.id)
    expect(recordBet(running, m.betting!.id, wrong!.id, m.slots[0]!)).toBe(running)
    expect([...tournamentScores(running).values()]).toEqual([0, 0, 0, 0])
    const complete = confirmMatch(running, m.id, m.slots[0]!)
    expect(tournamentScores(complete).get(right!.id)).toBe(300)
    expect(tournamentScores(complete).get(wrong!.id)).toBe(0)
    expect(tournamentScores(complete).get(m.slots[0]!)).toBe(1000)
    expect(tournamentScores(complete).get(m.slots[1]!)).toBe(0)
    expect(tournamentScores(complete)).toEqual(tournamentScores(complete))
    expect(() => confirmMatch(complete, m.id, m.slots[0]!)).toThrow()
    expect(betSummary(bracket(complete)[0]![0]!)).toMatchObject({
      distribution: [{ id: m.slots[0], count: 1 }, { id: m.slots[1], count: 1 }],
      successful: [right],
    })
  })
  it('allows eliminated participants and newly joined lobby spectators to bet without changing the draw', () => {
    let t = win(win(create()))
    const seeds = [...t.seeds]
    const later = { id: 'later', name: 'Später Zuschauer' }
    t = openBetting(t, [...lobby, later], () => 'final-window')
    const final = currentMatch(t)!
    const loser = bracket(t)[0]![0]!.slots.find(id => id !== bracket(t)[0]![0]!.winnerId)!
    expect(final.betting!.eligible.some(p => p.id === loser)).toBe(true)
    t = recordBet(t, final.betting!.id, loser, final.slots[0]!)
    t = recordBet(t, final.betting!.id, later.id, final.slots[0]!)
    t = win(t)
    expect(t.seeds).toEqual(seeds)
    expect(t.players).toEqual(lobby)
    expect(tournamentScores(t).get(loser)).toBe(300)
    expect(tournamentScores(t).get(later.id)).toBe(300)
    const results = scoreGame(externalChallenge, {
      title: 'Bets', rounds: [{ block: 'external-challenge', content: { tournament: t } }],
    }, { players: [], inputsFor: () => new Map(), answerKeys: {} })
    expect(results.leaderboard?.find(p => p.id === later.id)).toEqual({ id: later.id, name: later.name, score: 300 })
  })
  it('includes a late player in an already-open betting window and retains accepted disconnected players', () => {
    const t = create()
    const later = { id: 'later', name: 'Later' }
    const extended = openBetting(t, [later])
    expect(currentMatch(extended)!.betting!.id).toBe('window-1')
    expect(currentMatch(extended)!.betting!.eligible).toContainEqual(later)
    expect(openBetting(extended, [])).toBe(extended)
  })
  it('recomputes bet points when correcting the same match, keeping its locked predictions', () => {
    let t = create()
    const m = currentMatch(t)!
    const [a, b] = m.betting!.eligible
    t = recordBet(t, m.betting!.id, a!.id, m.slots[0]!)
    t = recordBet(t, m.betting!.id, b!.id, m.slots[1]!)
    const complete = win(t)
    const corrected = correctWinner(complete, m.id, m.slots[1]!)
    expect(tournamentScores(corrected).get(a!.id)).toBe(0)
    expect(tournamentScores(corrected).get(b!.id)).toBe(300)
    expect(bracket(corrected)[0]![0]!.betting).toEqual(bracket(complete)[0]![0]!.betting)
    expect(betSummary(bracket(corrected)[0]![0]!).successful).toEqual([b])
    expect(tournamentScores(correctWinner(corrected, m.id, m.slots[0]!))).toEqual(tournamentScores(complete))
  })
  it('clears only dependent windows on a cascading correction; old requests cannot be replayed', () => {
    let t = win(win(create()))
    t = openBetting(t, lobby, () => 'old-final')
    const final = currentMatch(t)!
    const bettor = final.betting!.eligible[0]!.id
    t = recordBet(t, 'old-final', bettor, final.slots[0]!)
    t = win(t)
    const first = bracket(t)[0]![0]!
    const corrected = correctWinner(t, first.id, first.slots[1]!, true)
    expect(corrected.matches.at(-1)!.betting).toBeUndefined()
    expect([...tournamentScores(corrected).values()].reduce((a, b) => a + b)).toBe(2000)
    const reopened = openBetting(corrected, lobby, () => 'new-final')
    expect(recordBet(reopened, 'old-final', bettor, final.slots[0]!)).toBe(reopened)
    expect(currentMatch(reopened)!.betting!.picks).toEqual([])
    expect(tournamentSchema.safeParse(reopened).success).toBe(true)
  })
  it('retains open, locked and evaluated bets when restoring JSON without granting points twice', () => {
    let t = create()
    const m = currentMatch(t)!
    t = recordBet(t, m.betting!.id, m.betting!.eligible[0]!.id, m.slots[0]!)
    for (const state of [t, startMatch(t, m.id), win(t)]) {
      const restored = tournamentSchema.parse(JSON.parse(JSON.stringify(state)))
      expect(restored).toEqual(state)
      expect(tournamentScores(restored)).toEqual(tournamentScores(state))
      expect(recordBet(restored, 'old-window', 'p0', 'p1')).toBe(restored)
    }
  })
  it('rejects malformed requests, wrong rounds and forged payload identities or scores', () => {
    const t = create()
    const m = currentMatch(t)!
    const bettor = m.betting!.eligible[0]!.id
    const channel = betChannel(0, m.betting!.id, bettor)
    for (const value of [null, {}, { pickId: m.slots[0], playerId: 'fake' }, { pickId: m.slots[0], points: 9999 }]) {
      expect(acceptBetRequest(t, 0, channel, value)).toBe(t)
    }
    expect(acceptBetRequest(t, 1, channel, { pickId: m.slots[0] })).toBe(t)
    const accepted = acceptBetRequest(t, 0, channel, { pickId: m.slots[0] })
    expect(currentMatch(accepted)!.betting!.picks).toEqual([{ playerId: bettor, pickId: m.slots[0] }])
    const reset = openBetting(createTournament(lobby), lobby, () => 'new-tournament')
    expect(acceptBetRequest(reset, 0, channel, { pickId: m.slots[0] })).toBe(reset)
  })
  it('rejects corrupt stored bets: self-bets, duplicate identities and invalid contestants', () => {
    const t = create()
    const m = currentMatch(t)!
    for (const invalid of [
      { ...m.betting!, eligible: [...m.betting!.eligible, { id: m.slots[0]!, name: 'Active' }] },
      { ...m.betting!, picks: [{ playerId: m.betting!.eligible[0]!.id, pickId: 'fake' }] },
      { ...m.betting!, picks: Array(2).fill({ playerId: m.betting!.eligible[0]!.id, pickId: m.slots[0] }) },
    ]) {
      const forged = { ...t, matches: t.matches.map(match => match.id === m.id ? { ...match, betting: invalid } : match) }
      expect(tournamentSchema.safeParse(forged).success).toBe(false)
    }
  })
})
