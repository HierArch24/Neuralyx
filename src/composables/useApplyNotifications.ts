import { ref, onUnmounted } from 'vue'

export interface ApplyNotification {
  id: string
  title: string
  company: string
  status: 'applied' | 'apply_failed' | 'needs_browser' | 'skipped'
  method: string
  detail?: string
  timestamp: string
  dismissed?: boolean
}

const notifications = ref<ApplyNotification[]>([])
let eventSource: EventSource | null = null
let refCount = 0

function connect() {
  if (eventSource) return
  const mcpUrl = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8080'
  eventSource = new EventSource(`${mcpUrl}/api/notifications/stream`)

  eventSource.addEventListener('apply', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data) as ApplyNotification
      data.id = data.id || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      notifications.value.unshift(data)
      // Auto-dismiss after 8 seconds
      setTimeout(() => {
        const idx = notifications.value.findIndex(n => n.id === data.id)
        if (idx >= 0) notifications.value.splice(idx, 1)
      }, 8000)
    } catch { /* ignore parse errors */ }
  })

  eventSource.onerror = () => {
    eventSource?.close()
    eventSource = null
    // Reconnect after 5s
    setTimeout(() => { if (refCount > 0) connect() }, 5000)
  }
}

function disconnect() {
  eventSource?.close()
  eventSource = null
}

export function useApplyNotifications() {
  refCount++
  connect()

  onUnmounted(() => {
    refCount--
    if (refCount <= 0) { disconnect(); refCount = 0 }
  })

  function dismiss(id: string) {
    const idx = notifications.value.findIndex(n => n.id === id)
    if (idx >= 0) notifications.value.splice(idx, 1)
  }

  return { notifications, dismiss }
}
