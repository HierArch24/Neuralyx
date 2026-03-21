<template>
  <Teleport to="body">
    <Transition name="resume-modal">
      <div v-if="resume.isOpen.value" class="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6" @click.self="resume.close()" @keydown.escape="resume.close()">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/75 backdrop-blur-sm"></div>

        <!-- Modal -->
        <div ref="modalRef" class="relative w-full max-w-7xl max-h-[95vh] h-[95vh] rounded-2xl border border-white/10 overflow-hidden flex flex-col will-change-transform"
             style="background: linear-gradient(180deg, rgba(18,18,31,0.99), rgba(10,10,18,1));">
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.06] flex-shrink-0">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg overflow-hidden border border-white/10 flex-shrink-0"
                   style="background: linear-gradient(135deg, rgba(139,92,246,0.3), rgba(34,211,238,0.15));">
                <img src="/assets/images/neuralyx-logo.jpg" alt="NEURALYX" class="w-full h-full object-cover" />
              </div>
              <div>
                <h3 class="font-[Syncopate] text-xs font-bold uppercase tracking-wider text-white">Resume</h3>
                <p class="text-[10px] font-[Poppins] text-white/30">ATS Format</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <a href="/assets/documents/resume.pdf" target="_blank"
                 class="px-3 py-1.5 rounded-lg text-[11px] font-[Poppins] font-medium bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Download PDF
              </a>
              <button @click="resume.close()" class="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center transition-colors">
                <svg class="w-5 h-5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          </div>

          <!-- Scroll shadow top indicator -->
          <div class="scroll-shadow-top flex-shrink-0" :class="{ 'opacity-100': scrollTop > 10, 'opacity-0': scrollTop <= 10 }"></div>

          <!-- Scrollable resume content -->
          <div ref="scrollRef" class="resume-scroll-container overflow-y-auto flex-1 min-h-0 p-6 sm:p-10" data-lenis-prevent @scroll="onScroll">
            <div ref="resumeContentRef" class="resume-render max-w-6xl mx-auto pb-10" v-html="content.resumeHtml"></div>
          </div>

          <!-- Scroll shadow bottom indicator -->
          <div class="scroll-shadow-bottom flex-shrink-0" :class="{ 'opacity-100': !isAtBottom, 'opacity-0': isAtBottom }"></div>
        </div>

        <!-- Certificate Image Viewer -->
        <Transition name="cert-viewer">
          <div v-if="certImageOpen" class="fixed inset-0 z-[110] flex items-center justify-center p-4" @click.self="closeCertImage()">
            <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
            <div class="relative max-w-4xl max-h-[90vh] rounded-xl border border-white/10 overflow-hidden"
                 style="background: rgba(18,18,31,0.98);">
              <div class="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
                <span class="text-xs text-white/50 font-[Poppins]">{{ certImageTitle }}</span>
                <div class="flex items-center gap-2">
                  <a v-if="certImageUrl" :href="certImageUrl" target="_blank"
                     class="px-2 py-1 rounded text-[10px] bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                    Open Original
                  </a>
                  <button @click="closeCertImage()" class="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center transition-colors">
                    <svg class="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              </div>
              <div class="p-4 overflow-auto max-h-[80vh]" data-lenis-prevent>
                <img :src="certImageSrc" :alt="certImageTitle" class="w-full h-auto rounded-lg" />
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'
import { useResumeModal } from '@/composables/useResumeModal'
import { useContentStore } from '@/stores/content'

const resume = useResumeModal()
const content = useContentStore()
const modalRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const resumeContentRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const isAtBottom = ref(false)

// Certificate image viewer state
const certImageOpen = ref(false)
const certImageSrc = ref('')
const certImageUrl = ref('')
const certImageTitle = ref('')

function closeCertImage() {
  certImageOpen.value = false
  certImageSrc.value = ''
  certImageUrl.value = ''
  certImageTitle.value = ''
}

function handleCertClick(e: Event) {
  const target = e.target as HTMLElement

  // Handle new View button
  const btn = target.closest('.cert-view-btn') as HTMLElement | null
  if (btn) {
    e.preventDefault()
    e.stopPropagation()
    const certImage = btn.dataset.certImage || ''
    const item = btn.closest('.cert-item')
    const title = item?.querySelector('.cert-name')?.textContent || 'Certificate'

    if (certImage) {
      // If it's a PDF, open in new tab
      if (certImage.toLowerCase().endsWith('.pdf')) {
        window.open(certImage, '_blank', 'noopener')
        return
      }
      certImageSrc.value = certImage
      certImageUrl.value = ''
      certImageTitle.value = title
      certImageOpen.value = true
    }
    return
  }

  // Handle legacy cert-link clicks
  const link = target.closest('.cert-link') as HTMLAnchorElement | null
  if (!link) return

  e.preventDefault()
  e.stopPropagation()

  const certUrl = link.dataset.certUrl || ''
  const certImage = link.dataset.certImage || ''
  const title = link.textContent || 'Certificate'

  if (certImage) {
    if (certImage.toLowerCase().endsWith('.pdf')) {
      window.open(certImage, '_blank', 'noopener')
      return
    }
    certImageSrc.value = certImage
    certImageUrl.value = certUrl
    certImageTitle.value = title
    certImageOpen.value = true
    return
  }

  if (certUrl) {
    window.open(certUrl, '_blank', 'noopener')
    return
  }
}

function onScroll() {
  if (!scrollRef.value) return
  scrollTop.value = scrollRef.value.scrollTop
  const { scrollHeight, clientHeight } = scrollRef.value
  isAtBottom.value = scrollRef.value.scrollTop + clientHeight >= scrollHeight - 20
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (certImageOpen.value) {
      closeCertImage()
    } else if (resume.isOpen.value) {
      resume.close()
    }
  }
}

function attachCertListeners() {
  if (!resumeContentRef.value) return
  resumeContentRef.value.addEventListener('click', handleCertClick)
}

function detachCertListeners() {
  if (!resumeContentRef.value) return
  resumeContentRef.value.removeEventListener('click', handleCertClick)
}

onMounted(() => { document.addEventListener('keydown', handleKeydown) })
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  detachCertListeners()
})

watch(() => resume.isOpen.value, async (open) => {
  if (open) {
    await nextTick()
    scrollTop.value = 0
    isAtBottom.value = false
    if (scrollRef.value) scrollRef.value.scrollTop = 0
    attachCertListeners()
    if (modalRef.value) {
      gsap.fromTo(modalRef.value,
        { opacity: 0, y: 50, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power3.out' }
      )
    }
  } else {
    detachCertListeners()
    closeCertImage()
  }
})
</script>

<style>
/* Custom scrollbar for resume modal */
.resume-scroll-container::-webkit-scrollbar {
  width: 6px;
}
.resume-scroll-container::-webkit-scrollbar-track {
  background: rgba(255,255,255,0.03);
  border-radius: 3px;
}
.resume-scroll-container::-webkit-scrollbar-thumb {
  background: rgba(139,92,246,0.3);
  border-radius: 3px;
}
.resume-scroll-container::-webkit-scrollbar-thumb:hover {
  background: rgba(139,92,246,0.5);
}

/* Scroll shadow indicators */
.scroll-shadow-top {
  height: 2px;
  background: linear-gradient(to bottom, rgba(139,92,246,0.3), transparent);
  transition: opacity 0.3s ease;
  pointer-events: none;
}
.scroll-shadow-bottom {
  height: 2px;
  background: linear-gradient(to top, rgba(139,92,246,0.3), transparent);
  transition: opacity 0.3s ease;
  pointer-events: none;
}

/* Resume rendering styles */
.resume-render .resume-ats {
  color: rgba(255,255,255,0.8);
  font-family: 'Poppins', sans-serif;
  font-size: 0.85rem;
  line-height: 1.7;
}

.resume-render .resume-header {
  text-align: center;
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.resume-render .resume-header h1 {
  font-family: 'Syncopate', sans-serif;
  font-size: clamp(1.1rem, 2.5vw, 1.6rem);
  font-weight: 700;
  letter-spacing: 0.1em;
  background: linear-gradient(135deg, #8b5cf6, #22d3ee, #f59e0b);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 0.5rem;
}

.resume-render .contact-line {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.4);
}

.resume-render .contact-line a {
  color: rgba(34,211,238,0.6);
  text-decoration: none;
  transition: color 0.2s ease;
}
.resume-render .contact-line a:hover {
  color: rgba(34,211,238,0.9);
}

.resume-render .tagline {
  font-size: 0.8rem;
  color: rgba(255,255,255,0.5);
  font-style: italic;
  margin-top: 0.5rem;
}

.resume-render .resume-section {
  margin-bottom: 2rem;
}

.resume-render .resume-section h2 {
  font-family: 'Syncopate', sans-serif;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: #8b5cf6;
  padding-bottom: 0.5rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid rgba(139,92,246,0.2);
}

.resume-render .resume-section > p {
  font-size: 0.82rem;
  color: rgba(255,255,255,0.6);
  line-height: 1.7;
}

.resume-render .job {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.resume-render .job:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.resume-render .job-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.resume-render .job-header h3 {
  font-size: 0.9rem;
  font-weight: 600;
  color: white;
}

.resume-render .company {
  font-weight: 400;
  color: rgba(255,255,255,0.5);
}

.resume-render .company-name {
  font-size: 0.8rem;
  color: rgba(34,211,238,0.7);
}

.resume-render .dates {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.35);
  white-space: nowrap;
  flex-shrink: 0;
}

.resume-render .section-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: rgba(139,92,246,0.7);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-top: 0.75rem;
  margin-bottom: 0.4rem;
}

.resume-render ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.resume-render ul li {
  position: relative;
  padding-left: 1.2rem;
  margin-bottom: 0.6rem;
  font-size: 0.8rem;
  color: rgba(255,255,255,0.6);
}

.resume-render ul li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.55rem;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #8b5cf6;
}

.resume-render ul li strong {
  color: rgba(255,255,255,0.85);
}

/* View More Projects link */
.resume-render .view-more-projects {
  text-align: center;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.resume-render .view-more-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1.2rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(34,211,238,0.8);
  background: rgba(34,211,238,0.08);
  border: 1px solid rgba(34,211,238,0.15);
  border-radius: 8px;
  text-decoration: none;
  transition: all 0.2s ease;
  font-family: 'Poppins', sans-serif;
}
.resume-render .view-more-link:hover {
  color: rgba(34,211,238,1);
  background: rgba(34,211,238,0.15);
  border-color: rgba(34,211,238,0.3);
}

/* Skills Table */
.resume-render .skills-table-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  margin: 0 -0.5rem;
  padding: 0 0.5rem;
}

.resume-render .skills-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.72rem;
  line-height: 1.5;
}

.resume-render .skills-table thead th {
  font-family: 'Syncopate', sans-serif;
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(139,92,246,0.9);
  padding: 0.5rem 0.4rem;
  border-bottom: 2px solid rgba(139,92,246,0.25);
  text-align: left;
  white-space: normal;
  word-break: break-word;
}

.resume-render .skills-table thead th:first-child {
  width: 130px;
}
.resume-render .skills-table thead th:not(:first-child) {
  width: calc((100% - 130px) / 4);
}

.resume-render .skills-table tbody td {
  padding: 0.5rem;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  vertical-align: top;
  color: rgba(255,255,255,0.6);
}

.resume-render .skills-table tbody td strong {
  color: rgba(139,92,246,0.7);
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.resume-render .skills-table .cat-label {
  font-weight: 600;
  color: rgba(139,92,246,0.8);
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
  background: rgba(139,92,246,0.05);
}

.resume-render .skill-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.12rem 0.35rem;
  margin: 0.08rem;
  border-radius: 4px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  font-size: 0.62rem;
  color: rgba(255,255,255,0.65);
  white-space: nowrap;
  transition: background 0.2s;
}

.resume-render .skill-chip:hover {
  background: rgba(139,92,246,0.1);
  border-color: rgba(139,92,246,0.2);
}

.resume-render .skill-chip i {
  font-size: 0.8rem;
  line-height: 1;
  opacity: 0.8;
}

.resume-render .certs-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.resume-render .certs-list li {
  font-size: 0.78rem;
}
.resume-render .certs-list .cert-issuer {
  color: rgba(255,255,255,0.35);
  font-size: 0.7rem;
}

/* Certificate item with View button */
.resume-render .cert-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.resume-render .cert-item::before {
  display: none;
}
.resume-render .cert-item .cert-info {
  flex: 1;
  min-width: 0;
}
.resume-render .cert-item .cert-name {
  color: rgba(255,255,255,0.8);
}
.resume-render .cert-view-btn {
  flex-shrink: 0;
  padding: 0.35rem 0.9rem;
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(34,211,238,0.7);
  background: rgba(34,211,238,0.08);
  border: 1px solid rgba(34,211,238,0.15);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: 'Poppins', sans-serif;
}
.resume-render .cert-view-btn:hover {
  color: rgba(34,211,238,1);
  background: rgba(34,211,238,0.15);
  border-color: rgba(34,211,238,0.3);
}

/* Certificate links */
.resume-render .cert-link {
  color: rgba(34,211,238,0.7);
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s ease;
  border-bottom: 1px dashed rgba(34,211,238,0.3);
}
.resume-render .cert-link:hover {
  color: rgba(34,211,238,1);
  border-bottom-color: rgba(34,211,238,0.6);
}
/* Show icons based on data attributes */
.resume-render .cert-link[data-cert-image]:not([data-cert-image=""])::after {
  content: ' 🖼';
  font-size: 0.7rem;
}
.resume-render .cert-link[data-cert-url]:not([data-cert-url=""])[data-cert-image=""]::after {
  content: ' ↗';
  font-size: 0.65rem;
  opacity: 0.5;
}

/* Certificate viewer transitions */
.cert-viewer-enter-active, .cert-viewer-leave-active {
  transition: opacity 0.25s ease;
}
.cert-viewer-enter-from, .cert-viewer-leave-to {
  opacity: 0;
}

/* Transition */
.resume-modal-enter-active, .resume-modal-leave-active {
  transition: opacity 0.3s ease;
}
.resume-modal-enter-from, .resume-modal-leave-to {
  opacity: 0;
}
</style>
