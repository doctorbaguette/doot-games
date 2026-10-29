import { afterEach, describe, expect, it } from 'vitest'
import { RoomRuntime, addr, type RelayCallback, type RelayClient, type RelayValue } from '@doot-games/engine'
import type { DootRoom } from '@doot-games/engine/vue'
import type { GameComposition } from '@doot-games/sdk'
import { scoreGame } from '@doot-games/games'
import { BIRTHDAY_BOARD_CHANNEL, birthdayBoardSchema, finishBirthdayCell, newBirthdayBoard, startBirthdayCell, type BirthdayBoardState } from './birthdayBoard'
import { birthdayGame } from './birthdayBoardGames'
import { buildSessionGame, createSessionGameScope } from './sessionGameAdapter'
import { acceptBetRequest, confirmMatch, createTournament, currentMatch, openBetting, startMatch, tournamentSchema } from '../../../../packages/games/src/blocks/external-challenge/tournament'
import { betChannel } from '../../../../packages/games/src/blocks/external-challenge/betting'

class Hub {
  values = new Map<string, RelayValue>()
  subs = new Set<{ pattern: string; callback: RelayCallback }>()
  matches(pattern: string, key: string) { const p = pattern.split('/'), k = key.split('/'); return p.length === k.length && p.every((s, i) => s === '*' || s === k[i]) }
  set(key: string, value: RelayValue, retained = true) {
    if (retained) this.values.set(key, value)
    for (const s of this.subs) if (this.matches(s.pattern, key)) s.callback(value, key)
  }
  on(pattern: string, callback: RelayCallback) {
    const sub = { pattern, callback }; this.subs.add(sub)
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
function make(hub: Hub, role: 'host' | 'player', name?: string) {
  const runtime = new RoomRuntime({ relay: new Relay(hub), room: 'BORD', role, name, hostToken: role === 'host' ? 'board-token' : undefined, now: () => 1000 })
  runtimes.push(runtime); return runtime
}
function binding(runtime: RoomRuntime): DootRoom {
  return {
    meta: { get value() { return runtime.getSnapshot().meta } },
    isHost: { get value() { return runtime.getSnapshot().me.role === 'host' } },
    submit: (v: RelayValue) => runtime.submit(v),
    publishExtra: (k: string, v: RelayValue) => runtime.publishExtra(k, v),
    onExtra: (k: string, cb: (v: RelayValue, key: string) => void) => runtime.onExtra(k, cb),
  } as unknown as DootRoom
}

describe('Birthday board on the existing Doot room', () => {
  it('plays VERSUS with bets, quiz and draw/vote while keeping four identities and the public board', async () => {
    const hub = new Hub(), host = make(hub, 'host')
    await host.connect()
    const phones = ['Alice', 'Bob', 'Cara', 'Dan'].map(name => make(hub, 'player', name))
    await Promise.all(phones.map(p => p.connect())); await flush()
    const identities = phones.map(p => p.getSnapshot().me.id)
    const roster = host.recentPlayers().map(p => ({ id: p.id, name: p.name, joinedAtIndex: p.joinedAtIndex }))
    expect(roster).toHaveLength(4)
    let state = newBirthdayBoard()
    const publicStates = new Map<RoomRuntime, BirthdayBoardState>()
    for (const p of phones) p.onExtra(BIRTHDAY_BOARD_CHANNEL, v => { publicStates.set(p, birthdayBoardSchema.parse(v)) })
    const publishBoard = () => host.publishExtra(BIRTHDAY_BOARD_CHANNEL, state as unknown as RelayValue)
    publishBoard()
    for (const [sequence, cell] of ['versus', 'brains', 'draw'].entries()) {
      const cellId = cell as 'versus' | 'brains' | 'draw'
      state = startBirthdayCell(state, cellId, `run-${sequence}`)
      const { plugin, config } = birthdayGame(cellId)
      const loaded = buildSessionGame(plugin, config, host, 'doot', state.active!.runId)
      host.nextGame(loaded); publishBoard()
      const hostScope = createSessionGameScope(binding(host), state.active!.runId)
      const phoneScopes = phones.map(p => createSessionGameScope(binding(p), state.active!.runId))
      expect(host.inputsFor(0).size).toBe(0)
      expect(host.runtimeContentFor(0)).toBeUndefined()
      expect(phones.map(p => p.getSnapshot().me.id)).toEqual(identities)
      if (cellId === 'versus') {
        expect(plugin.components?.Host).toBeUndefined()
        const read = () => tournamentSchema.parse((host.runtimeContentFor(0) as unknown as { tournament: unknown }).tournament)
        const write = (t: ReturnType<typeof read>) => host.setRoundContent({ title: 'Nidhogg', description: '', tournament: t } as unknown as RelayValue)
        write(openBetting(createTournament(roster), roster))
        hostScope.room.onExtra(betChannel(0, '*', '*'), (value, key) => {
          const t = read(), next = acceptBetRequest(t, 0, key, value)
          if (next !== t) write(next)
        })
        host.openVoting()
        for (let match = 0; match < 3; match++) {
          const t = read(), m = currentMatch(t)!
          for (const [i, p] of phones.entries()) if (!m.slots.includes(p.getSnapshot().me.id)) {
            phoneScopes[i]!.room.publishExtra(betChannel(0, m.betting!.id, p.getSnapshot().me.id), { pickId: m.slots[0]! })
          }
          expect(currentMatch(read())!.betting!.picks).toHaveLength(2)
          write(openBetting(confirmMatch(startMatch(read(), m.id), m.id, m.slots[0]!), roster))
        }
        host.lock(); host.reveal()
      } else if (cellId === 'brains') {
        expect((hub.values.get(addr.config('BORD')) as unknown as GameComposition).rounds[0]!.content).toMatchObject({ correct: -1 })
        host.openVoting()
        for (const scope of phoneScopes) scope.room.submit({ choice: 1 })
        host.lock(); host.reveal()
      } else {
        host.openVoting()
        for (const [i, scope] of phoneScopes.entries()) scope.room.submit({ strokes: [{ color: '#000000', size: .01, points: [{ x: .1, y: .1 }, { x: .5, y: .3 + i * .1 }] }] })
        host.lock(); host.reveal(); host.next()
        const gallery = host.runtimeContentFor(1) as { options: Array<{ id: string }> }
        expect(gallery.options).toHaveLength(4)
        const answer = host.answerKeyFor(1) as { authors: Record<string, string> }
        host.openVoting()
        for (const [i, scope] of phoneScopes.entries()) {
          const choice = gallery.options.find(o => answer.authors[o.id] !== identities[i])!.id
          scope.room.submit({ choice })
        }
        host.lock(); host.reveal()
      }
      const effective = { ...loaded.config as unknown as GameComposition,
        rounds: (loaded.config as unknown as GameComposition).rounds.map((r, i) => ({ ...r, content: host.runtimeContentFor(i) ?? r.content })) }
      const results = scoreGame(plugin, effective, { players: roster, inputsFor: i => host.inputsFor(i), answerKeys: Object.fromEntries(effective.rounds.map((_, i) => [i, host.answerKeyFor(i)])) })
      expect(results.leaderboard?.length).toBeGreaterThan(0)
      await host.finish(results as unknown as RelayValue)
      const runId = state.active!.runId
      state = finishBirthdayCell(state, runId, results)
      hostScope.dispose(true)
      for (const scope of phoneScopes) scope.dispose()
      publishBoard(); await flush()
      for (const p of phones) expect(publicStates.get(p)).toEqual(state)
      expect(state.completed).toHaveLength(sequence + 1)
      expect(() => startBirthdayCell(state, cellId)).toThrow()
      if (cellId === 'versus') {
        expect(results.leaderboard!.reduce((sum, e) => sum + e.score, 0)).toBe(4800)
        const requests = [...hub.values].filter(([key]) => key.includes(`session-runs/${runId}/`))
        expect(requests.length).toBeGreaterThan(0)
        expect(requests.every(([, value]) => value === null)).toBe(true)
      }
    }
    expect(phones.map(p => p.getSnapshot().me.id)).toEqual(identities)
    expect(state.completed.map(c => c.cellId)).toEqual(['versus', 'brains', 'draw'])
    expect(birthdayBoardSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })
})
