<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleLogin() {
  loading.value = true
  error.value = ''
  try {
    await auth.login(email.value, password.value)
    const redirect = (route.query.redirect as string) || '/admin'
    router.push(redirect)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-neural-900 flex items-center justify-center px-6">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-display font-bold text-gradient-cyber mb-2">NEURALYX</h1>
        <p class="text-gray-400">Admin Login</p>
      </div>

      <form @submit.prevent="handleLogin" class="glass-dark rounded-xl p-8 space-y-5">
        <div>
          <label class="block text-sm text-gray-400 mb-1.5">Email</label>
          <input
            v-model="email"
            type="email"
            required
            class="w-full px-4 py-3 bg-neural-800 border border-neural-600 rounded-lg text-white focus:border-cyber-purple focus:outline-none"
          />
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-1.5">Password</label>
          <input
            v-model="password"
            type="password"
            required
            class="w-full px-4 py-3 bg-neural-800 border border-neural-600 rounded-lg text-white focus:border-cyber-purple focus:outline-none"
          />
        </div>

        <p v-if="error" class="text-red-400 text-sm">{{ error }}</p>

        <button
          type="submit"
          :disabled="loading"
          class="w-full py-3 bg-cyber-purple hover:bg-cyber-purple/80 disabled:opacity-50 text-white font-medium rounded-lg transition-all"
        >
          {{ loading ? 'Signing in...' : 'Sign In' }}
        </button>
      </form>

      <p class="text-center mt-6">
        <RouterLink to="/" class="text-sm text-gray-500 hover:text-white transition-colors">
          &larr; Back to site
        </RouterLink>
      </p>
    </div>
  </div>
</template>
