<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { boardDefinitionSchema, createDefaultBoard, type BoardDefinition, type BoardGameType } from '@doot-games/sdk'
import { executionId } from '../utils/birthdayBoard'

const props = defineProps<{ initial?: BoardDefinition; playlistId?: string }>()
const board = ref(boardDefinitionSchema.parse(JSON.parse(JSON.stringify(props.initial ?? createDefaultBoard()))))
const authSession = authClient.useSession()
const signedIn = computed(() => !!authSession.value?.data?.user)
const busy = ref(false), dirty = ref(!props.playlistId), error = ref(''), saved = ref(false)
const types: Array<{ id: BoardGameType; label: string }> = [
  { id: 'brains', label: 'BRAINS – einzelne Quizfrage' },
  { id: 'draw', label: 'DRAW – Zeichnen und Abstimmen' },
  { id: 'versus', label: 'VERSUS – vollständiges Nidhogg-Turnier' },
]
watch(board, () => { dirty.value = true; saved.value = false }, { deep: true })
function move<T>(items: T[], index: number, step: number) {
  const target = index + step
  if (target < 0 || target >= items.length) return
  const item = items.splice(index, 1)[0]!
  items.splice(target, 0, item)
}
function addField(category: BoardDefinition['categories'][number]) {
  if (category.cells.length >= 10) return
  category.cells.push({ id: executionId(), label: `Feld ${category.cells.length + 1}`, value: (category.cells.length + 1) * 100, target: { kind: 'builtin', game: 'brains' } })
}
function addCategory() {
  if (board.value.categories.length >= 12) return
  const category: BoardDefinition['categories'][number] = { id: executionId(), name: `Kategorie ${board.value.categories.length + 1}`, cells: [] }
  for (let i = 0; i < 5; i++) addField(category)
  board.value.categories.push(category)
}
async function save() {
  if (busy.value || !signedIn.value) return
  error.value = ''; saved.value = false
  const parsed = boardDefinitionSchema.safeParse(board.value)
  if (!parsed.success) { error.value = parsed.error.issues[0]?.message ?? 'Bitte die Board-Eingaben prüfen.'; return }
  busy.value = true
  try {
    const response = await $fetch<{ id: string }>(props.playlistId ? `/api/playlists/${props.playlistId}` : '/api/playlists', {
      method: props.playlistId ? 'PUT' : 'POST',
      body: { name: parsed.data.title, board: parsed.data, visibility: 'private' },
    })
    dirty.value = false; saved.value = true
    if (!props.playlistId) await navigateTo(`/boards/${response.id}`)
  } catch (e) {
    error.value = (e as { statusCode?: number }).statusCode === 401 ? 'Bitte anmelden, um dieses Board zu speichern.' : 'Das Board konnte nicht gespeichert werden. Bitte Anmeldung und Verbindung prüfen.'
  } finally { busy.value = false }
}
</script>

<template>
  <main class="board-editor wrap">
    <header><h1>Gameshow-Board bearbeiten</h1><p>Standard: sechs Kategorien mit je fünf Feldern. Deine Vorlage wird privat in Doot gespeichert.</p>
      <nav><NuxtLink to="/playlists" class="btn btn-ghost">Meine Gameshows</NuxtLink><NuxtLink to="/host/birthday" class="btn btn-ghost" target="_blank">Drei-Felder-Prototyp</NuxtLink></nav>
    </header>
    <p v-if="!signedIn" class="notice">Bitte zuerst mit deinem Doot-Konto <NuxtLink :to="`/login?redirect=${encodeURIComponent($route.path)}`">anmelden oder registrieren</NuxtLink>, damit du dauerhaft speichern kannst.</p>
    <p class="notice">Feldwerte werden auf dem Board angezeigt. Sie ändern die bestehende Session-Platzierungswertung nicht. Eigene Fragen, Bilder und gespeicherte Custom Games werden erst in einer späteren Phase verknüpft.</p>
    <form @submit.prevent="save">
      <fieldset :disabled="busy">
        <label>Gameshow-Name<input v-model="board.title" maxlength="120" required /></label>
        <section v-for="(category, ci) in board.categories" :key="category.id" class="category-editor panel" :data-category-id="category.id">
          <div class="category-toolbar"><label>Kategoriename<input v-model="category.name" maxlength="80" required /></label>
            <button type="button" class="btn btn-ghost" :disabled="ci === 0" @click="move(board.categories, ci, -1)">Kategorie nach oben</button>
            <button type="button" class="btn btn-ghost" :disabled="ci === board.categories.length - 1" @click="move(board.categories, ci, 1)">Kategorie nach unten</button>
          </div>
          <div v-for="(cell, fi) in category.cells" :key="cell.id" class="field-editor" :data-field-id="cell.id">
            <label>Feldbeschriftung<input v-model="cell.label" maxlength="120" required /></label>
            <label>Wert<input v-model.number="cell.value" type="number" min="0" max="1000000" step="1" required /></label>
            <label>Spieltyp<select v-model="cell.target.game"><option v-for="type in types" :key="type.id" :value="type.id">{{ type.label }}</option></select></label>
            <div class="field-actions"><button type="button" class="btn btn-ghost" :disabled="fi === 0" @click="move(category.cells, fi, -1)">Feld nach oben</button>
              <button type="button" class="btn btn-ghost" :disabled="fi === category.cells.length - 1" @click="move(category.cells, fi, 1)">Feld nach unten</button></div>
          </div>
          <button type="button" class="btn btn-ghost" :disabled="category.cells.length >= 10" @click="addField(category)">Feld hinzufügen</button>
        </section>
        <button type="button" class="btn btn-ghost" :disabled="board.categories.length >= 12" @click="addCategory">Kategorie hinzufügen</button>
      </fieldset>
      <div class="save-bar">
        <button type="submit" class="btn btn-primary" :disabled="busy || !signedIn">{{ busy ? 'Wird gespeichert …' : 'Board speichern' }}</button>
        <NuxtLink v-if="playlistId && !dirty && !busy" :to="`/host/playlist/${playlistId}`" class="btn btn-primary" target="_blank">Gameshow öffnen</NuxtLink>
        <span v-else-if="playlistId && dirty">Bitte vor dem Start speichern.</span>
        <span v-if="saved" role="status">Board gespeichert.</span>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
    </form>
  </main>
</template>

<style scoped>
.board-editor { padding:28px 0 60px; }header { margin-bottom:20px; }header p { margin:12px 0; }nav,.category-toolbar,.field-actions,.save-bar { display:flex; flex-wrap:wrap; align-items:end; gap:10px; }
.notice { padding:14px; border:1px solid var(--line); border-radius:12px; margin:14px 0; line-height:1.5; }
fieldset { border:0; padding:0; margin:0; }label { display:flex; flex-direction:column; gap:6px; min-width:0; }input,select { font:inherit; padding:10px; border:1px solid var(--line); border-radius:8px; background:var(--surface); color:var(--ink); width:100%; box-sizing:border-box; }
.category-editor { padding:18px; margin:20px 0; }.category-toolbar { margin-bottom:14px; }.category-toolbar label { flex:1; min-width:180px; }
.field-editor { display:grid; grid-template-columns:minmax(150px,1fr) 100px minmax(220px,1.2fr); gap:10px; padding:14px 0; border-top:1px solid var(--line); }.field-actions { grid-column:1/-1; }.save-bar { position:sticky; bottom:0; padding:16px; margin-top:20px; background:var(--surface); border:1px solid var(--line); border-radius:12px; }
@media(max-width:650px) { .field-editor { grid-template-columns:1fr; }.category-toolbar { align-items:stretch; flex-direction:column; }.category-toolbar label { min-width:0; } }
</style>
