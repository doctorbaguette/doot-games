<script setup lang="ts">
useDootSeo({ title: 'Birthday Gameshow 2027', description: 'Drei Challenges, eine Lobby: der Birthday-Board-Prototyp.' })
</script>

<template>
  <ClientOnly><SessionHostRoom board-prototype /><template #fallback><div>Birthday Gameshow wird vorbereitet …</div></template></ClientOnly>
</template>
