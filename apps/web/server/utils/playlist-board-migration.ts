import type { Client } from '@libsql/client'

/** Additive only: preserve every existing playlist and its ordered game IDs. */
export async function ensurePlaylistBoardColumn(client: Client): Promise<void> {
  const info = await client.execute('PRAGMA table_info(playlists)')
  if (info.rows.some(row => row.name === 'board_config')) return
  try { await client.execute('ALTER TABLE playlists ADD COLUMN board_config TEXT') }
  catch (error) {
    // Another process may have migrated the same local database concurrently.
    const updated = await client.execute('PRAGMA table_info(playlists)')
    if (!updated.rows.some(row => row.name === 'board_config')) throw error
  }
}
