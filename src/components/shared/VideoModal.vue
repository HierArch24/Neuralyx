<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="fixed inset-0 z-[9999] flex items-center justify-center" @click.self="close">
        <div class="absolute inset-0 bg-black/90 backdrop-blur-sm" @click="close"></div>
        <div class="relative z-10 flex flex-col items-center mx-4 max-h-[90vh]">
          <button
            class="absolute -top-10 right-0 text-white/70 hover:text-white text-3xl transition-colors z-10"
            @click="close"
          >
            &times;
          </button>
          <video
            ref="videoRef"
            :src="src"
            controls
            autoplay
            class="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain"
            @ended="close"
          />
          <p v-if="title" class="text-white/60 text-center mt-3 text-sm font-[Poppins]">{{ title }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  src: string
  title?: string
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const videoRef = ref<HTMLVideoElement | null>(null)

function close() {
  if (videoRef.value) {
    videoRef.value.pause()
  }
  emit('close')
}

watch(() => props.visible, (val) => {
  if (val) {
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
