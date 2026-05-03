<script setup lang="ts">
import { useApplyNotifications } from '@/composables/useApplyNotifications'

const { notifications, dismiss } = useApplyNotifications()

const statusConfig: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  applied: { icon: '✅', color: 'text-green-400', bg: 'border-green-500/40', label: 'Applied' },
  apply_failed: { icon: '❌', color: 'text-red-400', bg: 'border-red-500/40', label: 'Failed' },
  needs_browser: { icon: '🌐', color: 'text-blue-400', bg: 'border-blue-500/40', label: 'Browser Needed' },
  skipped: { icon: '⏭️', color: 'text-gray-400', bg: 'border-gray-500/40', label: 'Skipped' },
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-[9999] flex flex-col gap-3 max-w-md">
      <TransitionGroup name="toast">
        <div
          v-for="n in notifications"
          :key="n.id"
          class="bg-[#0d0d1a]/95 backdrop-blur-xl border rounded-xl p-4 shadow-2xl cursor-pointer"
          :class="statusConfig[n.status]?.bg || 'border-gray-500/40'"
          @click="dismiss(n.id)"
        >
          <div class="flex items-start gap-3">
            <span class="text-xl mt-0.5">{{ statusConfig[n.status]?.icon || '📋' }}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs font-medium px-2 py-0.5 rounded-full bg-white/5"
                      :class="statusConfig[n.status]?.color || 'text-gray-400'">
                  {{ statusConfig[n.status]?.label || n.status }}
                </span>
                <span class="text-[10px] text-gray-500">{{ new Date(n.timestamp).toLocaleTimeString() }}</span>
              </div>
              <p class="text-sm font-semibold text-white truncate">{{ n.title }}</p>
              <p class="text-xs text-gray-400 truncate">{{ n.company }} · {{ n.method }}</p>
              <p v-if="n.detail" class="text-[11px] text-gray-500 mt-1 truncate">{{ n.detail }}</p>
            </div>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active { animation: slideIn 0.3s ease-out; }
.toast-leave-active { animation: slideOut 0.25s ease-in forwards; }
.toast-move { transition: transform 0.3s ease; }
@keyframes slideIn { from { opacity: 0; transform: translateX(100px); } to { opacity: 1; transform: translateX(0); } }
@keyframes slideOut { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(100px); } }
</style>
