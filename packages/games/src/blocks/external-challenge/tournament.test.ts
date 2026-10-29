import { describe, expect, it } from 'vitest'
import { bracket, champion, confirmMatch, correctWinner, createTournament, currentMatch, dependentMatches, startMatch, tournamentSchema, tournamentScores, type Tournament } from './tournament'

const players = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Spieler ${i}` }))
function rng(seed = 42) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
}
function winNext(t: Tournament): Tournament {
  const m = currentMatch(t)!
  return confirmMatch(startMatch(t, m.id), m.id, m.slots[0]!)
}
function finish(t: Tournament): Tournament {
  while (currentMatch(t)) t = winNext(t)
  return t
}

describe('External Challenge tournament', () => {
  it.each([0, 1, 3, 5, 7])('rejects %i participants with a clear error', count => {
    expect(() => createTournament(players(count))).toThrow(count < 2 ? /Mindestens 2/ : /gerade Spielerzahl/)
  })
  it('rejects duplicate IDs while allowing equal display names', () => {
    expect(() => createTournament([{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }])).toThrow(/eindeutige/)
    expect(createTournament([{ id: 'a', name: 'A' }, { id: 'b', name: 'A' }]).players).toHaveLength(2)
  })
  it.each([2, 4, 6, 8, 10, 12, 14, 16, 18, 32])('builds and plays a complete %i-player tree', count => {
    let t = createTournament(players(count), rng())
    const size = 2 ** Math.ceil(Math.log2(count))
    expect(t.seeds.filter(Boolean).sort()).toEqual(players(count).map(p => p.id).sort())
    expect(t.matches).toHaveLength(size - 1)
    expect(t.matches.filter(m => m.status === 'bye')).toHaveLength(size - count)
    expect([...tournamentScores(t).values()].every(score => score === 0)).toBe(true)
    expect(bracket(t)[0]!.every(m => m.slots.some(Boolean))).toBe(true)
    const rounds: number[] = []
    while (currentMatch(t)) {
      rounds.push(currentMatch(t)!.round)
      t = winNext(t)
      expect(tournamentSchema.safeParse(t).success).toBe(true)
    }
    expect(rounds).toEqual([...rounds].sort((a, b) => a - b))
    expect(t.matches.filter(m => m.status === 'completed')).toHaveLength(count - 1)
    expect(champion(t)).toBeDefined()
    expect([...tournamentScores(t).values()].reduce((a, b) => a + b, 0)).toBe((count - 1) * 1000)
  })
  it('uses injected randomness once for the draw and freezes roster and seeds', () => {
    const lobby = players(6)
    const t = createTournament(lobby, rng())
    expect(t.seeds).toEqual(createTournament(lobby, rng()).seeds)
    expect(t.seeds).not.toEqual(createTournament(lobby, rng(100)).seeds)
    const saved = JSON.stringify(t)
    lobby[0]!.name = 'Renamed'
    lobby.push({ id: 'late', name: 'Late' })
    const advanced = winNext(t)
    expect(JSON.stringify(t)).toBe(saved)
    expect(advanced.seeds).toEqual(t.seeds)
    expect(advanced.players).toEqual(t.players)
  })
  it('distributes byes across different players and positions over different draws', () => {
    const recipients = new Set<string>()
    const positions = new Set<string>()
    const random = rng(429)
    for (let i = 0; i < 100; i++) {
      const t = createTournament(players(6), random)
      for (const m of bracket(t)[0]!.filter(m => m.status === 'bye')) {
        recipients.add(m.winnerId!)
        positions.add(m.id)
      }
    }
    expect(recipients.size).toBe(6)
    expect(positions.size).toBe(4)
  })
  it('requires a running match and a participating winner, and rejects repeated confirmations', () => {
    const t = createTournament(players(4), rng())
    const m = currentMatch(t)!
    expect(() => confirmMatch(t, m.id, m.slots[0]!)).toThrow()
    expect(() => startMatch(t, 'r1-m0')).toThrow()
    const running = startMatch(t, m.id)
    expect(() => startMatch(running, m.id)).toThrow()
    expect(() => confirmMatch(running, m.id, 'outsider')).toThrow()
    const confirmed = confirmMatch(running, m.id, m.slots[0]!)
    expect(() => confirmMatch(confirmed, m.id, m.slots[0]!)).toThrow()
    expect(tournamentScores(confirmed).get(m.slots[0]!)).toBe(1000)
  })
  it('corrects an early result without touching independent matches or seeds', () => {
    const t = winNext(createTournament(players(4), rng()))
    const first = bracket(t)[0]![0]!
    const corrected = correctWinner(t, first.id, first.slots[1]!)
    expect(tournamentScores(corrected).get(first.slots[0]!)).toBe(0)
    expect(tournamentScores(corrected).get(first.slots[1]!)).toBe(1000)
    expect(corrected.matches[1]).toEqual(t.matches[1])
    expect(corrected.seeds).toEqual(t.seeds)
    expect(bracket(corrected)[1]![0]!.slots[0]).toBe(first.slots[1])
    expect(correctWinner(corrected, first.id, first.slots[1]!)).toBe(corrected)
  })
  it('requires explicit approval before resetting running descendants', () => {
    let t = createTournament(players(4), rng())
    t = winNext(winNext(t))
    t = startMatch(t, currentMatch(t)!.id)
    const first = bracket(t)[0]![0]!
    expect(() => correctWinner(t, first.id, first.slots[1]!)).toThrow(/ausdrücklich/)
    const corrected = correctWinner(t, first.id, first.slots[1]!, true)
    expect(corrected.matches[2]!.status).toBe('pending')
    expect(tournamentSchema.safeParse(corrected).success).toBe(true)
  })
  it('resets only dependent results and their points, then can finish again', () => {
    const t = finish(createTournament(players(8), rng()))
    const first = bracket(t)[0]![0]!
    const affected = dependentMatches(t, first.id)
    expect(affected).toHaveLength(2)
    expect(() => correctWinner(t, first.id, first.slots[1]!)).toThrow(/ausdrücklich/)
    const corrected = correctWinner(t, first.id, first.slots[1]!, true)
    expect(champion(corrected)).toBeUndefined()
    for (const m of corrected.matches) {
      if (affected.some(d => d.id === m.id)) expect(m).toMatchObject({ status: 'pending', winnerId: null })
      else if (m.id !== first.id) expect(m).toEqual(t.matches.find(old => old.id === m.id))
    }
    expect([...tournamentScores(corrected).values()].reduce((a, b) => a + b, 0)).toBe(5000)
    expect(tournamentSchema.safeParse(corrected).success).toBe(true)
    expect(champion(finish(corrected))).toBeDefined()
  })
  it('corrects the final without erasing earlier wins or adding a champion bonus', () => {
    const t = finish(createTournament(players(4), rng()))
    const final = bracket(t)[1]![0]!
    const corrected = correctWinner(t, final.id, final.slots[1]!)
    expect(champion(corrected)?.id).toBe(final.slots[1])
    expect([...tournamentScores(corrected).values()].sort()).toEqual([0, 0, 1000, 2000])
    expect(corrected.matches.slice(0, 2)).toEqual(t.matches.slice(0, 2))
  })
  it('restores pending, running and completed states without redrawing', () => {
    const initial = createTournament(players(6), rng())
    const played = winNext(initial)
    const running = startMatch(played, currentMatch(played)!.id)
    for (const t of [initial, running, finish(initial)]) {
      const restored = tournamentSchema.parse(JSON.parse(JSON.stringify(t)))
      expect(restored).toEqual(t)
      expect(currentMatch(restored)).toEqual(currentMatch(t))
      expect(tournamentScores(restored)).toEqual(tournamentScores(t))
    }
  })
  it('rejects corrupt restored trees and fabricated winners', () => {
    const t = createTournament(players(4), rng())
    expect(tournamentSchema.safeParse({ ...t, seeds: ['p0', 'p0', 'p2', 'p3'] }).success).toBe(false)
    expect(tournamentSchema.safeParse({ ...t, matches: t.matches.slice(1) }).success).toBe(false)
    const forged = JSON.parse(JSON.stringify(t)) as Tournament
    forged.matches[2] = { id: 'r1-m0', status: 'completed', winnerId: 'outsider' }
    expect(tournamentSchema.safeParse(forged).success).toBe(false)
  })
})
