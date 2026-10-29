<script setup lang="ts">
import { computed, ref } from 'vue'
import { bracket, champion, currentMatch, roundName, type Tournament } from './tournament'
const props = defineProps<{ tournament: Tournament; meId?: string }>()
const rounds = computed(() => bracket(props.tournament))
const active = computed(() => currentMatch(props.tournament))
const winner = computed(() => champion(props.tournament))
const scroller = ref<HTMLElement>()
const width = computed(() => rounds.value.length * 280)
const height = computed(() => rounds.value[0]!.length * 112)
const center = (round: number, position: number) => (position + 0.5) * 112 * 2 ** round
const name = (id: string | null) => props.tournament.players.find(p => p.id === id)?.name ?? 'Sieger steht noch aus'
function focusMatch() {
  scroller.value?.querySelector('[data-current="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
}
</script>

<template>
  <section class="versus" aria-label="Turnierbaum">
    <div v-if="winner" class="champion" role="status">
      <span class="trophy" aria-hidden="true">🏆</span>
      <div><span class="eyebrow">TURNIERSIEG</span><h2>{{ winner.name }}</h2><p>{{ winner.id === meId ? 'Du hast das Turnier gewonnen!' : 'Der Champion steht fest!' }}</p></div>
      <span class="spark s1" aria-hidden="true">✦</span><span class="spark s2" aria-hidden="true">✦</span>
    </div>
    <div class="bracket-toolbar"><span class="eyebrow">VERSUS · {{ tournament.players.length }} SPIELER</span>
      <button v-if="active" type="button" class="btn btn-ghost" @click="focusMatch">Aktuelles Match anzeigen</button>
    </div>
    <p class="scroll-hint">Alle Runden ansehen: horizontal scrollen oder wischen.</p>
    <div ref="scroller" class="bracket-scroll" tabindex="0" aria-label="Alle Turnierrunden, horizontal scrollbar">
      <div :style="{ width: `${width}px` }">
        <div class="round-headings"><h3 v-for="(round, r) in rounds" :key="r">{{ roundName(round.length) }}</h3></div>
        <div class="bracket-canvas" :style="{ height: `${height}px` }">
          <svg class="connectors" :width="width" :height="height" aria-hidden="true">
            <template v-for="(round, r) in rounds.slice(0, -1)" :key="r">
              <path v-for="m in round" :key="m.id" :class="{ advanced: !!m.winnerId }"
                :d="`M ${r * 280 + 240} ${center(r, m.position)} H ${r * 280 + 262} V ${center(r + 1, Math.floor(m.position / 2))} H ${(r + 1) * 280 + 8}`" />
            </template>
          </svg>
          <template v-for="(round, r) in rounds" :key="r">
            <article v-for="m in round" :key="m.id" class="match" :data-current="active?.id === m.id"
              :class="{ current: active?.id === m.id, running: m.status === 'running', completed: m.status === 'completed' }"
              :style="{ left: `${r * 280 + 8}px`, top: `${center(r, m.position) - 46}px` }"
              :aria-label="`${roundName(round.length)}, Match ${m.position + 1}`">
              <div class="match-meta"><span>Match {{ m.position + 1 }}</span><strong>{{ m.status === 'bye' ? 'Freilos' : m.status === 'completed' ? 'Beendet' : m.status === 'running' ? 'LIVE' : active?.id === m.id ? 'Als Nächstes' : 'Noch nicht gestartet' }}</strong></div>
              <div v-for="(id, slot) in m.slots" :key="slot" class="competitor" :class="{ won: id && id === m.winnerId, you: id && id === meId }">
                <span :title="id ? name(id) : ''">{{ id ? name(id) : m.round === 0 ? 'Freilos (BYE)' : 'Sieger steht noch aus' }}</span>
                <span v-if="id && id === m.winnerId" aria-label="Gewinner">✓</span>
              </div>
            </article>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.versus { width:100%; min-width:0; color:var(--ink); }
.bracket-toolbar { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; }
.eyebrow { font-weight:900; letter-spacing:.14em; font-size:12px; }
.scroll-hint { color:var(--ink-soft); font-size:13px; margin:10px 0; }
.bracket-scroll { overflow:auto; border:1px solid var(--line); border-radius:16px; background:linear-gradient(135deg,var(--surface),var(--surface-2)); padding:12px 0; }
.round-headings { display:flex; }
.round-headings h3 { box-sizing:border-box; width:280px; flex:none; margin:4px 0 14px; padding-left:12px; font-size:18px; }
.bracket-canvas { position:relative; }
.connectors { position:absolute; inset:0; pointer-events:none; }
path { fill:none; stroke:var(--line); stroke-width:2; }
path.advanced { stroke:#28b991; }
.match { position:absolute; box-sizing:border-box; width:232px; height:92px; border:1px solid var(--line); border-radius:10px; background:var(--surface); overflow:hidden; }
.match.current { border:2px solid #8d72f8; box-shadow:0 0 0 3px #8d72f82a; }
.match.running { border-color:#f28c45; box-shadow:0 0 20px #f28c4533; }
.match-meta { display:flex; justify-content:space-between; gap:4px; padding:4px 8px; font-size:10px; color:var(--ink-soft); background:var(--surface-2); }
.running .match-meta strong { color:#d46a17; }
.competitor { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:5px 8px; height:31px; box-sizing:border-box; font-size:14px; }
.competitor span:first-child { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.competitor.you { font-weight:900; }
.competitor.won { background:#16836325; font-weight:900; }
.champion { position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; gap:20px; padding:24px; margin-bottom:20px; border:2px solid #d7a727; border-radius:20px; background:linear-gradient(120deg,#d7a72725,#8d72f825); text-align:center; }
.champion h2 { font-size:clamp(28px,5vw,52px); margin:6px 0; overflow-wrap:anywhere; }
.champion p { margin:0; }
.trophy { font-size:48px; animation:celebrate 800ms ease-out both; }
.spark { position:absolute; color:#d7a727; font-size:28px; animation:sparkle 1.3s ease-out 3; }
.s1 { left:8%; top:15%; }.s2 { right:8%; bottom:15%; animation-delay:.3s; }
@keyframes celebrate { from { transform:scale(.3) rotate(-20deg); opacity:0; } to { transform:scale(1) rotate(0); opacity:1; } }
@keyframes sparkle { 0%,100% { opacity:0; transform:scale(.4); } 50% { opacity:1; transform:scale(1.3); } }
@media (prefers-reduced-motion: reduce) { .trophy,.spark { animation:none; } }
</style>
