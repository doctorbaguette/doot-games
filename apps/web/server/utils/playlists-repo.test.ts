import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDefaultBoard } from '@doot-games/sdk'
import { ensurePlaylistBoardColumn } from './playlist-board-migration'
import { createPlaylist, getPlaylist, listMyPlaylists, listPublicPlaylists, playlistInputSchema, updatePlaylist } from './playlists-repo'

const database = vi.hoisted(() => ({ current: null as LibSQLDatabase | null }))
vi.mock('./db', async original => ({ ...await original<typeof import('./db')>(), useDb: async () => database.current! }))

let client: Client, url: string
beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'doot-board-storage-'))
  url = `file:${join(dir, 'test.sqlite').replace(/\\/g, '/')}`
  client = createClient({ url })
  // Deliberately start from the OLD playlist table, including an existing row.
  await client.execute(`CREATE TABLE playlists (id TEXT PRIMARY KEY, owner_id TEXT, name TEXT NOT NULL, description TEXT, games TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'private', remixable INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
  await client.execute(`INSERT INTO playlists VALUES ('legacy','owner','Alter Spielabend',NULL,'["guess","external-challenge"]','private',0,1,1)`)
  await ensurePlaylistBoardColumn(client)
  database.current = drizzle(client)
})
afterAll(() => { client?.close(); database.current = null })

describe('durable playlist boards', () => {
  it('migrates additively and idempotently without altering existing linear playlists', async () => {
    await ensurePlaylistBoardColumn(client)
    const legacy = await getPlaylist('legacy', 'owner')
    expect(legacy?.games).toEqual(['guess', 'external-challenge'])
    expect(legacy?.board).toBeNull()
    expect(legacy?.name).toBe('Alter Spielabend')
    expect((await client.execute('PRAGMA table_info(playlists)')).rows.filter(r => r.name === 'board_config')).toHaveLength(1)
  })
  it('saves all 30 cells and reloads them after closing/reopening the SQLite connection', async () => {
    const board = createDefaultBoard()
    board.title = 'Geburtstag 2027'
    board.categories[0]!.name = 'Mein Wissen'
    board.categories[0]!.cells[0]!.label = 'Das große Finale'
    board.categories[0]!.cells[0]!.value = 750
    board.categories[0]!.cells[0]!.target.game = 'versus'
    const { id } = await createPlaylist(playlistInputSchema.parse({ name: board.title, board }), 'owner')
    client.close()
    client = createClient({ url }); database.current = drizzle(client)
    expect((await getPlaylist(id, 'owner'))?.board).toEqual(board)
    expect((await listMyPlaylists('owner')).find(p => p.id === id)).toMatchObject({ kind: 'board', gameCount: 30, visibility: 'private', games: [] })
  })
  it('allows only the owner to read/edit, even if a board row has a legacy public flag', async () => {
    const board = createDefaultBoard()
    const input = playlistInputSchema.parse({ name: board.title, board })
    const { id } = await createPlaylist(input, 'owner')
    expect(await getPlaylist(id, null)).toBeNull()
    expect(await getPlaylist(id, 'stranger')).toBeNull()
    expect(await updatePlaylist(id, 'stranger', { ...input, name: 'Hijacked' })).toBe(false)
    await client.execute({ sql: 'UPDATE playlists SET visibility = ? WHERE id = ?', args: ['public', id] })
    expect(await getPlaylist(id, null)).toBeNull()
    expect((await listPublicPlaylists()).some(p => p.id === id)).toBe(false)
    const changed = structuredClone(board)
    changed.categories.reverse()
    changed.categories[0]!.cells.reverse()
    expect(await updatePlaylist(id, 'owner', { ...input, board: changed })).toBe(true)
    expect((await getPlaylist(id, 'owner'))?.board).toEqual(changed)
    expect((await getPlaylist(id, 'owner'))?.visibility).toBe('private')
  })
  it('preserves the existing public linear playlist behavior', async () => {
    const { id } = await createPlaylist(playlistInputSchema.parse({ name: 'Public lineup', games: ['guess'], visibility: 'public' }), 'owner')
    expect((await getPlaylist(id, null))?.games).toEqual(['guess'])
    expect((await listPublicPlaylists()).some(p => p.id === id && p.kind === 'linear')).toBe(true)
  })
})

describe('playlist board input validation', () => {
  it('accepts a 6×5 board but preserves the legacy 20-game limit and rejects empty lineups', () => {
    expect(playlistInputSchema.safeParse({ name: 'Board', board: createDefaultBoard() }).success).toBe(true)
    expect(playlistInputSchema.safeParse({ name: 'Empty', games: [] }).success).toBe(false)
    expect(playlistInputSchema.safeParse({ name: 'Too long', games: Array(21).fill('guess') }).success).toBe(false)
    expect(playlistInputSchema.safeParse({ name: 'Mixed', games: ['guess'], board: createDefaultBoard() }).success).toBe(false)
  })
  it('rejects unsupported targets, hidden unvalidated content and public boards', () => {
    const board = createDefaultBoard()
    for (const target of [{ kind: 'saved-game', id: 'g_secret' }, { kind: 'builtin', game: 'map-attack' }, { kind: 'builtin', game: 'brains', correct: 1 }]) {
      const invalid = structuredClone(board) as unknown as { categories: Array<{ cells: Array<{ target: unknown }> }> }
      invalid.categories[0]!.cells[0]!.target = target
      expect(playlistInputSchema.safeParse({ name: 'Invalid', board: invalid }).success).toBe(false)
    }
    expect(playlistInputSchema.safeParse({ name: 'Public board', board, visibility: 'public' }).success).toBe(false)
    expect(playlistInputSchema.safeParse({ name: 'Remix board', board, remixable: true }).success).toBe(false)
  })
})
