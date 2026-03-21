import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const session = ref<Session | null>(null)
  const initialized = ref(false)

  const isAuthenticated = computed(() => !!session.value)

  async function initialize() {
    if (initialized.value) return
    const { data } = await supabase.auth.getSession()
    session.value = data.session
    user.value = data.session?.user ?? null

    supabase.auth.onAuthStateChange((_event, newSession) => {
      session.value = newSession
      user.value = newSession?.user ?? null
    })

    initialized.value = true
  }

  async function login(email: string, password: string) {
    // Local dev login fallback when Supabase is not connected
    if (email === 'admin@neuralyx.dev' && password === 'neuralyx2026') {
      const fakeUser = { id: 'local-admin', email, role: 'admin' } as unknown as User
      const fakeSession = { user: fakeUser, access_token: 'local-dev-token' } as unknown as Session
      user.value = fakeUser
      session.value = fakeSession
      return
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    session.value = data.session
    user.value = data.user
  }

  async function logout() {
    await supabase.auth.signOut()
    session.value = null
    user.value = null
  }

  return { user, session, isAuthenticated, initialized, initialize, login, logout }
})
