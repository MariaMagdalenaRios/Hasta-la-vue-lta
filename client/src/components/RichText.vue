<script setup lang="ts">
defineProps<{
  paragraphs?: {
    runs: TextRun[]
  }[]
  blocks?: RichTextBlock[]
}>()

type TextRun = {
  text: string
  bold: boolean
  italic: boolean
  href?: string | null
}

type RichTextBlock = {
  // paragraph, heading-2, heading-3 or unordered-list. GraphQL sends a String, and an unknown
  // type is shown as a paragraph, so the text is never lost.
  type: string
  runs: TextRun[]
  items: { runs: TextRun[] }[]
}
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
    <template v-if="blocks">
      <template v-for="(block, index) in blocks" :key="index">
        <h2 v-if="block.type === 'heading-2'">
          <template v-for="(run, i) in block.runs" :key="i">
            <strong v-if="run.bold"
              ><em v-if="run.italic">{{ run.text }}</em
              ><template v-else>{{ run.text }}</template></strong
            >
            <em v-else-if="run.italic">{{ run.text }}</em>
            <template v-else>{{ run.text }}</template>
          </template>
        </h2>

        <h3 v-else-if="block.type === 'heading-3'">
          <template v-for="(run, i) in block.runs" :key="i">
            <strong v-if="run.bold">{{ run.text }}</strong>
            <em v-else-if="run.italic">{{ run.text }}</em>
            <template v-else>{{ run.text }}</template>
          </template>
        </h3>

        <ul v-else-if="block.type === 'unordered-list'">
          <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
            <template v-for="(run, i) in item.runs" :key="i">
              <a
                v-if="run.href && isSafeLink(run.href)"
                :href="run.href"
                target="_blank"
                rel="noopener noreferrer"
                >{{ run.text }}</a
              >
              <strong v-else-if="run.bold">{{ run.text }}</strong>
              <em v-else-if="run.italic">{{ run.text }}</em>
              <template v-else>{{ run.text }}</template>
            </template>
          </li>
        </ul>

        <p v-else>
          <template v-for="(run, i) in block.runs" :key="i">
            <a
              v-if="run.href && isSafeLink(run.href)"
              :href="run.href"
              target="_blank"
              rel="noopener noreferrer"
              >{{ run.text }}</a
            >
            <strong v-else-if="run.bold">{{ run.text }}</strong>
            <em v-else-if="run.italic">{{ run.text }}</em>
            <template v-else>{{ run.text }}</template>
          </template>
        </p>
      </template>
    </template>

    <template v-else>
      <p v-for="(paragraph, paragraphIndex) in paragraphs ?? []" :key="paragraphIndex">
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
    </template>
  </div>
</template>
