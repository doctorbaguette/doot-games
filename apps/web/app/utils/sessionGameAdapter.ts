import type { LoadedGame, RoomRuntime } from '@doot-games/engine'
import type { DootRoom } from '@doot-games/engine/vue'
import type { GameComposition, GamePlugin, ScorePlayer } from '@doot-games/sdk'
import { buildAssignContent, buildDeriveContent, buildRevealSummary, buildTimerFor, gameAnswerKeys, gameRounds, getBlock, redactGameConfig, resolveComposition } from '@doot-games/games'

/** A standard composed game in an existing room; never creates a second runtime. */
export function buildSessionGame(plugin: GamePlugin, base: GameComposition, runtime: RoomRuntime, themeId: string, runId?: string): LoadedGame {
  if (plugin.components?.Host) throw new Error('Dieses Spiel benötigt einen eigenen Session-Adapter.')
  const config = resolveComposition(plugin, base, runId ? `${runtime.room}:${runId}` : runtime.room)
  const players = (): ScorePlayer[] => runtime.recentPlayers().map(p => ({ id: p.id, name: p.name, joinedAtIndex: p.joinedAtIndex, team: p.team }))
  return {
    meta: { pluginId: plugin.manifest.id, pluginVersion: plugin.manifest.version, title: config.title || plugin.manifest.name, themeId, ...(runId ? { sessionRunId: runId } : {}) },
    config: config as unknown as LoadedGame['config'],
    publishConfig: redactGameConfig(plugin, config) as unknown as LoadedGame['config'],
    rounds: gameRounds(plugin, config),
    resumable: config.rounds.every(inst => {
      const b = getBlock(plugin, inst.block)
      return !b?.derive && !b?.assignContent && !inst.fromShares
    }),
    timerFor: buildTimerFor(plugin, config) as LoadedGame['timerFor'],
    answerKeys: gameAnswerKeys(plugin, config) as LoadedGame['answerKeys'],
    deriveContent: buildDeriveContent(plugin, config, runtime.room, players, i => runtime.answerKeyFor(i)) as LoadedGame['deriveContent'],
    assignContent: buildAssignContent(plugin, config, runtime.room, players, i => runtime.answerKeyFor(i)) as LoadedGame['assignContent'],
    revealSummary: buildRevealSummary(plugin, config, players, i => runtime.runtimeContentFor(i), i => runtime.answerKeyFor(i),
      i => runtime.getSnapshot().meta?.crowdCounts ? runtime.audienceVotesFor(i) : new Map()) as LoadedGame['revealSummary'],
  }
}

/** Scope legacy /x/ game channels without changing any game code. Raw session
 * channels stay outside this provider. Dispose before starting another run. */
export function createSessionGameScope(base: DootRoom, runId: string) {
  const prefix = `session-runs/${runId}/`
  const subscriptions = new Set<() => void>()
  const written = new Set<string>()
  let disposed = false
  const current = () => !disposed && base.meta.value?.sessionRunId === runId
  const room: DootRoom = {
    ...base,
    submit(value) { if (current()) base.submit(value) },
    publishExtra(key, value) {
      if (!current()) return
      written.add(prefix + key)
      base.publishExtra(prefix + key, value)
    },
    onExtra(pattern, callback) {
      const off = base.onExtra(prefix + pattern, (value, key) => {
        if (!current()) return
        written.add(key)
        callback(value, key.slice(prefix.length))
      })
      subscriptions.add(off)
      return () => { off(); subscriptions.delete(off) }
    },
  }
  return {
    room,
    dispose(clear = false) {
      if (disposed) return
      disposed = true
      for (const off of subscriptions) off()
      subscriptions.clear()
      // Only the host cleans retained requests; a phone leaving must not erase a tip.
      if (clear && base.isHost.value) for (const key of written) base.publishExtra(key, null)
      written.clear()
    },
  }
}
