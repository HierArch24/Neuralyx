/**
 * Platform Factory
 * Returns the correct adapter for a given platform name.
 * Import adapters lazily to avoid loading Playwright in non-browser contexts.
 */

import type { PlatformAdapter } from './platform-adapter.interface.js'

// Adapter registry — populated on first use
const _adapters: Map<string, PlatformAdapter> = new Map()

async function loadAdapter(platform: string): Promise<PlatformAdapter> {
  switch (platform) {
    case 'linkedin': {
      const { LinkedInAdapter } = await import('./linkedin-adapter.js')
      return new LinkedInAdapter()
    }
    case 'indeed': {
      const { IndeedAdapter } = await import('./indeed-adapter.js')
      return new IndeedAdapter()
    }
    case 'kalibrr': {
      const { KalibrrAdapter } = await import('./kalibrr-adapter.js')
      return new KalibrrAdapter()
    }
    case 'jobslin': {
      const { JobslinAdapter } = await import('./jobslin-adapter.js')
      return new JobslinAdapter()
    }
    case 'onlinejobs': {
      const { OnlineJobsAdapter } = await import('./onlinejobs-adapter.js')
      return new OnlineJobsAdapter()
    }
    default:
      throw new Error(`No adapter registered for platform: ${platform}`)
  }
}

export async function getAdapter(platform: string): Promise<PlatformAdapter> {
  if (!_adapters.has(platform)) {
    const adapter = await loadAdapter(platform)
    _adapters.set(platform, adapter)
  }
  return _adapters.get(platform)!
}

export const SUPPORTED_PLATFORMS = ['linkedin', 'indeed', 'kalibrr', 'jobslin', 'onlinejobs'] as const
export type SupportedPlatform = typeof SUPPORTED_PLATFORMS[number]

export function isSupportedPlatform(p: string): p is SupportedPlatform {
  return SUPPORTED_PLATFORMS.includes(p as SupportedPlatform)
}
