<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('admin@neuralyx.dev')
const password = ref('')
const error = ref('')
const loading = ref(false)
const showPassword = ref(false)

async function handleLogin() {
  loading.value = true
  error.value = ''
  try {
    await auth.login(email.value, password.value)
    const redirect = (route.query.redirect as string) || '/admin'
    router.push(redirect)
  } catch (e) {
    error.value = (e as Error).message || 'Invalid credentials'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-6 relative overflow-hidden" style="background-color: var(--dark-shade-1)">
    <!-- Animated background -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="absolute -top-[40%] -left-[20%] w-[600px] h-[600px] rounded-full opacity-[0.04]"
           style="background: radial-gradient(circle, var(--gradient-start), transparent 70%);"></div>
      <div class="absolute -bottom-[30%] -right-[15%] w-[500px] h-[500px] rounded-full opacity-[0.06]"
           style="background: radial-gradient(circle, var(--gradient-mid), transparent 70%);"></div>
      <div class="absolute top-[20%] right-[10%] w-[300px] h-[300px] rounded-full opacity-[0.03]"
           style="background: radial-gradient(circle, var(--gradient-end), transparent 70%);"></div>
    </div>

    <div class="w-full max-w-[420px] relative z-10">
      <!-- Logo & Header -->
      <div class="text-center mb-10">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5 overflow-hidden border border-white/10"
             style="background: linear-gradient(135deg, rgba(139,92,246,0.2), rgba(34,211,238,0.1));">
          <img src="/assets/images/neuralyx-logo.jpg" alt="NEURALYX" class="w-full h-full object-cover" />
        </div>
        <h1 class="font-[Syncopate] text-2xl font-bold uppercase tracking-wider bg-clip-text text-transparent mb-2"
            style="background-image: linear-gradient(135deg, var(--gradient-start), var(--gradient-mid), var(--gradient-end))">
          NEURALYX
        </h1>
        <p class="text-white/40 text-sm font-[Poppins]">Admin Control Panel</p>
      </div>

      <!-- Login Card -->
      <div class="rounded-2xl p-8 border border-white/[0.06]"
           style="background: linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));">

        <!-- Error -->
        <div v-if="error" class="mb-5 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p class="text-red-400 text-sm flex items-center gap-2">
            <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
            </svg>
            {{ error }}
          </p>
        </div>

        <form @submit.prevent="handleLogin" class="space-y-5">
          <!-- Email -->
          <div>
            <label class="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">Email</label>
            <div class="relative">
              <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30">
                <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
              </span>
              <input
                v-model="email"
                type="email"
                required
                placeholder="admin@neuralyx.dev"
                class="w-full pl-11 pr-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm placeholder-white/20 focus:border-[var(--gradient-start)] focus:bg-white/[0.06] focus:outline-none transition-all duration-300"
              />
            </div>
          </div>

          <!-- Password -->
          <div>
            <label class="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">Password</label>
            <div class="relative">
              <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30">
                <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
              </span>
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                required
                placeholder="Enter password"
                class="w-full pl-11 pr-11 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm placeholder-white/20 focus:border-[var(--gradient-start)] focus:bg-white/[0.06] focus:outline-none transition-all duration-300"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
              >
                <svg v-if="!showPassword" class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                <svg v-else class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Submit -->
          <button
            type="submit"
            :disabled="loading"
            class="w-full py-3.5 rounded-xl text-white font-medium text-sm transition-all duration-300 disabled:opacity-40 relative overflow-hidden group"
            style="background: linear-gradient(135deg, var(--gradient-start), var(--gradient-mid));"
          >
            <span class="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></span>
            <span class="relative flex items-center justify-center gap-2">
              <svg v-if="loading" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              {{ loading ? 'Authenticating...' : 'Sign In' }}
            </span>
          </button>
        </form>
      </div>

      <!-- Back link -->
      <div class="text-center mt-8">
        <RouterLink to="/" class="text-sm text-white/30 hover:text-white/60 transition-colors font-[Poppins] inline-flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
          </svg>
          Back to site
        </RouterLink>
      </div>
    </div>
  </div>
</template>
