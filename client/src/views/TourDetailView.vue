<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import type { TourDetail, PhotoUploadRequest, PhotoUploadResponse } from '@utpost/shared'
import { get, post } from '../api'
import { distanceKm, formatTime } from '../../lib/format'
import { elevationGain } from '../../lib/tours'

const route = useRoute()
const tour = ref<TourDetail | null>(null)
const error = ref<string | null>(null)
const uploadResult = ref<PhotoUploadResponse | null>(null)
const uploadError = ref<string | null>(null)
const uploading = ref(false)

onMounted(async () => {
  try {
    tour.value = await get<TourDetail>(`/tours/${route.params.id}`)
  } catch (err) {
    error.value = (err as Error).message
  }
})

async function handleImageUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !tour.value) return

  uploading.value = true
  uploadError.value = null
  uploadResult.value = null

  try {
    const bitmap = await createImageBitmap(file)

    const request: PhotoUploadRequest = {
      tourId: tour.value.id,
      filename: file.name,
      width: bitmap.width,
      height: bitmap.height,
    }

    bitmap.close()

    const result = await post<PhotoUploadResponse | { error: string }>('/photos', request)

    if ('error' in result) {
      throw new Error('Bilden kunde inte behandlas. Försök igen senare.')
    }

    uploadResult.value = result
  } catch (err) {
    uploadError.value = (err as Error).message
  } finally {
    uploading.value = false
  }
}

// Ported straight from TourDetail.jsx – same calculation, same result.
const climb = computed(() => (tour.value ? elevationGain(tour.value.logs) : 0))
</script>

<template>
  <p v-if="error" role="alert">{{ error }}</p>
  <p v-else-if="!tour">Laddar…</p>
  <div v-else>
    <h1>{{ tour.title }}</h1>
    <p class="muted">
      {{ distanceKm(tour.distance_m) }} km · {{ tour.logs.length }} mätpunkter ·
      {{ climb }} höjdmeter
    </p>
    <p v-if="tour.notes">{{ tour.notes }}</p>

    <h2>Lägg till bild</h2>
    <input type="file" accept="image/*" :disabled="uploading" @change="handleImageUpload" />

    <p v-if="uploading">Behandlar bilden…</p>
    <p v-if="uploadError" role="alert">{{ uploadError }}</p>

    <div v-if="uploadResult">
      <h3>Bildbehandling klar!</h3>

      <p>Bearbetningstid: {{ uploadResult.processingMs }} ms</p>
      <p>API-tid: {{ uploadResult.apiMs }} ms</p>

      <p v-if="uploadResult.coldStart">Kallstart</p>

      <h3>Bildvarianter</h3>
      <ul>
        <li v-for="variant in uploadResult.variants" :key="variant.size">
          {{ variant.size }} px – {{ variant.signature }}
        </li>
      </ul>
    </div>

    <h2>Mätpunkter</h2>
    <ol class="logs">
      <li v-for="log in tour.logs" :key="log.id">
        {{ formatTime(log.recorded_at) }} · {{ log.elevation_m }} m · {{ log.heart_rate }} slag/min
      </li>
    </ol>
  </div>
</template>

<style scoped>
.muted {
  color: #777;
  font-size: 14px;
}
.logs {
  font-size: 14px;
  color: #444;
  padding-left: 40px;
}
</style>
