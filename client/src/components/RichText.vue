<script setup lang="ts">
defineProps<{
  paragraphs: {
    runs: {
      text: string
      bold: boolean
      italic: boolean
      href?: string | null
    }[]
  }[]
}>()

function isSafeLink(href?: string | null): boolean {
  if (!href) return false

  try {
    const url = new URL(href, 'https://example.com')
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}
</script>

<template>
  <div class="rich-text">
    <p v-for="(paragraph, paragraphIndex) in paragraphs" :key="paragraphIndex">
      <template v-for="(run, runIndex) in paragraph.runs" :key="runIndex">
        <a
          v-if="run.href && isSafeLink(run.href)"
          :href="run.href"
          target="_blank"
          rel="noopener noreferrer"
        >
          <strong v-if="run.bold">
            <em v-if="run.italic">{{ run.text }}</em>
            <template v-else>{{ run.text }}</template>
          </strong>
          <em v-else-if="run.italic">{{ run.text }}</em>
          <template v-else>{{ run.text }}</template>
        </a>

        <strong v-else-if="run.bold">
          <em v-if="run.italic">{{ run.text }}</em>
          <template v-else>{{ run.text }}</template>
        </strong>
        <em v-else-if="run.italic">{{ run.text }}</em>
        <template v-else>{{ run.text }}</template>
      </template>
    </p>
  </div>
</template>
