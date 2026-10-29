<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { injectDootRoom } from '@doot-games/engine/vue'
import { GameHost } from '@doot-games/games'
import type { RelayValue } from '@doot-games/engine'
import type { BoardDefinition, StandardResults } from '@doot-games/sdk'
import { BIRTHDAY_BOARD_CHANNEL, executionId, finishBirthdayCell, startBirthdayCell, type BirthdayCellId } from '../utils/birthdayBoard'
import { birthdayGameForField } from '../utils/birthdayBoardGames'
import { freezeBirthdayShow, readBirthdayShow, type BirthdayShowSnapshot } from '../utils/birthdayShowSnapshot'
import { buildSessionGame } from '../utils/sessionGameAdapter'

const props = defineProps<{ hostToken: string; themeId: string; definition?: BoardDefinition; sourceId?: string }>()
const room = injectDootRoom()
const storageKey = () => `doot-birthday-board:${room.code.value}:${props.hostToken}`
const error = ref('')
let saved: BirthdayShowSnapshot | null = null
try { saved = readBirthdayShow(sessionStorage.getItem(storageKey()), props.sourceId ?? 'prototype') } catch { /* Optional refresh storage. */ }
const snapshot = ref(saved ?? freezeBirthdayShow(props.definition, props.sourceId ?? 'prototype'))
const state = computed({ get: () => snapshot.value.state, set: value => { snapshot.value.state = value } })
const busy = ref(false)
const active = computed(() => state.value.active)
const plugin = computed(() => active.value ? birthdayGameForField(active.value.cellId, snapshot.value.definition).plugin : undefined)
const matchingRun = computed(() => !!active.value && room.meta.value?.sessionRunId === active.value.runId)
const atResults = computed(() => matchingRun.value && room.phase.value === 'results' && !!room.results.value)
const needsRestart = computed(() => !!active.value && room.ready.value && (!matchingRun.value || room.phase.value === 'lobby'))

function loaded(cell: BirthdayCellId, runId: string) {
  const game = birthdayGameForField(cell, snapshot.value.definition)
  return buildSessionGame(game.plugin, game.config, room.runtime, props.themeId, runId)
}
// The component mounts synchronously in setup, before the pending relay connect
// resumes. Load the same run for recovery, also on the board (for later cleanup).
if (state.value.lastRun) {
  try { room.host.loadGame(loaded(state.value.lastRun.cellId, state.value.lastRun.runId)) }
  catch (e) { error.value = e instanceof Error ? e.message : 'Spiel konnte nicht geladen werden.' }
}

watch([snapshot, room.ready, room.code], () => {
  try { sessionStorage.setItem(storageKey(), JSON.stringify(snapshot.value)) }
  catch { error.value = 'Der Browser kann den Board-Fortschritt nicht speichern. Bitte diese Registerkarte geöffnet lassen.' }
  if (room.ready.value) room.publishExtra(BIRTHDAY_BOARD_CHANNEL, state.value as unknown as RelayValue)
}, { deep: true, immediate: true })

function launch(cell: BirthdayCellId) {
  if (!room.isHost.value || !room.ready.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const next = startBirthdayCell(state.value, cell)
    const run = next.active!
    room.host.nextGame(loaded(cell, run.runId))
    state.value = next
  } catch (e) { error.value = e instanceof Error ? e.message : 'Feld konnte nicht gestartet werden.' }
  finally { busy.value = false }
}
function returnToBoard() {
  if (!room.isHost.value || !atResults.value || !active.value || busy.value) return
  state.value = finishBirthdayCell(state.value, active.value.runId, room.results.value as unknown as StandardResults)
}
function restart() {
  if (!room.isHost.value || !needsRestart.value || !active.value || busy.value) return
  const run = { cellId: active.value.cellId, runId: executionId() }
  try {
    room.host.nextGame(loaded(run.cellId, run.runId))
    state.value = { ...state.value, active: run, lastRun: run }
    error.value = ''
  } catch (e) { error.value = e instanceof Error ? e.message : 'Neustart fehlgeschlagen.' }
}
</script>

<template>
  <div class="birthday-session">
    <p v-if="snapshot.definition && !active" class="notice">Diese Show nutzt eine feste Kopie deiner gespeicherten Vorlage. Änderungen im <NuxtLink :to="`/boards/${sourceId}`" target="_blank">Board-Editor</NuxtLink> gelten erst für eine neue Gameshow. Feldwerte sind Beschriftungen; die Session-Punkteformel bleibt gleich.</p>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
    <BirthdayBoard v-if="!active" :state="state" host :disabled="!room.ready.value || busy" @select="launch" />
    <div v-else-if="needsRestart" class="notice" role="alert">
      <h2>Dieses Feld muss neu gestartet werden</h2><p>Doot konnte das laufende Spiel nach dem Refresh nicht wiederherstellen. Bereits abgeschlossene Felder und Session-Punkte bleiben erhalten. Der Neustart verwirft nur das unvollständige Feld.</p>
      <button type="button" class="btn btn-primary" @click="restart">Unvollständiges Feld neu starten</button>
    </div>
    <template v-else-if="plugin && matchingRun">
      <SessionGameSurface :key="active.runId" :plugin="plugin" :view="GameHost" :execution-id="active.runId" host />
      <div v-if="atResults" class="return"><button type="button" class="btn btn-primary btn-lg" @click="returnToBoard">Zurück zum Board · Feld abschließen</button></div>
    </template>
    <p v-else class="notice">Spiel wird geladen …</p>
  </div>
</template>

<style scoped>
.birthday-session { flex:1; min-width:0; display:flex; flex-direction:column; }.return { display:flex; justify-content:center; padding:18px; }.notice { padding:20px; border:1px solid var(--line); border-radius:12px; margin:12px; }
</style>
