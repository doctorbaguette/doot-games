import { createSSRApp, defineComponent, h, ref, type Component, type ComponentInternalInstance } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { DOOT_ROOM_KEY, type DootRoom } from '@doot-games/engine/vue'
import { describe, expect, it, vi } from 'vitest'
import ChallengeHost from './ChallengeHost.vue'
import ChallengePlayer from './ChallengePlayer.vue'
import type { ExternalChallengeContent } from './block'
import { bracket, champion, currentMatch, tournamentScores } from './tournament'
import { betChannel } from './betting'

interface Controls {
  create: () => void; start: () => void; confirm: () => void; finish: () => void
  requestCorrection: () => void; approve: () => void
  receiveBet: (value: unknown, key: string) => void
  winner: string; correctionId: string; correctionWinner: string
  pending: { kind: 'reset' } | null; error: string
}

async function mount(count = 4, view: Component = ChallengeHost, isHost = true) {
  const content = ref<ExternalChallengeContent>({ title: 'Nidhogg', description: 'Turnier' })
  const players = ref(Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Spieler ${i}`, joinedAtIndex: 0 })))
  const round = ref({ index: 0, state: 'open' })
  const publish = vi.fn((value: ExternalChallengeContent) => { content.value = value })
  const room = {
    isHost: ref(isHost), phase: ref('active'), round, players, me: ref({ id: 'p0' }),
    runtimeContentFor: () => content.value,
    host: {
      setRoundContent: publish,
      can: (action: string) => ({ open: 'ready', lock: 'open', reveal: 'locked' })[action] === round.value.state,
      openVoting: () => { round.value.state = 'open' },
      lock: () => { round.value.state = 'locked' },
      reveal: () => { round.value.state = 'reveal' },
    },
  } as unknown as DootRoom
  let instance: ComponentInternalInstance | undefined
  const app = createSSRApp(defineComponent({ setup: () => () => h(view, { content: content.value }) }))
  app.provide(DOOT_ROOM_KEY, room)
  app.mixin({ created() { if (this.$.type === view) instance = this.$ } })
  const html = await renderToString(app)
  // Inspect the real component handlers; SSR gives each view its usual injected room.
  const controls = (instance as unknown as { setupState: Controls }).setupState
  const sync = () => { instance!.props.content = content.value }
  const win = () => {
    sync(); controls.start(); sync()
    controls.winner = currentMatch(content.value.tournament!)!.slots[0]!
    controls.confirm(); sync()
  }
  return { html, content, players, round, publish, controls, sync, win }
}

describe('Tournament host and phone views', () => {
  it('accepts spectator requests only before start and scores the saved pick on confirmation', async () => {
    const ui = await mount()
    ui.controls.create(); ui.sync()
    const match = currentMatch(ui.content.value.tournament!)!
    const bettor = match.betting!.eligible[0]!
    const key = betChannel(0, match.betting!.id, bettor.id)
    ui.controls.receiveBet({ pickId: match.slots[0] }, key)
    ui.sync()
    expect(currentMatch(ui.content.value.tournament!)!.betting!.picks).toHaveLength(1)
    ui.controls.start(); ui.sync()
    ui.controls.receiveBet({ pickId: match.slots[1] }, key)
    expect(currentMatch(ui.content.value.tournament!)!.betting!.picks[0]!.pickId).toBe(match.slots[0])
    ui.controls.winner = match.slots[0]!
    ui.controls.confirm(); ui.sync()
    expect(tournamentScores(ui.content.value.tournament!).get(bettor.id)).toBe(300)
  })
  it('shows an understandable odd-player error instead of dropping a participant', async () => {
    const ui = await mount(3)
    ui.controls.create()
    expect(ui.controls.error).toContain('gerade Spielerzahl')
    expect(ui.publish).not.toHaveBeenCalled()
  })
  it('plays the tournament, blocks duplicate confirmations, confirms cascading corrections and reset', async () => {
    const ui = await mount()
    const c = ui.controls
    c.create(); ui.sync()
    const initial = ui.content.value.tournament!
    ui.players.value.push({ id: 'late', name: 'Später Spieler', joinedAtIndex: 0 })
    expect(ui.content.value.tournament!.players).toHaveLength(4)
    c.start(); ui.sync()
    c.winner = currentMatch(initial)!.slots[0]!
    c.confirm(); c.confirm(); ui.sync()
    expect(ui.content.value.tournament!.matches.filter(m => m.status === 'completed')).toHaveLength(1)
    ui.win(); ui.win()
    expect(champion(ui.content.value.tournament!)).toBeDefined()
    const first = bracket(ui.content.value.tournament!)[0]![0]!
    c.correctionId = first.id
    c.correctionWinner = first.slots[1]!
    c.requestCorrection()
    expect(c.pending).toMatchObject({ kind: 'correction' })
    expect(champion(ui.content.value.tournament!)).toBeDefined()
    c.pending = null // Cancel leaves all results intact.
    expect(champion(ui.content.value.tournament!)).toBeDefined()
    c.requestCorrection(); c.approve(); ui.sync()
    expect(champion(ui.content.value.tournament!)).toBeUndefined()
    expect([...tournamentScores(ui.content.value.tournament!).values()].reduce((a, b) => a + b)).toBe(2000)
    expect(ui.content.value.tournament!.seeds).toEqual(initial.seeds)
    c.pending = { kind: 'reset' }; c.pending = null
    expect(ui.content.value.tournament).toBeDefined()
    c.pending = { kind: 'reset' }; c.approve()
    expect(ui.content.value.tournament).toBeUndefined()
  })
  it('requires explicit tournament completion before Doot locks the round', async () => {
    const ui = await mount(2)
    ui.controls.create(); ui.sync(); ui.win()
    expect(ui.round.value.state).toBe('open')
    ui.controls.finish()
    expect(ui.round.value.state).toBe('reveal')
  })
  it('gives phones no result controls and also guards host handlers by role', async () => {
    const phone = await mount(2, ChallengePlayer, false)
    expect(phone.html).not.toContain('<select')
    expect(phone.html).toContain('Der Host erstellt')
    const notHost = await mount(2, ChallengeHost, false)
    expect(notHost.html).not.toContain('Turnier erstellen')
    notHost.controls.create()
    expect(notHost.publish).not.toHaveBeenCalled()
  })
})
