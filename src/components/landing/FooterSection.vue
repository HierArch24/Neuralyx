<template>
  <footer class="relative py-8 px-6 border-t border-neural-700">
    <div class="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
      <p class="text-sm text-gray-500">
        &copy; {{ new Date().getFullYear() }} NEURALYX — Gabriel Alvin Aquino
      </p>

      <div class="flex items-center gap-6">
        <RouterLink to="/" class="text-sm text-gray-500 hover:text-white transition-colors">Home</RouterLink>
        <RouterLink to="/projects" class="text-sm text-gray-500 hover:text-white transition-colors">Projects</RouterLink>
        <RouterLink to="/skills" class="text-sm text-gray-500 hover:text-white transition-colors">Skills</RouterLink>
        <RouterLink to="/tools" class="text-sm text-gray-500 hover:text-white transition-colors">Tools</RouterLink>
      </div>
    </div>
  </footer>
</template>
