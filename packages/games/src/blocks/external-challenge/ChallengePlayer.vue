<script setup lang="ts">
import { computed } from 'vue'
import { injectDootRoom } from '@doot-games/engine/vue'
import type { ExternalChallengeContent } from './block'
import TournamentBracket from './TournamentBracket.vue'
import BettingPanel from './BettingPanel.vue'
import { champion, currentMatch, scoringPlayers, tournamentScores } from './tournament'
const props = defineProps<{ content: ExternalChallengeContent }>()
const room = injectDootRoom()
const current = computed(() => props.content.tournament ? currentMatch(props.content.tournament) : undefined)
const winner = computed(() => props.content.tournament ? champion(props.content.tournament) : undefined)
const participating = computed(() => current.value?.slots.includes(room.me.value.id))
const playerName = (id: string | null) => props.content.tournament ? scoringPlayers(props.content.tournament).find(p => p.id === id)?.name ?? '…' : '…'
const scores = computed(() => props.content.tournament ? [...tournamentScores(props.content.tournament)]
  .sort((a, b) => b[1] - a[1]) : [])
</script>

<template>
  <div class="challenge">
    <header><p class="eyebrow">EXTERNAL CHALLENGE · K.-O.-TURNIER</p><h2>{{ content.title }}</h2><p>{{ content.description }}</p></header>
    <div v-if="!winner" class="match-status" aria-live="polite">
      <template v-if="current">
        <h3>{{ playerName(current.slots[0]) }} <span class="vs">VS</span> {{ playerName(current.slots[1]) }}</h3>
        <p v-if="current.status === 'running'">{{ participating ? 'Du bist dran! Spielt euer Duell außerhalb von Doot.' : 'Das Duell läuft – feuert die beiden an!' }}</p>
        <p v-else>{{ participating ? 'Du bist als Nächstes dran. Warte, bis der Host das Duell startet.' : 'Die nächste Paarung steht fest. Der Host startet das Duell.' }}</p>
      </template>
      <p v-else-if="!winner">Der Host erstellt das Turnier aus den Spielern der Lobby. Jeder Matchsieg bringt 1000 Punkte; Freilose geben keine Punkte.</p>
    </div>
    <slot />
    <BettingPanel v-if="content.tournament" :tournament="content.tournament" />
    <TournamentBracket v-if="content.tournament" :tournament="content.tournament" :me-id="room.me.value.id" />
    <details v-if="content.tournament" class="scores">
      <summary>Spielpunkte im Turnier</summary>
      <ol><li v-for="[id, points] in scores" :key="id"><span>{{ playerName(id) }}</span><strong>{{ points }} Punkte</strong></li></ol>
      <p>1000 pro Matchsieg · 300 pro richtigem Zuschauertipp · 0 für Freilose · kein Siegerbonus</p>
    </details>
  </div>
</template>

<style scoped>
.challenge { width:100%; min-width:0; display:grid; gap:16px; padding:16px; box-sizing:border-box; }
header,.match-status { text-align:center; }
h2 { font-size:clamp(24px,4vw,40px); margin:0; overflow-wrap:anywhere; }
h3 { margin:0; font-size:clamp(20px,3vw,30px); overflow-wrap:anywhere; }
.eyebrow { letter-spacing:.12em; font-size:11px; font-weight:900; }
.match-status { border-radius:14px; background:var(--surface-2); padding:14px; }
.vs { color:#977cfc; font-weight:900; padding:0 8px; }
.scores { padding:12px; border:1px solid var(--line); border-radius:12px; }
.scores summary { cursor:pointer; font-weight:800; }
.scores ol { padding:0; list-style:none; }.scores li { display:flex; justify-content:space-between; gap:12px; padding:6px 0; }
.scores li span { overflow-wrap:anywhere; min-width:0; }.scores strong { flex-shrink:0; }
</style>
