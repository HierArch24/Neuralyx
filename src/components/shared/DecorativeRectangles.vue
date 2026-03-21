<template>
  <div class="decorative-rectangles absolute inset-0 pointer-events-none overflow-hidden">
    <div :data-depth="depths[0]" class="absolute inset-0">
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="absolute w-[60px] h-[200px] bg-white/5 top-[15%] right-[10%]"></div>
      </div>
    </div>
    <div :data-depth="depths[1]" class="absolute inset-0">
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="absolute w-[40px] h-[140px] bg-white/[0.03] bottom-[20%] left-[8%]"></div>
      </div>
    </div>
    <div :data-depth="depths[2]" class="absolute inset-0">
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="absolute w-[50px] h-[170px] bg-black/20 top-[30%] left-[15%]"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  depths?: [number, number, number]
}>(), {
  depths: () => [1.3, 0.7, 1.0]
})
</script>
