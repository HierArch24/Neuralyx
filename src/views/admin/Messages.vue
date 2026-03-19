<script setup lang="ts">
import { onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'

const admin = useAdminStore()

onMounted(() => admin.fetchMessages())

async function markRead(id: string) {
  await admin.markMessageRead(id)
  await admin.fetchMessages()
}

async function handleDelete(id: string) {
  if (confirm('Delete this message?')) {
    await admin.deleteRow('contact_messages', id)
    await admin.fetchMessages()
  }
}
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-white mb-8">Messages</h2>

    <div v-if="!admin.messages.length" class="glass-dark rounded-xl p-12 text-center">
      <p class="text-gray-400">No messages yet.</p>
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="msg in admin.messages"
        :key="msg.id"
        class="glass-dark rounded-xl p-6"
        :class="{ 'border-l-4 border-l-cyber-cyan': !msg.is_read }"
      >
        <div class="flex items-start justify-between mb-3">
          <div>
            <div class="flex items-center gap-3">
              <h3 class="text-white font-medium">{{ msg.subject }}</h3>
              <span v-if="!msg.is_read" class="text-xs px-2 py-0.5 bg-cyber-cyan/20 text-cyber-cyan rounded-full">New</span>
            </div>
            <p class="text-sm text-gray-400">
              From {{ msg.name }} ({{ msg.email }}) &middot;
              {{ new Date(msg.created_at).toLocaleDateString() }}
            </p>
          </div>
          <div class="flex gap-2">
            <button
              v-if="!msg.is_read"
              @click="markRead(msg.id)"
              class="text-xs text-cyber-cyan hover:text-white transition-colors"
            >
              Mark Read
            </button>
            <button
              @click="handleDelete(msg.id)"
              class="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
        <p class="text-gray-300 text-sm whitespace-pre-wrap">{{ msg.message }}</p>
      </div>
    </div>
  </div>
</template>
