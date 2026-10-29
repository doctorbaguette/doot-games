import { z } from '@doot-games/sdk'
import { scoreExternalDuel } from './score'

const playerSchema = z.object({ id: z.string().min(1), name: z.string() })
const matchSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'bye']),
  winnerId: z.string().nullable(),
})
const stateSchema = z.object({
  version: z.literal(1),
  players: z.array(playerSchema).min(2),
  seeds: z.array(z.string().nullable()),
  matches: z.array(matchSchema),
})
export type Tournament = z.infer<typeof stateSchema>
export type TournamentPlayer = z.infer<typeof playerSchema>
export interface MatchView extends z.infer<typeof matchSchema> {
  round: number
  position: number
  slots: [string | null, string | null]
  sources: [string, string] | null
}

/** Slots are derived, never separately persisted: one authoritative result per match. */
export function bracket(t: Tournament): MatchView[][] {
  const rounds: MatchView[][] = []
  let offset = 0
  for (let count = t.seeds.length / 2, round = 0; count >= 1; count /= 2, round++) {
    const previous = rounds[round - 1]
    rounds.push(Array.from({ length: count }, (_, position) => {
      const left = previous?.[position * 2]
      const right = previous?.[position * 2 + 1]
      const match = t.matches[offset + position]
      return {
        ...match!, round, position,
        slots: previous ? [left!.winnerId, right!.winnerId] : [t.seeds[position * 2]!, t.seeds[position * 2 + 1]!],
        sources: previous ? [left!.id, right!.id] : null,
      }
    }))
    offset += count
  }
  return rounds
}

function validState(t: Tournament): boolean {
  const size = t.seeds.length
  if (size < 2 || !Number.isInteger(Math.log2(size)) || size >= t.players.length * 2) return false
  if (t.players.length % 2 || t.matches.length !== size - 1) return false
  const ids = new Set(t.players.map(p => p.id))
  const occupied = t.seeds.filter((id): id is string => id !== null)
  if (ids.size !== t.players.length || occupied.length !== ids.size || new Set(occupied).size !== ids.size
    || occupied.some(id => !ids.has(id))) return false
  const views = bracket(t).flat()
  let running = 0
  for (let i = 0; i < views.length; i++) {
    const m = views[i]!
    if (m.id !== `r${m.round}-m${m.position}`) return false
    const [a, b] = m.slots
    const bye = m.round === 0 && (!a || !b)
    if (bye) {
      if ((!a && !b) || m.status !== 'bye' || m.winnerId !== (a ?? b)) return false
    } else if (m.status === 'bye') return false
    else if (m.status === 'completed') {
      if (!a || !b || !m.winnerId || !m.slots.includes(m.winnerId)) return false
    } else {
      if (m.winnerId !== null) return false
      if (m.status === 'running') {
        if (!a || !b || ++running > 1) return false
      }
    }
  }
  return true
}

/** Also validates restored payloads against the seed list and dependency graph. */
export const tournamentSchema = stateSchema.refine(validState, 'Ungültiger Turnierstand')

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export function createTournament(players: TournamentPlayer[], random = Math.random): Tournament {
  if (players.length < 2) throw new Error('Mindestens 2 Spieler müssen teilnehmen.')
  if (players.length % 2) throw new Error('Bitte eine gerade Spielerzahl anmelden. Bei ungerader Anzahl kann das Turnier nicht starten.')
  if (new Set(players.map(p => p.id)).size !== players.length || players.some(p => !p.id)) {
    throw new Error('Jeder Teilnehmer benötigt eine eindeutige Spieler-ID.')
  }
  const shuffled = shuffle(players, random)
  const size = 2 ** Math.ceil(Math.log2(players.length))
  const byes = size - players.length
  const pairs: Array<[string | null, string | null]> = []
  // Every bye goes to a different random player; never create an empty match.
  for (let i = 0; i < byes; i++) pairs.push([shuffled[i]!.id, null])
  for (let i = byes; i < shuffled.length; i += 2) pairs.push([shuffled[i]!.id, shuffled[i + 1]!.id])
  const seeds = shuffle(pairs, random).flatMap(pair => random() < 0.5 ? pair : [...pair].reverse())
  const t: Tournament = { version: 1, players: players.map(p => ({ ...p })), seeds, matches: [] }
  for (let count = size / 2, round = 0; count >= 1; count /= 2, round++) {
    for (let position = 0; position < count; position++) {
      const a = seeds[position * 2]
      const b = seeds[position * 2 + 1]
      const bye = round === 0 && (!a || !b)
      t.matches.push({ id: `r${round}-m${position}`, status: bye ? 'bye' : 'pending', winnerId: bye ? a ?? b ?? null : null })
    }
  }
  return tournamentSchema.parse(t)
}

export function currentMatch(t: Tournament): MatchView | undefined {
  const matches = bracket(t).flat()
  return matches.find(m => m.status === 'running')
    ?? matches.find(m => m.status === 'pending' && m.slots.every(Boolean))
}

export function champion(t: Tournament): TournamentPlayer | undefined {
  const final = t.matches[t.matches.length - 1]
  return final?.status === 'completed' ? t.players.find(p => p.id === final.winnerId) : undefined
}

function copy(t: Tournament): Tournament {
  return { ...t, players: t.players.map(p => ({ ...p })), seeds: [...t.seeds], matches: t.matches.map(m => ({ ...m })) }
}

export function startMatch(t: Tournament, id: string): Tournament {
  const m = currentMatch(t)
  if (!m || m.id !== id || m.status !== 'pending') throw new Error('Dieses Match kann gerade nicht gestartet werden.')
  const next = copy(t)
  next.matches.find(m => m.id === id)!.status = 'running'
  return next
}

export function confirmMatch(t: Tournament, id: string, winnerId: string): Tournament {
  const m = currentMatch(t)
  if (!m || m.id !== id || m.status !== 'running' || !m.slots.includes(winnerId)) {
    throw new Error('Bitte einen Teilnehmer des laufenden Duells als Sieger auswählen.')
  }
  const next = copy(t)
  Object.assign(next.matches.find(m => m.id === id)!, { status: 'completed', winnerId })
  return next
}

export function dependentMatches(t: Tournament, id: string): MatchView[] {
  const affected = new Set([id])
  return bracket(t).flat().filter(m => {
    if (!m.sources?.some(source => affected.has(source))) return false
    affected.add(m.id)
    return true
  })
}

export function correctWinner(t: Tournament, id: string, winnerId: string, allowReset = false): Tournament {
  const m = bracket(t).flat().find(m => m.id === id)
  if (!m || m.status !== 'completed' || !m.slots.includes(winnerId)) throw new Error('Dieses Ergebnis kann nicht geändert werden.')
  if (m.winnerId === winnerId) return t
  const dependents = dependentMatches(t, id)
  if (!allowReset && dependents.some(m => m.status === 'running' || m.status === 'completed')) {
    throw new Error('Abhängige Matches wurden bereits gestartet. Zurücksetzen muss ausdrücklich bestätigt werden.')
  }
  const next = copy(t)
  for (const match of next.matches) {
    if (match.id === id) match.winnerId = winnerId
    else if (dependents.some(d => d.id === match.id)) Object.assign(match, { status: 'pending', winnerId: null })
  }
  return next
}

/** Recompute from unique confirmed matches: corrections never leave stale points. */
export function tournamentScores(t: Tournament): Map<string, number> {
  const totals = new Map(t.players.map(p => [p.id, 0]))
  for (const m of bracket(t).flat()) {
    if (m.status !== 'completed' || !m.winnerId) continue
    for (const [id, score] of scoreExternalDuel(m.slots[0]!, m.slots[1]!, m.winnerId)) {
      totals.set(id, totals.get(id)! + score)
    }
  }
  return totals
}

export function roundName(matchCount: number): string {
  return ({ 1: 'Finale', 2: 'Halbfinale', 4: 'Viertelfinale', 8: 'Achtelfinale' } as Record<number, string>)[matchCount]
    ?? `Runde der ${matchCount * 2}`
}
