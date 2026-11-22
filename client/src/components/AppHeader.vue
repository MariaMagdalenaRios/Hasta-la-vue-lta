<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

function logout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <header class="topbar">
    <RouterLink to="/" class="logo">Utpost</RouterLink>

    <nav>
      <RouterLink to="/guides">Guider</RouterLink>
      <RouterLink to="/tours">Turer</RouterLink>

      <template v-if="auth.isLoggedIn">
        <RouterLink to="/profil" class="username">{{ auth.user?.display_name }}</RouterLink>
        <button class="button-logout" @click="logout">Logga ut</button>
      </template>

      <RouterLink v-else to="/login">Logga in</RouterLink>
    </nav>
  </header>
</template>
