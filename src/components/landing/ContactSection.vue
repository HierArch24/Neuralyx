<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useSupabase } from '@/composables/useSupabase'

const { submitContactMessage, loading, error } = useSupabase()
const submitted = ref(false)

const form = reactive({
  name: '',
  email: '',
  subject: '',
  message: '',
})

async function handleSubmit() {
  try {
    await submitContactMessage({ ...form })
    submitted.value = true
    Object.assign(form, { name: '', email: '', subject: '', message: '' })
  } catch {
    // error is set by composable
  }
}
</script>

<template>
  <section id="contact" class="relative py-32 px-6">
    <div class="max-w-3xl mx-auto">
      <h2 class="text-3xl md:text-5xl font-display font-bold text-center mb-4">
        <span class="text-gradient-angelic">Get in Touch</span>
      </h2>
      <p class="text-gray-400 text-center max-w-xl mx-auto mb-12">
        Have a project in mind or want to collaborate? Let's connect.
      </p>

      <!-- Success message -->
      <div v-if="submitted" class="text-center py-16">
        <div class="text-5xl mb-4">✓</div>
        <h3 class="text-xl font-semibold text-angelic-gold mb-2">Message Sent!</h3>
        <p class="text-gray-400">Thanks for reaching out. I'll get back to you soon.</p>
        <button
          @click="submitted = false"
          class="mt-6 text-sm text-cyber-cyan hover:text-white transition-colors"
        >
          Send another message
        </button>
      </div>

      <!-- Contact form -->
      <form v-else @submit.prevent="handleSubmit" class="space-y-5">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label class="block text-sm text-gray-400 mb-1.5">Name</label>
            <input
              v-model="form.name"
              type="text"
              required
              class="w-full px-4 py-3 bg-neural-800 border border-neural-600 rounded-lg text-white placeholder-gray-500 focus:border-cyber-purple focus:outline-none transition-colors"
              placeholder="Your name"
            />
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1.5">Email</label>
            <input
              v-model="form.email"
              type="email"
              required
              class="w-full px-4 py-3 bg-neural-800 border border-neural-600 rounded-lg text-white placeholder-gray-500 focus:border-cyber-purple focus:outline-none transition-colors"
              placeholder="your@email.com"
            />
          </div>
        </div>

        <div>
          <label class="block text-sm text-gray-400 mb-1.5">Subject</label>
          <input
            v-model="form.subject"
            type="text"
            required
            class="w-full px-4 py-3 bg-neural-800 border border-neural-600 rounded-lg text-white placeholder-gray-500 focus:border-cyber-purple focus:outline-none transition-colors"
            placeholder="What's this about?"
          />
        </div>

        <div>
          <label class="block text-sm text-gray-400 mb-1.5">Message</label>
          <textarea
            v-model="form.message"
            required
            rows="5"
            class="w-full px-4 py-3 bg-neural-800 border border-neural-600 rounded-lg text-white placeholder-gray-500 focus:border-cyber-purple focus:outline-none transition-colors resize-none"
            placeholder="Tell me about your project..."
          />
        </div>

        <p v-if="error" class="text-red-400 text-sm">{{ error }}</p>

        <button
          type="submit"
          :disabled="loading"
          class="w-full py-3 bg-cyber-purple hover:bg-cyber-purple/80 disabled:opacity-50 text-white font-medium rounded-lg transition-all"
        >
          {{ loading ? 'Sending...' : 'Send Message' }}
        </button>
      </form>

      <!-- Social links -->
      <div class="flex justify-center gap-6 mt-12">
        <a
          href="https://github.com/HierArch24"
          target="_blank"
          class="text-gray-400 hover:text-white transition-colors"
        >
          GitHub
        </a>
        <a
          href="https://linkedin.com"
          target="_blank"
          class="text-gray-400 hover:text-white transition-colors"
        >
          LinkedIn
        </a>
        <a
          href="mailto:contact@neuralyx.dev"
          class="text-gray-400 hover:text-white transition-colors"
        >
          Email
        </a>
      </div>
    </div>
  </section>
</template>
