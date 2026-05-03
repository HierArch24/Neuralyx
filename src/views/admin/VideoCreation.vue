<script setup lang="ts">
/**
 * Video Creation — Two-tab shell.
 *
 * Tab 1 (default): Interview Video Generator — the existing 6-step wizard.
 * Tab 2: Record — browser-native webcam recorder with MediaPipe virtual
 *                 background + (optional) ONNX eye-gaze correction.
 *
 * Wizard logic lives verbatim in ./video/InterviewWizardTab.vue. Record logic
 * lives in ./video/RecordTab.vue. Deep-link via `?tab=record`.
 */
import { ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import InterviewWizardTab from './video/InterviewWizardTab.vue'
import RecordTab from './video/RecordTab.vue'

type TabKey = 'wizard' | 'record'

const route = useRoute()
const router = useRouter()
const activeTab = ref<TabKey>('wizard')

function readTabFromQuery(): TabKey {
  const q = String(route.query.tab || '').toLowerCase()
  return q === 'record' ? 'record' : 'wizard'
}

onMounted(() => {
  activeTab.value = readTabFromQuery()
})

watch(() => route.query.tab, () => {
  activeTab.value = readTabFromQuery()
})

function setTab(t: TabKey) {
  if (activeTab.value === t) return
  activeTab.value = t
  router.replace({ query: { ...route.query, tab: t === 'wizard' ? undefined : t } })
}
</script>

<template>
  <div class="max-w-5xl mx-auto">
    <!-- Tab switcher -->
    <div class="mb-5 flex items-center gap-1 border-b border-neural-700">
      <button @click="setTab('wizard')"
        class="relative px-4 py-2.5 text-sm font-semibold transition-all flex items-center gap-2 -mb-px border-b-2"
        :class="activeTab === 'wizard'
          ? 'text-white border-cyber-cyan'
          : 'text-gray-500 hover:text-gray-300 border-transparent'">
        <span>🎬</span>
        <span>Interview Video Generator</span>
      </button>
      <button @click="setTab('record')"
        class="relative px-4 py-2.5 text-sm font-semibold transition-all flex items-center gap-2 -mb-px border-b-2"
        :class="activeTab === 'record'
          ? 'text-white border-cyber-cyan'
          : 'text-gray-500 hover:text-gray-300 border-transparent'">
        <span>🔴</span>
        <span>Record</span>
        <span class="text-[9px] px-1.5 py-0.5 rounded-full bg-cyber-purple/20 text-cyber-purple border border-cyber-purple/30 font-mono">NEW</span>
      </button>
    </div>

    <!-- Tab body -->
    <KeepAlive>
      <InterviewWizardTab v-if="activeTab === 'wizard'" />
      <RecordTab v-else />
    </KeepAlive>
  </div>
</template>
