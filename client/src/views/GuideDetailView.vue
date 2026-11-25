<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useQuery } from '@urql/vue'
import { graphql } from '../gql'
import NoticeList from '../components/NoticeList.vue'
import RichText from '../components/RichText.vue'

// The guide and its notices in one request. The text comes from Contentful through our GraphQL
// API (Guide.body); the API falls back to Postgres for the facts when the CMS has no entry.
const GuideDetailDocument = graphql(/* GraphQL */ `
  query GuideDetail($slug: String!) {
    guide(slug: $slug) {
      id
      slug
      title
      region
      difficulty
      lengthKm
      body {
        type
        runs {
          text
          bold
          italic
          href
        }
        items {
          runs {
            text
            bold
            italic
            href
          }
        }
      }
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

const { data, fetching, error } = useQuery({
  query: GuideDetailDocument,
  variables: computed(() => ({ slug: String(route.params.slug) })),
})

const guide = computed(() => data.value?.guide ?? null)
const notices = computed(() => guide.value?.notices ?? [])
</script>

<template>
  <p v-if="error" role="alert">{{ error.message }}</p>
  <p v-else-if="fetching">Laddar…</p>
  <p v-else-if="!guide" role="alert">Guiden hittades inte.</p>
  <article v-else class="guide">
    <h1>{{ guide.title }}</h1>
    <p class="muted">{{ guide.region }} · {{ guide.difficulty }} · {{ guide.lengthKm }} km</p>
    <NoticeList :notices="notices" />
    <RichText v-if="guide.body.length" :blocks="guide.body" />
    <p v-else class="muted">Guidens text är inte tillgänglig just nu.</p>
  </article>
</template>

<style scoped>
.muted {
  color: #777;
  font-size: 14px;
}
</style>
