import { createSSRApp, h, ref, type ComponentInternalInstance } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { DOOT_ROOM_KEY, type DootRoom } from '@doot-games/engine/vue'
import { describe, expect, it, vi } from 'vitest'
import BettingPanel from './BettingPanel.vue'
import { betChannel } from './betting'
import { confirmMatch, createTournament, currentMatch, openBetting, recordBet, startMatch, type Tournament } from './tournament'

const players = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `Spieler ${i}` }))
const tournament = () => openBetting(createTournament(players, () => .5), players, () => 'test-window')
async function render(t: Tournament, id: string, role = 'player') {
  const publish = vi.fn()
  const room = {
    me: ref({ id, role }), phase: ref('active'), round: ref({ index: 0 }), publishExtra: publish,
  } as unknown as DootRoom
  let instance: ComponentInternalInstance | undefined
  const app = createSSRApp({ render: () => h(BettingPanel, { tournament: t }) })
  app.provide(DOOT_ROOM_KEY, room)
  app.mixin({ created() { if (this.$.type === BettingPanel) instance = this.$ } })
  const html = await renderToString(app)
  const controls = (instance as unknown as { setupState: { placeBet: (id: string) => void } }).setupState
  return { html, publish, controls }
}

describe('phone betting UI', () => {
  it('sends the selected contestant on the current window and own identity channel', async () => {
    const t = tournament(), m = currentMatch(t)!, bettor = m.betting!.eligible[0]!.id
    const ui = await render(t, bettor)
    expect(ui.html).toContain('Wer gewinnt dieses Duell?')
    expect(ui.html).toContain('300 Punkte')
    ui.controls.placeBet(m.slots[0]!)
    ui.controls.placeBet(m.slots[1]!)
    expect(ui.publish).toHaveBeenNthCalledWith(1, betChannel(0, 'test-window', bettor), { pickId: m.slots[0] })
    expect(ui.publish).toHaveBeenNthCalledWith(2, betChannel(0, 'test-window', bettor), { pickId: m.slots[1] })
  })
  it('shows the host-acknowledged pick after a phone refresh and blocks changes once running', async () => {
    let t = tournament()
    const m = currentMatch(t)!, bettor = m.betting!.eligible[0]!.id
    t = recordBet(t, 'test-window', bettor, m.slots[0]!)
    const restored = await render(JSON.parse(JSON.stringify(t)), bettor)
    expect(restored.html).toContain('Dein gespeicherter Tipp:')
    expect(restored.html).toContain('aria-pressed="true"')
    const locked = await render(startMatch(t, m.id), bettor)
    expect(locked.html).toContain('Tipps sind gesperrt')
    expect(locked.html).toContain('disabled')
    locked.controls.placeBet(m.slots[1]!)
    expect(locked.publish).not.toHaveBeenCalled()
  })
  it('blocks active contestants, the host and non-player audience roles even when invoking the handler', async () => {
    const t = tournament(), m = currentMatch(t)!
    for (const [id, role] of [[m.slots[0]!, 'player'], [m.betting!.eligible[0]!.id, 'host'], [m.betting!.eligible[0]!.id, 'audience']]) {
      const ui = await render(t, id!, role)
      ui.controls.placeBet(m.slots[0]!)
      expect(ui.publish).not.toHaveBeenCalled()
      expect(ui.html).not.toContain('aria-pressed')
    }
  })
  it('reveals the distribution, successful bettor names and personal reward after confirmation', async () => {
    let t = tournament()
    const m = currentMatch(t)!, bettor = m.betting!.eligible[0]!
    t = recordBet(t, 'test-window', bettor.id, m.slots[0]!)
    t = confirmMatch(startMatch(t, m.id), m.id, m.slots[0]!)
    const ui = await render(t, bettor.id)
    expect(ui.html).toContain('Wettauswertung')
    expect(ui.html).toContain('1 Tipp')
    expect(ui.html).toContain('0 Tipps')
    expect(ui.html).toContain(bettor.name)
    expect(ui.html).toContain('Dein Tipp war richtig: +300 Punkte!')
  })
})
