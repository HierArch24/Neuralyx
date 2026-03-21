<template>
  <section id="skills" ref="sectionRef" class="relative py-16 overflow-hidden">
    <!-- Parallax background - oversized for scroll movement -->
    <div ref="bgRef" class="absolute bg-cover bg-center will-change-transform" style="background-image: url('/assets/images/intel/UC3.png'); top: -15%; left: 0; right: 0; height: 130%;"></div>
    <div class="absolute inset-0 bg-neural-900/75"></div>

    <div class="relative z-10 max-w-6xl mx-auto px-6">
      <div class="mb-6 text-center sm:text-left">
        <h4 class="font-[Poppins] font-semibold text-white/60 uppercase text-sm tracking-[0.15em]">Skills and Services</h4>
        <span class="block w-[50px] h-[3px] mt-3 mx-auto sm:mx-0 mix-blend-screen" style="background-color: var(--dark-shade-6)"></span>
      </div>

      <div ref="tableRef" class="overflow-x-auto">
        <table class="custom-table w-full text-white text-center">
          <thead>
            <tr>
              <th class="bg-black/40">Category</th>
              <th class="bg-black/40">AI & Machine Learning</th>
              <th class="bg-black/40">Mobile App Development</th>
              <th class="bg-black/40">Web Development</th>
              <th class="bg-black/40">DevOps & Automation</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="bg-black/40 font-semibold">Languages</td>
              <td>Python, R, SQL</td>
              <td>Java, Kotlin, Dart, C#</td>
              <td>TypeScript, JavaScript, PHP, Python</td>
              <td>Bash, YAML, Python</td>
            </tr>
            <tr>
              <td class="bg-black/40 font-semibold">Database / Storage</td>
              <td colspan="4">PostgreSQL, MySQL, MongoDB, SQLite, Room, Firebase, Supabase, Redis<br><strong>Vector DB</strong>: Pinecone, Weaviate, Faiss, ChromaDB &nbsp;|&nbsp; <strong>OS</strong>: Linux, Windows, Android</td>
            </tr>
            <tr>
              <td class="bg-black/40 font-semibold">Libraries</td>
              <td>NumPy, Pandas, Matplotlib, TorchVision, Keras, PyTorch, Scikit-learn, OpenCV, YOLOv11, OpenVINO, Transformers<br><strong>Platforms</strong>: Roboflow, HuggingFace</td>
              <td>React Native, Jetpack Compose, Retrofit, RxJava, Kotlin Coroutines, Glide, Dagger Hilt, Cordova</td>
              <td>Vue.js 3, React, GSAP, Tailwind CSS, jQuery, Pinia, Axios</td>
              <td>Docker Compose, GitHub Actions, Playwright, Nginx</td>
            </tr>
            <tr>
              <td class="bg-black/40 font-semibold">Frameworks / Tools</td>
              <td>TensorFlow, Langchain, LlamaIndex, Langflow, Jupyter, Anaconda, Claude API, OpenAI API</td>
              <td>Ionic, Capacitor, PWA Builder, Multi-OS Engine, Codename One, Android Studio</td>
              <td>Vite, Django, Flask, Laravel, CodeIgniter, Bootstrap, WordPress, Cpanel</td>
              <td>Docker, AWS, GCP, DigitalOcean, Git, n8n, Zapier, Make</td>
            </tr>
            <tr>
              <td class="bg-black/40 font-semibold">AI Automation</td>
              <td><strong>Agent Frameworks</strong>: Langchain, LlamaIndex, Claude Agent SDK, CrewAI</td>
              <td colspan="3"><strong>Platforms</strong>: n8n, Zapier, Make, Smythos, Abacus.AI, Ringcentral, Synthesia, GHL, Slack, Delphi.AI, Airtable, 11labs</td>
            </tr>
            <tr>
              <td class="bg-black/40 font-semibold">Game Dev</td>
              <td colspan="4">Unity (C#), Blender 3D Modelling, OpenGL, DirectX &nbsp;|&nbsp; <strong>Soft Skills</strong>: Analytical Thinking, Problem-Solving, Leadership, Continuous Learning, Teamwork, Communication</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { gsap } from '@/lib/gsap-setup'

const sectionRef = ref<HTMLElement | null>(null)
const bgRef = ref<HTMLElement | null>(null)
const tableRef = ref<HTMLElement | null>(null)
let ctx: gsap.Context | null = null

onMounted(() => {
  if (!sectionRef.value) return
  ctx = gsap.context(() => {
    // Parallax background scroll
    gsap.fromTo(bgRef.value,
      { yPercent: -8 },
      {
        yPercent: 8,
        ease: 'none',
        scrollTrigger: { trigger: sectionRef.value, start: 'top bottom', end: 'bottom top', scrub: true }
      }
    )
    gsap.fromTo(tableRef.value,
      { y: 40, opacity: 0 },
      {
        y: 0, opacity: 1, duration: 0.8, ease: 'power2.out',
        scrollTrigger: { trigger: tableRef.value, start: 'top 90%', toggleActions: 'play none none none' }
      }
    )
  }, sectionRef.value)
})

onUnmounted(() => { ctx?.revert() })
</script>
