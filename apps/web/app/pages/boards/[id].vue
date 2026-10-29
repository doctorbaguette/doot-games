<script setup lang="ts">
import type { BoardDefinition } from '@doot-games/sdk'
definePageMeta({ key: route => route.path })
const route = useRoute()
const id = String(route.params.id)
const isNew = id === 'new'
const { data: playlist, error } = isNew
  ? { data: ref<null>(null), error: ref<null>(null) }
  : await useFetch<{ id: string; board: BoardDefinition | null }>(`/api/playlists/${id}`)
useDootSeo({ title: isNew ? 'Gameshow-Board erstellen' : 'Gameshow-Board bearbeiten' })
</script>

<template>
  <ClientOnly>
  <BirthdayBoardEditor v-if="isNew" />
  <BirthdayBoardEditor v-else-if="playlist?.board" :key="id" :initial="playlist.board" :playlist-id="id" />
  <main v-else class="wrap"><h1>Board nicht verfügbar</h1><p>Bitte mit dem Eigentümer-Konto anmelden. Das Board ist privat oder die Adresse ist ungültig.</p><NuxtLink :to="`/login?redirect=${encodeURIComponent($route.path)}`" class="btn btn-primary">Anmelden</NuxtLink><NuxtLink to="/playlists">Meine Gameshows</NuxtLink></main>
  <template #fallback><main class="wrap">Board-Editor wird geladen …</main></template>
  </ClientOnly>
</template>
