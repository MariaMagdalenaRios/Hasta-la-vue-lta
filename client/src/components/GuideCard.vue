<script setup lang="ts">
import type { GuideSummary } from '../../lib/guides'

const { guide } = defineProps<{
  guide: GuideSummary
}>()
</script>

<template>
  <div class="card">
    <RouterLink :to="'/guider/' + guide.slug">{{ guide.title }}</RouterLink>
    <p class="muted">{{ guide.region }} · {{ guide.difficulty }} · {{ guide.length_km }} km</p>
    <p class="excerpt">{{ guide.excerpt }}</p>
  </div>
</template>

<style scoped>
.card {
  border: 1px solid #ddd;
  padding: 1em;
  border-radius: 1em;
  background-color: rgba(128, 128, 128, 0.148);
}
</style>
