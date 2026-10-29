<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { injectDootRoom } from '@doot-games/engine/vue'
import type { RelayValue } from '@doot-games/engine'
import type { ExternalChallengeContent } from './block'
import ChallengePlayer from './ChallengePlayer.vue'
import { bracket, champion, confirmMatch, correctWinner, createTournament, currentMatch, dependentMatches, roundName, startMatch, type Tournament } from './tournament'
const props = defineProps<{ content: ExternalChallengeContent }>()
const room = injectDootRoom()
const winner = ref('')
const correctionId = ref('')
const correctionWinner = ref('')
const error = ref('')
const busy = ref(false)
const pending = ref<null | { kind: 'reset' } | { kind: 'correction'; id: string; winnerId: string }>(null)
const tournament = computed(() => props.content.tournament)
const current = computed(() => tournament.value ? currentMatch(tournament.value) : undefined)
const completed = computed(() => tournament.value ? bracket(tournament.value).flat().filter(m => m.status === 'completed') : [])
const correction = computed(() => completed.value.find(m => m.id === correctionId.value))
const editable = computed(() => room.isHost.value && room.phase.value === 'active' && ['ready', 'open'].includes(room.round.value.state))
// There are no phone submissions: everyone present when drawing may participate,
// including people who joined after the Doot round was opened.
const available = computed(() => room.players.value)
const playerName = (id: string | null) => tournament.value?.players.find(p => p.id === id)?.name ?? '…'
watch(() => current.value?.id, () => { winner.value = '' })
watch(correctionId, () => { correctionWinner.value = '' })

// Read the runtime, not an asynchronously rendered prop, to reject rapid double clicks.
function latest(): ExternalChallengeContent {
  return (room.runtimeContentFor(room.round.value.index) as unknown as ExternalChallengeContent | undefined) ?? props.content
}
function publish(t: Tournament | undefined) {
  const { tournament: old, duel: legacy, ...content } = latest()
  room.host.setRoundContent({ ...content, ...(t ? { tournament: t } : {}) } as unknown as RelayValue)
}
function action(fn: () => void) {
  if (!editable.value || busy.value) return
  busy.value = true
  error.value = ''
  try { fn() } catch (e) { error.value = e instanceof Error ? e.message : 'Aktion fehlgeschlagen.' }
  finally { busy.value = false }
}
function create() {
  action(() => {
    if (latest().tournament) return
    publish(createTournament(available.value.map(p => ({ id: p.id, name: p.name }))))
  })
}
function start() {
  action(() => {
    const t = latest().tournament
    if (!t || !current.value) return
    publish(startMatch(t, current.value.id))
  })
}
function confirm() {
  action(() => {
    const t = latest().tournament
    if (!t || !current.value) return
    publish(confirmMatch(t, current.value.id, winner.value))
    winner.value = ''
  })
}
function requestCorrection() {
  action(() => {
    const t = latest().tournament
    if (!t || !correction.value || !correctionWinner.value) return
    if (correction.value.winnerId === correctionWinner.value) return
    if (dependentMatches(t, correctionId.value).some(m => ['running', 'completed'].includes(m.status))) {
      pending.value = { kind: 'correction', id: correctionId.value, winnerId: correctionWinner.value }
      return
    }
    publish(correctWinner(t, correctionId.value, correctionWinner.value))
    correctionId.value = ''
  })
}
function approve() {
  action(() => {
    const request = pending.value
    if (!request) return
    const t = latest().tournament
    if (request.kind === 'reset') publish(undefined)
    else if (t) publish(correctWinner(t, request.id, request.winnerId, true))
    pending.value = null
    correctionId.value = ''
    winner.value = ''
  })
}
function finish() {
  action(() => {
    const t = latest().tournament
    if (!t || !champion(t)) return
    if (room.host.can('open')) room.host.openVoting()
    if (room.host.can('lock')) room.host.lock()
    if (room.host.can('reveal')) room.host.reveal()
  })
}
</script>

<template>
  <section class="duel-host">
    <ChallengePlayer :content="content">
    <div v-if="editable" class="host-controls">
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <template v-if="!tournament">
        <p>{{ available.length }} Spieler in der Lobby. Es werden mindestens 2 und eine gerade Anzahl benötigt.</p>
        <button type="button" class="btn btn-primary" :disabled="busy" @click="create">Turnier erstellen</button>
      </template>
      <template v-else>
        <p>Die {{ tournament.players.length }} ausgelosten Teilnehmer bleiben bis zum Zurücksetzen fest.</p>
        <button v-if="current?.status === 'pending'" type="button" class="btn btn-primary" :disabled="busy || !!pending" @click="start">Duell starten</button>
        <template v-else-if="current?.status === 'running'">
          <label>Sieger des laufenden Duells
            <select v-model="winner" :disabled="!!pending"><option value="">Bitte auswählen</option><option v-for="id in current.slots" :key="id!" :value="id">{{ playerName(id) }}</option></select>
          </label>
          <button type="button" class="btn btn-primary" :disabled="!winner || busy || !!pending" @click="confirm">Ergebnis bestätigen · +1000 Punkte</button>
        </template>
        <template v-else>
          <p>Alle Duelle sind abgeschlossen. Vor dem Abschluss kannst du Ergebnisse noch korrigieren.</p>
          <button type="button" class="btn btn-primary" :disabled="busy || !!pending" @click="finish">Turnier abschließen</button>
        </template>
        <details v-if="completed.length" class="correction">
          <summary>Ergebnis korrigieren</summary>
          <label>Abgeschlossenes Match
            <select v-model="correctionId" :disabled="!!pending"><option value="">Bitte auswählen</option><option v-for="m in completed" :key="m.id" :value="m.id">{{ roundName(tournament.seeds.length / 2 ** (m.round + 1)) }} · {{ playerName(m.slots[0]) }} vs. {{ playerName(m.slots[1]) }}</option></select>
          </label>
          <label v-if="correction">Richtiger Sieger
            <select v-model="correctionWinner" :disabled="!!pending"><option value="">Bitte auswählen</option><option v-for="id in correction.slots" :key="id!" :value="id">{{ playerName(id) }}</option></select>
          </label>
          <button type="button" class="btn btn-ghost" :disabled="!correctionWinner || correctionWinner === correction?.winnerId || busy || !!pending" @click="requestCorrection">Korrektur übernehmen</button>
        </details>
        <button type="button" class="btn btn-ghost" :disabled="busy || !!pending" @click="pending = { kind: 'reset' }">Turnier zurücksetzen</button>
      </template>
      <div v-if="pending" class="confirmation" role="alertdialog" aria-modal="false" aria-labelledby="confirmation-title" aria-describedby="confirmation-description">
        <h3 id="confirmation-title">{{ pending.kind === 'reset' ? 'Turnier wirklich zurücksetzen?' : 'Abhängige Matches zurücksetzen?' }}</h3>
        <p id="confirmation-description">{{ pending.kind === 'reset' ? 'Der gesamte Turnierbaum und alle darin erspielten Punkte werden gelöscht. Danach kannst du neu auslosen.' : 'Diese Korrektur beeinflusst bereits gestartete oder abgeschlossene Folgematches. Alle abhängigen Matches und deren Punkte werden zurückgesetzt. Diese Duelle müssen erneut gespielt werden.' }}</p>
        <button type="button" class="btn btn-primary" :disabled="busy" @click="approve">{{ pending.kind === 'reset' ? 'Ja, Turnier zurücksetzen' : 'Ja, korrigieren und Folgematches zurücksetzen' }}</button>
        <button type="button" class="btn btn-ghost" @click="pending = null">Abbrechen</button>
      </div>
    </div>
    </ChallengePlayer>
  </section>
</template>

<style scoped>
.duel-host { width:100%; min-width:0; }
.host-controls { display:flex; flex-direction:column; align-items:center; gap:14px; padding:16px; text-align:center; }
.host-controls p { margin:0; }
label { display:flex; flex-direction:column; gap:8px; width:min(100%, 480px); text-align:left; }
select { box-sizing:border-box; width:100%; font:inherit; padding:12px; color:var(--ink); background:var(--surface); border:2px solid var(--line); border-radius:8px; }
.correction { width:min(100%,480px); padding:12px; border:1px solid var(--line); border-radius:10px; }
.correction label { margin:12px 0; }
summary { cursor:pointer; font-weight:800; }
.error { color:var(--ink); background:#ee614e25; border:1px solid #ee614e; padding:12px; border-radius:8px; }
.confirmation { max-width:560px; border:2px solid #e5aa39; padding:20px; border-radius:14px; background:var(--surface-2); display:grid; gap:14px; }
.confirmation h3 { margin:0; }
</style>
