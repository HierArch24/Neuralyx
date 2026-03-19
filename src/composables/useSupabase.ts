import { ref } from 'vue'
import { supabase } from '@/lib/supabase'

export function useSupabase() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function submitContactMessage(data: {
    name: string
    email: string
    subject: string
    message: string
  }) {
    loading.value = true
    error.value = null
    try {
      const { error: err } = await supabase.from('contact_messages').insert(data as never)
      if (err) throw err
    } catch (e) {
      error.value = (e as Error).message
      throw e
    } finally {
      loading.value = false
    }
  }

  return { supabase, loading, error, submitContactMessage }
}
