<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import DOMPurify from 'dompurify'
import type { Guide } from '@utpost/shared'
import { useQuery } from '@urql/vue'
import { get } from '../api'
import { graphql } from '../gql'
import NoticeList from '../components/NoticeList.vue'

// Notices live in the CMS and only reach the client through /graphql (Guide.notices).
const GuideNoticesDocument = graphql(/* GraphQL */ `
  query GuideNotices($slug: String!) {
    guide(slug: $slug) {
      notices {
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
  }
`)

const route = useRoute()

// A failed notices query must not hide the guide, so errors here just mean no notices.
const { data: noticeData } = useQuery({
  query: GuideNoticesDocument,
  variables: computed(() => ({ slug: String(route.params.slug) })),
})
const notices = computed(() => noticeData.value?.guide?.notices ?? [])
const guide = ref<Guide | null>(null)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    guide.value = await get<Guide>(`/guides/${route.params.slug}`)
  } catch (err) {
    error.value = (err as Error).message
  }
})

// The guide body is HTML from the database (debt item 3), so it is sanitized before v-html.
const bodyHtml = computed(() => DOMPurify.sanitize(guide.value?.body_html ?? ''))
</script>

<template>
  <p v-if="error" role="alert">{{ error }}</p>
  <p v-else-if="!guide">Laddar…</p>
  <article v-else class="guide">
    <h1>{{ guide.title }}</h1>
    <p class="muted">{{ guide.region }} · {{ guide.difficulty }} · {{ guide.length_km }} km</p>
    <NoticeList :notices="notices" />
    <div v-html="bodyHtml" />
  </article>
</template>

<style scoped>
.muted {
  color: #777;
  font-size: 14px;
}
</style>
