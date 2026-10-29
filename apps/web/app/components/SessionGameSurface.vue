<script setup lang="ts">
import { injectDootRoom, provideDootRoom } from '@doot-games/engine/vue'
import type { GamePlugin } from '@doot-games/sdk'
import { onScopeDispose, type Component } from 'vue'
import { createSessionGameScope } from '../utils/sessionGameAdapter'
const props = defineProps<{ plugin: GamePlugin; view: Component; executionId: string; host?: boolean }>()
const scope = createSessionGameScope(injectDootRoom(), props.executionId)
provideDootRoom(scope.room)
onScopeDispose(() => scope.dispose(!!props.host))
</script>

<template>
  <component :is="view" :plugin="plugin" :session-mode="true" />
</template>
