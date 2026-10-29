import { afterEach, describe, expect, it } from 'vitest'
import { RoomRuntime, type RelayCallback, type RelayClient, type RelayValue } from '@doot-games/engine'
import { betChannel } from './betting'
import { acceptBetRequest, confirmMatch, correctWinner, createTournament, currentMatch, openBetting, startMatch, tournamentSchema, tournamentScores, type Tournament } from './tournament'
import type { ExternalChallengeContent } from './block'

class Hub {
  values = new Map<string, RelayValue>()
  subs = new Set<{ pattern: string; callback: RelayCallback }>()
  matches(pattern: string, key: string) {
    const p = pattern.split('/'), k = key.split('/')
    return p.length === k.length && p.every((s, i) => s === '*' || s === k[i])
  }
  set(key: string, value: RelayValue, retain = true) {
    if (retain) this.values.set(key, value)
    for (const sub of this.subs) if (this.matches(sub.pattern, key)) sub.callback(value, key)
  }
  on(pattern: string, callback: RelayCallback) {
    const sub = { pattern, callback }
    this.subs.add(sub)
    for (const [key, value] of this.values) if (this.matches(pattern, key)) callback(value, key)
    return () => { this.subs.delete(sub) }
  }
}
class Relay implements RelayClient {
  connected = false
  callbacks: Array<() => void> = []
  constructor(private hub: Hub) {}
  async connect() { this.connected = true; for (const callback of this.callbacks) callback() }
  on(pattern: string, callback: RelayCallback) { return this.hub.on(pattern, callback) }
  set(key: string, value: RelayValue) { this.hub.set(key, value) }
  emit(key: string, value: RelayValue = 1) { this.hub.set(key, value, false) }
  cached(key: string) { return this.hub.values.get(key) }
  async get(key: string) { return this.hub.values.get(key) as RelayValue }
  onConnect(callback: () => void) { this.callbacks.push(callback) }
  onDisconnect() {} onReconnect() {} onError() {} close() {}
}
const runtimes: RoomRuntime[] = []
afterEach(() => { for (const runtime of runtimes.splice(0)) runtime.dispose() })
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const game = {
  meta: { pluginId: 'external-challenge', pluginVersion: '0.1.0', title: 'Bets', themeId: 'doot' },
  config: { title: 'Bets', rounds: [{ block: 'external-challenge', content: { title: 'Duell', description: '' } }] },
  rounds: [{ timer: null }], resumable: true,
}
function runtime(hub: Hub, role: 'host' | 'player', name?: string) {
  const r = new RoomRuntime({ relay: new Relay(hub), room: 'BETS', role, name, hostToken: role === 'host' ? 'bet-host' : undefined, now: () => 1000 })
  runtimes.push(r)
  return r
}
const read = (r: RoomRuntime) => tournamentSchema.parse((r.runtimeContentFor(0) as unknown as ExternalChallengeContent).tournament)
const write = (r: RoomRuntime, tournament: Tournament) => r.setRoundContent({ title: 'Duell', description: '', tournament } as unknown as RelayValue)
function listen(host: RoomRuntime) {
  host.onExtra(betChannel(0, '*', '*'), (value, key) => {
    const t = read(host)
    const next = acceptBetRequest(t, 0, key, value)
    if (next !== t) write(host, next)
  })
}
const id = (r: RoomRuntime) => r.getSnapshot().me.id

describe('spectator bets over the Doot relay', () => {
  it('syncs changing bets, restores a host, locks tips at start and recomputes corrected results', async () => {
    const hub = new Hub()
    let host = runtime(hub, 'host')
    host.loadGame(game)
    await host.connect()
    const phones = ['Alice', 'Bob', 'Cara', 'Dan'].map(name => runtime(hub, 'player', name))
    await Promise.all(phones.map(phone => phone.connect()))
    await flush()
    const roster = host.recentPlayers().map(p => ({ id: p.id, name: p.name }))
    expect(roster).toHaveLength(4)
    host.start()
    host.openVoting()
    write(host, openBetting(createTournament(roster, () => .5), roster, () => 'first-window'))
    listen(host)
    const m = currentMatch(read(host))!
    const bettors = phones.filter(phone => !m.slots.includes(id(phone)))
    const active = phones.find(phone => m.slots.includes(id(phone)))!
    // An active player's request is rejected even if it bypasses the phone UI.
    active.publishExtra(betChannel(0, m.betting!.id, id(active)), { pickId: m.slots[0]! })
    expect(currentMatch(read(host))!.betting!.picks).toHaveLength(0)
    const [a, b] = bettors as [RoomRuntime, RoomRuntime]
    a.publishExtra(betChannel(0, m.betting!.id, id(a)), { pickId: m.slots[1]! })
    a.publishExtra(betChannel(0, m.betting!.id, id(a)), { pickId: m.slots[0]! })
    b.publishExtra(betChannel(0, m.betting!.id, id(b)), { pickId: m.slots[1]! })
    await flush()
    const beforeRefresh = read(host)
    for (const phone of phones) expect(read(phone)).toEqual(beforeRefresh)
    host.dispose()
    host = runtime(hub, 'host')
    const connection = host.connect()
    host.loadGame(game)
    await connection
    expect(read(host)).toEqual(beforeRefresh)
    listen(host) // Retained requests replay idempotently.
    expect(read(host)).toEqual(beforeRefresh)
    write(host, startMatch(read(host), m.id))
    b.publishExtra(betChannel(0, m.betting!.id, id(b)), { pickId: m.slots[0]! })
    await flush()
    expect(currentMatch(read(host))!.betting!.picks.find(p => p.playerId === id(b))!.pickId).toBe(m.slots[1])
    // Refresh while running must also ignore a retained late change.
    const locked = read(host)
    host.dispose()
    host = runtime(hub, 'host')
    const reconnect = host.connect()
    host.loadGame(game)
    await reconnect
    listen(host)
    expect(read(host)).toEqual(locked)
    expect(() => a.setRoundContent({ winnerId: 'forged' })).toThrow()
    write(host, confirmMatch(read(host), m.id, m.slots[0]!))
    await flush()
    expect(tournamentScores(read(host)).get(id(a))).toBe(300)
    expect(tournamentScores(read(host)).get(id(b))).toBe(0)
    for (const phone of phones) expect(read(phone)).toEqual(read(host))
    write(host, correctWinner(read(host), m.id, m.slots[1]!))
    await flush()
    expect(tournamentScores(read(host)).get(id(a))).toBe(0)
    expect(tournamentScores(read(host)).get(id(b))).toBe(300)
    expect([...tournamentScores(read(host)).values()].reduce((a, b) => a + b)).toBe(1300)
  })
})
