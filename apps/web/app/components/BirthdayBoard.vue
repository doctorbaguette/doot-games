<script setup lang="ts">
import { computed } from 'vue'
import { BIRTHDAY_CELLS, birthdayLeaderboard, type BirthdayBoardState, type BirthdayCellId } from '../utils/birthdayBoard'
const props = defineProps<{ state: BirthdayBoardState; host?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ select: [cell: BirthdayCellId] }>()
const scores = computed(() => birthdayLeaderboard(props.state))
const categories = computed(() => props.state.board
  ? props.state.board.categories.map(c => ({ id: c.id, name: c.name, cells: c.cells.map(f => ({ id: f.id, category: c.name, title: f.label, value: f.value as number | undefined, description: '' })) }))
  : [{ id: 'prototype', name: '', cells: BIRTHDAY_CELLS.map(f => ({ ...f, value: undefined as number | undefined })) }])
const total = computed(() => categories.value.reduce((n, c) => n + c.cells.length, 0))
</script>

<template>
  <section class="birthday-board" aria-label="Birthday Gameshow Spielbrett">
    <header><p class="eyebrow">BIRTHDAY GAMESHOW · 2027</p><h1>{{ state.board?.title ?? 'Wählt eure nächste Challenge' }}</h1><p>{{ host ? 'Wähle ein freies Feld. Alle bleiben im selben Raum.' : 'Der Host wählt das nächste Feld. Lass diese Seite geöffnet.' }}</p></header>
    <div class="board-columns" :class="{ prepared: !!state.board }" :style="{ '--columns': categories.length }">
      <section v-for="category in categories" :key="category.id" class="board-category">
      <h2 v-if="state.board" class="category-heading">{{ category.name }}</h2>
      <div class="cells" :class="{ stacked: !!state.board }">
      <article v-for="cell in category.cells" :key="cell.id" class="cell" :class="{ done: state.completed.some(c => c.cellId === cell.id) }">
        <p v-if="!state.board" class="category">{{ cell.category }}</p><h3>{{ cell.title }}</h3><strong v-if="cell.value !== undefined" class="field-value">{{ cell.value }}</strong><p v-if="cell.description">{{ cell.description }}</p>
        <strong v-if="state.completed.some(c => c.cellId === cell.id)" class="status">✓ Abgeschlossen</strong>
        <strong v-else-if="state.active?.cellId === cell.id" class="status">Wird gespielt</strong>
        <button v-else-if="host" type="button" class="btn btn-primary" :disabled="disabled || !!state.active" @click="emit('select', cell.id)">Feld starten</button>
        <span v-else class="status">Noch offen</span>
      </article>
      </div>
      </section>
    </div>
    <p v-if="state.completed.length === total" role="status">{{ !state.board ? 'Alle drei Felder sind gespielt.' : `Alle ${total} Felder sind gespielt.` }} Die Gameshow ist abgeschlossen!</p>
    <section class="standings" aria-label="Session-Gesamtwertung"><h2>Session-Gesamtwertung</h2>
      <ol v-if="scores.length"><li v-for="(score, i) in scores" :key="score.id"><span>{{ i + 1 }}. {{ score.name }}</span><strong>{{ score.points }} Punkte</strong></li></ol>
      <p v-else>Noch keine Session-Punkte.</p><p class="rule">Bestehende Doot-Wertung: 5 / 3 / 2 / 1 Platzierungspunkte je Spiel, nur bei positiven Spielpunkten.</p>
    </section>
  </section>
</template>

<style scoped>
.birthday-board { width:100%; padding:clamp(16px,3vw,40px); box-sizing:border-box; }
header { text-align:center; margin-bottom:28px; }h1 { font-size:clamp(26px,4vw,48px); margin:10px 0; }
.eyebrow,.category { font-weight:900; letter-spacing:.15em; }.eyebrow { font-size:12px; color:var(--ink-soft); }
.cells { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; }
.prepared { display:grid; grid-template-columns:repeat(var(--columns),minmax(150px,1fr)); gap:14px; overflow-x:auto; padding:4px; }.board-category { min-width:0; }.category-heading { text-align:center; overflow-wrap:anywhere; font-size:20px; margin:0 0 14px; }.cells.stacked { grid-template-columns:1fr; gap:12px; }.stacked .cell { padding:16px 10px; min-height:150px; }.field-value { font-size:24px; }
.cell { display:flex; flex-direction:column; align-items:center; gap:12px; padding:28px 20px; text-align:center; border:2px solid #8d72f8; border-radius:18px; background:linear-gradient(135deg,var(--surface-2),var(--surface)); }
.cell h3,.cell p { margin:0; }.cell h3 { overflow-wrap:anywhere; }.cell p:not(.category) { flex:1; line-height:1.6; color:var(--ink-soft); }.category { color:#977cfc; font-size:22px; }
.cell.done { border-color:#28b991; }.status { padding:12px; }.done .status { color:#28b991; }
.standings { margin:28px auto 0; max-width:700px; }.standings ol { list-style:none; padding:0; }.standings li { display:flex; justify-content:space-between; gap:16px; padding:10px; border-bottom:1px solid var(--line); }.standings li span { overflow-wrap:anywhere; min-width:0; }.standings strong { flex-shrink:0; }.rule { font-size:12px; color:var(--ink-soft); }
@media(max-width:700px) { .cells { grid-template-columns:1fr; }.cell { padding:20px; } }
</style>
