import { describe, expect, it } from 'vitest'
import { chromium, type BrowserContext } from 'playwright'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Use a development server with a temporary DATABASE_URL for this opt-in test.
describe.skipIf(process.env.DOOT_SAVED_BOARD_E2E !== '1')('saved board editor in the browser', () => {
  it('creates, edits, reopens and hosts a private 30-cell board with an immutable evening snapshot', async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true })
    const origin = process.env.DOOT_BOARD_URL ?? 'http://127.0.0.1:3107'
    const suffix = crypto.randomUUID().slice(0, 8)
    const email = `board-${suffix}@example.invalid`, password = `Board-test-${crypto.randomUUID()}`
    const errors: string[] = []
    const signup = async (context: BrowserContext, address: string) => {
      const response = await context.request.post(`${origin}/api/auth/sign-up/email`, { headers: { Origin: origin }, data: { name: 'Board Editor Test', email: address, password } })
      expect(response.ok()).toBe(true)
    }
    try {
      let owner = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
      await signup(owner, email)
      let editor = await owner.newPage()
      editor.on('pageerror', e => errors.push(e.message))
      await editor.goto(`${origin}/boards/new`)
      await editor.getByLabel('Gameshow-Name').fill(`Birthday ${suffix}`)
      expect(await editor.locator('.category-editor').count()).toBe(6)
      expect(await editor.locator('.field-editor').count()).toBe(30)
      const category = editor.locator('[data-category-id="category-1"]')
      await category.getByLabel('Kategoriename').fill('Meine Fragen')
      const field = category.locator('[data-field-id="cell-1-1"]')
      await field.getByLabel('Feldbeschriftung').fill('Erste Frage')
      await field.getByLabel('Wert', { exact: true }).fill('750')
      await category.locator('[data-field-id="cell-1-2"]').getByLabel('Spieltyp').selectOption('draw')
      await category.locator('[data-field-id="cell-1-3"]').getByLabel('Spieltyp').selectOption('versus')
      await field.getByRole('button', { name: 'Feld nach unten' }).click()
      await category.getByRole('button', { name: 'Kategorie nach unten' }).click()
      expect(errors).toEqual([])
      expect(await editor.locator('.category-editor').nth(1).getAttribute('data-category-id')).toBe('category-1')
      expect(await category.locator('.field-editor').nth(1).getAttribute('data-field-id')).toBe('cell-1-1')
      await editor.getByRole('button', { name: 'Board speichern', exact: true }).click()
      await editor.waitForURL(/\/boards\/pl_/, { timeout: 30000 })
      const id = editor.url().split('/').at(-1)!
      await editor.getByRole('link', { name: 'Gameshow öffnen', exact: true }).waitFor()
      const record = await (await owner.request.get(`${origin}/api/playlists/${id}`)).json()
      expect(record.board.categories[1].id).toBe('category-1')
      expect(record.board.categories[1].cells[1]).toMatchObject({ id: 'cell-1-1', label: 'Erste Frage', value: 750, target: { kind: 'builtin', game: 'brains' } })
      const anonymous = await browser.newContext()
      expect((await anonymous.request.get(`${origin}/api/playlists/${id}`)).status()).toBe(404)
      const stranger = await browser.newContext()
      await signup(stranger, `other-${suffix}@example.invalid`)
      expect((await stranger.request.get(`${origin}/api/playlists/${id}`)).status()).toBe(404)
      expect((await stranger.request.put(`${origin}/api/playlists/${id}`, { headers: { Origin: origin }, data: { name: 'Stolen', board: record.board } })).status()).toBe(404)
      // Close the browser context and sign in again: the editor reloads from SQLite,
      // not from the original component state or that context's browser storage.
      await owner.close()
      owner = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
      expect((await owner.request.post(`${origin}/api/auth/sign-in/email`, { headers: { Origin: origin }, data: { email, password } })).ok()).toBe(true)
      editor = await owner.newPage()
      await editor.goto(`${origin}/boards/${id}`)
      await editor.locator('[data-field-id="cell-1-1"]').getByLabel('Feldbeschriftung').waitFor()
      expect(await editor.locator('[data-field-id="cell-1-1"]').getByLabel('Wert', { exact: true }).inputValue()).toBe('750')
      const popup = owner.waitForEvent('page')
      await editor.getByRole('link', { name: 'Gameshow öffnen', exact: true }).click()
      const host = await popup
      host.on('pageerror', e => errors.push(e.message))
      await host.locator('.birthday-board .cell').first().waitFor({ timeout: 30000 })
      expect(await host.locator('.birthday-board .cell').count()).toBe(30)
      const room = (await host.locator('.bar-right .code').innerText()).trim()
      const phone = await anonymous.newPage()
      await phone.setViewportSize({ width: 390, height: 844 })
      await phone.goto(`${origin}/play/${room}`)
      await phone.getByLabel('Your display name').fill(`Guest ${suffix}`)
      await phone.getByRole('button', { name: 'Join game', exact: true }).click()
      await phone.locator('.birthday-board').waitFor({ timeout: 30000 })
      // Edit the persisted source while the show already exists.
      await editor.getByLabel('Gameshow-Name').fill(`Next show ${suffix}`)
      const edited = editor.locator('[data-field-id="cell-1-1"]')
      await edited.getByLabel('Feldbeschriftung').fill('Nächstes Turnier')
      await edited.getByLabel('Wert', { exact: true }).fill('999')
      await edited.getByLabel('Spieltyp').selectOption('versus')
      await editor.getByRole('button', { name: 'Board speichern', exact: true }).click()
      await editor.getByText('Board gespeichert.', { exact: true }).waitFor()
      await host.reload()
      await host.getByRole('heading', { name: `Birthday ${suffix}`, exact: true }).waitFor({ timeout: 30000 })
      const oldField = host.locator('.cell').filter({ hasText: 'Erste Frage' })
      expect(await oldField.locator('.field-value').innerText()).toBe('750')
      expect(await phone.locator('.cell').filter({ hasText: 'Erste Frage' }).count()).toBe(1)
      await host.screenshot({ path: join(tmpdir(), 'doot-saved-board.png'), fullPage: true })
      await oldField.getByRole('button', { name: 'Feld starten', exact: true }).click()
      await phone.locator('.opt-grid button').nth(1).click({ timeout: 30000 })
      await phone.getByRole('button', { name: 'Lock it in', exact: true }).click()
      await host.getByRole('button', { name: 'Reveal', exact: true }).click()
      await host.getByRole('button', { name: 'Final results', exact: true }).click()
      await host.getByRole('button', { name: 'Zurück zum Board · Feld abschließen', exact: true }).click()
      expect(await host.locator('.cell.done').count()).toBe(1)
      host.once('dialog', dialog => dialog.accept())
      await host.getByRole('button', { name: 'Neue Gameshow starten', exact: true }).click()
      await host.getByRole('heading', { name: `Next show ${suffix}`, exact: true }).waitFor({ timeout: 30000 })
      expect(await host.locator('.cell.done').count()).toBe(0)
      expect(await host.locator('.cell').filter({ hasText: 'Nächstes Turnier' }).locator('.field-value').innerText()).toBe('999')
      expect(errors).toEqual([])
    } finally { await browser.close() }
  }, 180000)
})
