import { computed, shallowRef } from 'vue'
import type { DootRoom } from '@doot-games/engine/vue'
import type { RoomRuntime } from '@doot-games/engine'
import { resolveComposition } from '@doot-games/games'
import { describe, expect, it, vi } from 'vitest'
import { buildSessionGame, createSessionGameScope } from './sessionGameAdapter'
import { birthdayGame } from './birthdayBoardGames'

describe('session game scope', () => {
  it('keeps the legacy linear-session seed and rejects unsupported full Host plugins', () => {
    const runtime = { room: 'BORD', recentPlayers: () => [] } as unknown as RoomRuntime
    const { plugin, config } = birthdayGame('brains')
    const loaded = buildSessionGame(plugin, config, runtime, 'doot')
    expect(loaded.config).toEqual(resolveComposition(plugin, config, 'BORD'))
    expect(loaded.meta.sessionRunId).toBeUndefined()
    expect(loaded.resumable).toBe(true)
    expect(() => buildSessionGame({ ...plugin, components: { Host: {} } }, config, runtime, 'doot')).toThrow(/eigenen Session-Adapter/)
  })
  it('isolates legacy channels per run, translates keys, unsubscribes and clears only the finished namespace', () => {
    const meta = shallowRef({ sessionRunId: 'first' })
    const publish = vi.fn(), submit = vi.fn(), off = vi.fn()
    let receive: (value: never, key: string) => void = () => {}
    const subscribe = vi.fn((_key, callback) => { receive = callback; return off })
    const base = { meta: computed(() => meta.value), isHost: shallowRef(true), onExtra: subscribe, publishExtra: publish, submit } as unknown as DootRoom
    const first = createSessionGameScope(base, 'first')
    const callback = vi.fn()
    first.room.onExtra('external-challenge/bets/0/*/*', callback)
    expect(subscribe.mock.calls[0]![0]).toBe('session-runs/first/external-challenge/bets/0/*/*')
    receive({ pickId: 'a' } as never, 'session-runs/first/external-challenge/bets/0/window/b')
    expect(callback).toHaveBeenCalledWith({ pickId: 'a' }, 'external-challenge/bets/0/window/b')
    first.room.publishExtra('show', { step: 1 })
    first.room.submit({ choice: 1 })
    expect(submit).toHaveBeenCalledTimes(1)
    meta.value = { sessionRunId: 'second' }
    receive({ pickId: 'b' } as never, 'session-runs/first/external-challenge/bets/0/window/b')
    first.room.publishExtra('show', { step: 2 })
    first.room.submit({ choice: 2 })
    expect(callback).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledTimes(1)
    first.dispose(true)
    expect(off).toHaveBeenCalledOnce()
    expect(publish).toHaveBeenCalledWith('session-runs/first/show', null)
    expect(publish).toHaveBeenCalledWith('session-runs/first/external-challenge/bets/0/window/b', null)
    const second = createSessionGameScope(base, 'second')
    second.room.publishExtra('show', { step: 3 })
    expect(publish).toHaveBeenLastCalledWith('session-runs/second/show', { step: 3 })
    second.dispose()
  })
  it('does not delete another player’s retained messages when a phone disconnects', () => {
    const publish = vi.fn()
    const base = { meta: shallowRef({ sessionRunId: 'run' }), isHost: shallowRef(false), publishExtra: publish } as unknown as DootRoom
    const scope = createSessionGameScope(base, 'run')
    scope.room.publishExtra('bet', { pickId: 'a' })
    scope.dispose(true)
    expect(publish).toHaveBeenCalledTimes(1)
  })
})
