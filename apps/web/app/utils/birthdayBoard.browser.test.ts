import { describe, expect, it } from 'vitest'
import { chromium, type Page } from 'playwright'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Opt-in: real browser + public CLASP relay; start the local Nuxt server first.
describe.skipIf(process.env.DOOT_BOARD_E2E !== '1')('Birthday board browser flow', () => {
  it('plays all three fields with four phones in the same room and restores completed cells', async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true })
    const origin = process.env.DOOT_BOARD_URL ?? 'http://127.0.0.1:3107'
    const errors: string[] = []
    const hostContext = await browser.newContext({ viewport: { width: 1440, height: 1050 } })
    const host = await hostContext.newPage()
    host.on('pageerror', e => errors.push(e.message))
    const click = async (page: Page, name: string | RegExp) => { await page.getByRole('button', { name, exact: typeof name === 'string' }).click({ timeout: 30000 }) }
    try {
      await host.goto(`${origin}/host/birthday`)
      await host.getByRole('button', { name: 'Feld starten' }).first().waitFor({ state: 'visible', timeout: 45000 })
      await host.waitForFunction(() => !(document.querySelector('.cell button') as HTMLButtonElement)?.disabled, { timeout: 30000 })
      const room = (await host.locator('.bar-right .code').innerText()).trim()
      expect(room).toHaveLength(4)
      const phones: Page[] = []
      for (let i = 0; i < 4; i++) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
        const phone = await context.newPage()
        phone.on('pageerror', e => errors.push(e.message))
        await phone.goto(`${origin}/play/${room}`)
        await phone.getByLabel('Your display name').fill(`Board ${i + 1}`)
        await click(phone, 'Join game')
        await phone.locator('.birthday-board').waitFor({ timeout: 30000 })
        phones.push(phone)
      }
      await host.getByText('4 players', { exact: true }).waitFor({ timeout: 15000 })
      await host.screenshot({ path: join(tmpdir(), 'doot-birthday-board.png'), fullPage: true })
      await host.locator('.cell').filter({ hasText: 'BRAINS' }).getByRole('button').click()
      for (const phone of phones) {
        await phone.locator('.opt-grid button').nth(1).click({ timeout: 30000 })
        await click(phone, 'Lock it in')
      }
      await click(host, 'Reveal')
      await click(host, 'Final results')
      await click(host, 'Zurück zum Board · Feld abschließen')
      for (const phone of phones) await phone.locator('.cell.done').waitFor()
      await host.reload()
      await host.locator('.cell.done').waitFor({ timeout: 30000 })

      await host.locator('.cell').filter({ hasText: 'DRAW' }).getByRole('button').click()
      await click(host, 'Collect answers')
      for (const [i, phone] of phones.entries()) {
        const canvas = phone.locator('.draw-canvas canvas')
        await canvas.waitFor({ timeout: 30000 })
        const box = (await canvas.boundingBox())!
        await phone.mouse.move(box.x + 25, box.y + 35 + i * 8)
        await phone.mouse.down()
        await phone.mouse.move(box.x + box.width / 2, box.y + 90 + i * 12, { steps: 8 })
        await phone.mouse.up()
        await click(phone, 'Lock it in')
      }
      await click(host, /^Start the vote/)
      await click(host, 'Open voting')
      for (const phone of phones) {
        await phone.getByRole('radio').first().click({ timeout: 30000 })
        await click(phone, 'Lock it in')
      }
      await click(host, 'Reveal')
      await click(host, 'Final results')
      await click(host, 'Zurück zum Board · Feld abschließen')
      expect(await host.locator('.cell.done').count()).toBe(2)

      await host.locator('.cell').filter({ hasText: 'VERSUS' }).getByRole('button').click()
      await click(host, 'Turnier erstellen')
      for (let duel = 0; duel < 3; duel++) {
        if (duel === 1) await host.reload()
        await host.getByRole('button', { name: 'Duell starten', exact: true }).waitFor()
        const windowId = await host.locator('.bet-window').getAttribute('data-window-id')
        let count = 0
        for (const phone of phones) {
          await phone.locator(`.bet-window[data-window-id="${windowId}"][data-match-status="pending"]`).waitFor({ timeout: 15000 })
          const choice = phone.locator('.bet-window .choices button').first()
          if (await choice.count()) { await choice.click(); count++ }
        }
        expect(count).toBe(2)
        await host.getByText('2 Tipps gespeichert', { exact: true }).waitFor({ timeout: 15000 })
        await click(host, 'Duell starten')
        await host.getByLabel('Sieger des laufenden Duells').selectOption({ index: 1 })
        await click(host, 'Ergebnis bestätigen · +1000 Punkte')
      }
      await host.locator('.champion').waitFor()
      await click(host, 'Turnier abschließen')
      await click(host, 'Final results')
      await click(host, 'Zurück zum Board · Feld abschließen')
      for (const phone of phones) {
        await phone.getByText('Alle drei Felder sind gespielt.', { exact: false }).waitFor()
        expect(phone.url()).toContain(`/play/${room}`)
        expect(await phone.locator('.cell.done').count()).toBe(3)
      }
      await host.reload()
      await host.getByText('Alle drei Felder sind gespielt.', { exact: false }).waitFor({ timeout: 30000 })
      expect((await host.locator('.bar-right .code').innerText()).trim()).toBe(room)
      expect(await host.locator('.cell.done').count()).toBe(3)
      expect(errors).toEqual([])
    } catch (error) {
      await host.screenshot({ path: join(tmpdir(), 'doot-birthday-board-failure.png'), fullPage: true })
      throw error
    } finally { await browser.close() }
  }, 240000)
})
