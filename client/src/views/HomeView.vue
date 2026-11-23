<script setup lang="ts">
import { useQuery } from '@urql/vue'
import { graphql } from '../gql'
import { computed, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import NoticeList from '../components/NoticeList.vue'

const HomeDocument = graphql(/* GraphQL */ `
  query Home($preview: Boolean = false) {
    guides {
      slug
      title
      region
      difficulty
      lengthKm
    }
    tours(limit: 5) {
      id
      title
      distanceM
    }
    notices(preview: $preview) {
      id
      title
      level
      status
      guideSlug
      body {
        runs {
          text
          bold
          italic
          href
        }
      }
    }
  }
`)

const authStore = useAuthStore()
const preview = ref(false)

const isEditor = computed(() => authStore.user?.role === 'editor')

// Only editors can turn preview on; the server checks the role again and answers FORBIDDEN otherwise.
const previewEnabled = computed(() => isEditor.value && preview.value)

const { data, fetching, error } = useQuery({
  query: HomeDocument,
  variables: computed(() => ({ preview: previewEnabled.value })),
  // Drafts change while the editor writes, so preview always asks the server.
  requestPolicy: computed(() => (previewEnabled.value ? 'network-only' : 'cache-first')),
})
const popularGuides = computed(() => data.value?.guides.slice(0, 6) ?? [])
const regionCount = computed(
  () => new Set(data.value?.guides.map((guide) => guide.region) ?? []).size,
)
</script>

<template>
  <label v-if="isEditor" class="preview-toggle">
    <input v-model="preview" type="checkbox" />
    Visa utkast (förhandsgranskning)
  </label>

  <p v-if="error" role="alert">Kunde inte hämta startsidan: {{ error.message }}</p>
  <p v-else-if="fetching || !data">Laddar…</p>
  <div v-else>
    <section class="hero">
      <h1>Hitta din nästa tur</h1>
      <p>{{ data.guides.length }} guider i {{ regionCount }} landskap.</p>
    </section>

    <NoticeList :notices="data.notices" />

    <h2>Populärast just nu</h2>
    <ul class="list">
      <li v-for="g in popularGuides" :key="g.slug">
        <RouterLink :to="`/guider/${g.slug}`">{{ g.title }}</RouterLink>
        <span class="muted"> {{ g.region }}</span>
      </li>
    </ul>

    <h2>Senaste turerna</h2>
    <ul class="list">
      <li v-for="t in data.tours" :key="t.id">
        <RouterLink :to="`/turer/${t.id}`">{{ t.title }}</RouterLink>
        <span class="muted"> {{ Math.round(t.distanceM / 100) / 10 }} km</span>
      </li>
    </ul>

    <h2>Alla guider</h2>
    <ul class="list">
      <li v-for="g in data.guides" :key="g.slug">
        <RouterLink :to="`/guider/${g.slug}`">{{ g.title }}</RouterLink>
        <span class="muted"> {{ g.region }} · {{ g.difficulty }} · {{ g.lengthKm }} km</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.hero {
  padding: 24px 0;
}
.preview-toggle {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  margin-top: 16px;
}
.list {
  padding-left: 18px;
}
.muted {
  color: #777;
  font-size: 14px;
}
</style>
