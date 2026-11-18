<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { Tour } from '@utpost/shared'
import { get } from '../api'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()
const tours = ref<Tour[]>([])
const error = ref<string | null>(null)

// Same approach as the old React page: fetch all tours and keep the user's own (debt item 10).
onMounted(async () => {
  if (!auth.user) return
  try {
    const all = await get<Tour[]>('/tours')
    tours.value = all.filter((t) => t.user_id === auth.user?.id)
  } catch (err) {
    error.value = (err as Error).message
  }
})

function logout() {
  auth.logout()
  router.push('/')
}
</script>

<template>
  <p v-if="!auth.user">Du är inte inloggad.</p>
  <div v-else>
    <h1>{{ auth.user.display_name }}</h1>
    <p class="muted">{{ auth.user.email }} · {{ auth.user.role }}</p>
    <h2>Mina turer ({{ tours.length }})</h2>
    <p v-if="error" role="alert">{{ error }}</p>
    <ul>
      <li v-for="t in tours" :key="t.id">
        <RouterLink :to="`/turer/${t.id}`">{{ t.title }}</RouterLink>
      </li>
    </ul>
    <button class="button-logout" @click="logout">Logga ut</button>
  </div>
</template>

<style scoped>
.muted {
  color: #777;
  font-size: 14px;
}
</style>
