import { drawBlock, getPlugin, guessBlock } from '@doot-games/games'
import type { BoardDefinition, BoardGameType, GameComposition } from '@doot-games/sdk'

/** Host-only definitions. The public board never publishes answers/configs. */
export function birthdayGame(cell: BoardGameType) {
  const id = cell === 'brains' ? 'guess' : cell === 'draw' ? 'sketch-spot' : 'external-challenge'
  const plugin = getPlugin(id)
  if (!plugin) throw new Error(`Spiel ${id} ist nicht registriert.`)
  let config: GameComposition
  if (cell === 'brains') config = {
    title: 'BRAINS – Quizfrage', settings: { firstToJoinDrives: false },
    rounds: [{ block: 'guess', content: { ...guessBlock.defaultContent(), subject: 'Birthday Gameshow 2027', prompt: 'Wie viele Flächen hat ein gewöhnlicher Spielwürfel?', timer: null, options: [4, 6, 8, 12].map(n => ({ label: String(n) })), correct: 1 } }],
  }
  else if (cell === 'draw') config = {
    title: 'DRAW – Zeichnen & Abstimmen', settings: { firstToJoinDrives: false },
    rounds: [
      { block: 'draw', content: { ...drawBlock.defaultContent(), prompt: 'Zeichne einen Dinosaurier auf einer Geburtstagsparty!', liveGallery: false, timer: 90 } },
      { block: 'drawvote', from: [0], content: { ...plugin.blocks.find(b => b.kind === 'drawvote')!.defaultContent(), prompt: 'Welcher Geburtstags-Dino gewinnt?', timer: 30 } },
    ],
  }
  else config = { ...plugin.defaultConfig, settings: { ...plugin.defaultConfig.settings, firstToJoinDrives: false } }
  return { plugin, config }
}

export function birthdayGameForField(cellId: string, definition?: BoardDefinition) {
  if (!definition) {
    if (!['brains', 'draw', 'versus'].includes(cellId)) throw new Error('Unbekanntes Prototyp-Feld.')
    return birthdayGame(cellId as BoardGameType)
  }
  const field = definition.categories.flatMap(c => c.cells).find(c => c.id === cellId)
  if (!field) throw new Error('Das Feld ist nicht Teil der eingefrorenen Show-Konfiguration.')
  return birthdayGame(field.target.game)
}
