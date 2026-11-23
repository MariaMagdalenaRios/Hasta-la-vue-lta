<script setup lang="ts">
import RichText from './RichText.vue'

defineProps<{
  notices: {
    id: string
    title: string
    level: string
    status: string
    body: {
      runs: {
        text: string
        bold: boolean
        italic: boolean
        href?: string | null
      }[]
    }[]
  }[]
}>()
</script>

<template>
  <section v-if="notices.length" class="notice-list" aria-label="Notices">
    <article
      v-for="notice in notices"
      :key="notice.id"
      class="notice"
      :class="`notice--${notice.level.toLowerCase()}`"
    >
      <div class="notice__heading">
        <h2>{{ notice.title }}</h2>
        <span v-if="notice.status !== 'published'" class="notice__draft"> Draft </span>
      </div>

      <RichText :paragraphs="notice.body" />
    </article>
  </section>
</template>
