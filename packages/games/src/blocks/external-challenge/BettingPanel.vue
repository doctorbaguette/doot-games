<script setup lang="ts">
import { computed, ref } from 'vue'
import { injectDootRoom } from '@doot-games/engine/vue'
import { BET_POINTS, betChannel, betSummary } from './betting'
import { bracket, currentMatch, scoringPlayers, type Tournament } from './tournament'

const props = defineProps<{ tournament: Tournament }>()
const room = injectDootRoom()
const sending = ref<{ window: string; pick: string } | null>(null)
const error = ref('')
const current = computed(() => currentMatch(props.tournament))
const window = computed(() => current.value?.betting)
const own = computed(() => window.value?.picks.find(p => p.playerId === room.me.value.id))
const eligible = computed(() => room.me.value.role === 'player' && window.value?.eligible.some(p => p.id === room.me.value.id))
const open = computed(() => room.phase.value === 'active' && current.value?.status === 'pending')
const waiting = computed(() => sending.value?.window === window.value?.id && sending.value?.pick !== own.value?.pickId)
const roster = computed(() => new Map(scoringPlayers(props.tournament).map(p => [p.id, p.name])))
const name = (id: string | null) => id ? roster.value.get(id) ?? 'Spieler' : '…'
const results = computed(() => bracket(props.tournament).flat().filter(m => m.status === 'completed' && m.betting)
  .reverse().map(m => ({ match: m, summary: betSummary(m) })))

function placeBet(pickId: string) {
  if (!open.value || !eligible.value || !window.value || !current.value?.slots.includes(pickId)) return
  error.value = ''
  sending.value = { window: window.value.id, pick: pickId }
  try {
    room.publishExtra(betChannel(room.round.value.index, window.value.id, room.me.value.id), { pickId })
  } catch { error.value = 'Tipp konnte nicht gesendet werden. Bitte erneut versuchen.' }
}
</script>

<template>
  <section class="betting" aria-label="Zuschauerwetten">
    <div v-if="current && window" class="bet-window" :data-window-id="window.id" :data-match-status="current.status" aria-live="polite">
      <h3>{{ open ? 'Wer gewinnt dieses Duell?' : 'Tipps sind gesperrt' }}</h3>
      <template v-if="eligible">
        <p>{{ open ? `Richtig tippen bringt ${BET_POINTS} Punkte. Du kannst deinen Tipp bis zum Duellstart ändern.` : 'Der Host hat das Duell gestartet. Dein gespeicherter Tipp bleibt fest.' }}</p>
        <div class="choices" role="group" aria-label="Auf einen Duellteilnehmer tippen">
          <button v-for="id in current.slots" :key="id!" type="button" class="btn"
            :class="own?.pickId === id ? 'btn-primary' : 'btn-ghost'"
            :aria-pressed="own?.pickId === id" :disabled="!open" @click="placeBet(id!)">{{ name(id) }}</button>
        </div>
        <p v-if="waiting && open">Tipp wird an den Host gesendet. Bestätigt gespeichert ist weiterhin: {{ own ? name(own.pickId) : 'noch kein Tipp' }}.</p>
        <p v-else>{{ own ? `Dein gespeicherter Tipp: ${name(own.pickId)}` : 'Du hast noch keinen Tipp abgegeben.' }}</p>
      </template>
      <p v-else-if="current.slots.includes(room.me.value.id)">Du spielst dieses Duell selbst und darfst nicht darauf wetten.</p>
      <p v-else>{{ open ? 'Die Zuschauer können jetzt tippen. Mit „Duell starten“ werden alle gespeicherten Tipps gesperrt.' : 'Ab dem Duellstart können keine Tipps mehr geändert werden.' }}</p>
      <p>{{ window.picks.length }} Tipps gespeichert</p>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
    <div v-if="results.length" class="bet-results">
      <h3>Wettauswertung</h3>
      <details v-for="(result, index) in results" :key="result.match.id" :open="index === 0">
        <summary>{{ name(result.match.slots[0]) }} vs. {{ name(result.match.slots[1]) }} · {{ name(result.match.winnerId) }} gewinnt</summary>
        <ul><li v-for="side in result.summary.distribution" :key="side.id!">{{ name(side.id) }}: {{ side.count }} {{ side.count === 1 ? 'Tipp' : 'Tipps' }}</li></ul>
        <p v-if="result.summary.successful.length"><strong>Richtig getippt · je +{{ BET_POINTS }} Punkte:</strong> {{ result.summary.successful.map(p => p.name).join(', ') }}</p>
        <p v-else>Keine richtigen Tipps · keine Wettpunkte.</p>
        <p v-if="result.summary.successful.some(p => p.id === room.me.value.id)"><strong>Dein Tipp war richtig: +{{ BET_POINTS }} Punkte!</strong></p>
        <p>Falsche oder nicht abgegebene Tipps: 0 Punkte.</p>
      </details>
    </div>
  </section>
</template>

<style scoped>
.betting { display:grid; gap:16px; min-width:0; }
.bet-window,.bet-results { padding:16px; background:var(--surface-2); border:1px solid var(--line); border-radius:14px; }
h3 { margin:0 0 10px; }p { line-height:1.5; }
.choices { display:flex; flex-wrap:wrap; gap:10px; }.choices button { flex:1; min-width:120px; white-space:normal; overflow-wrap:anywhere; }
details { padding:12px 0; border-top:1px solid var(--line); }summary { cursor:pointer; font-weight:800; overflow-wrap:anywhere; }
</style>
