<template>
  <footer class="relative py-12" style="background-color: var(--dark-shade-2)">
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="absolute inset-0 opacity-50"
           style="background: linear-gradient(135deg, rgba(139,92,246,0.05), rgba(34,211,238,0.03), rgba(245,158,11,0.02))"></div>
    </div>

    <div class="relative max-w-6xl mx-auto px-6">
      <span class="block w-full h-px bg-white/10 mb-8"></span>

      <div class="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <h5 class="font-[Poppins] text-white/80 text-sm">Inquire me for any work related :3</h5>
        <p class="text-white/50 text-sm">
          Contact me also on Facebook:
          <a href="https://www.facebook.com/Empsy19" target="_blank" rel="noopener noreferrer"
             class="text-cyber-purple hover:text-cyber-cyan transition-colors">
            Empsy19
          </a>
        </p>
      </div>

      <div class="text-center mt-8">
        <p class="text-white/30 text-xs font-[Poppins]">&copy; {{ new Date().getFullYear() }} NEURALYX. All rights reserved.</p>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
</script>
