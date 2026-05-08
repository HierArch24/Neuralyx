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
              <td>Python, R</td>
              <td>Java, Kotlin, Flutter (Dart), PHP / Basic Web Tech</td>
              <td>JavaScript, TypeScript, Python, PHP, WordPress</td>
              <td>C#, C++, JavaScript &nbsp;<span class="opacity-60">(Game Dev)</span></td>
            </tr>
            <tr>
              <td class="bg-black/40 font-semibold">Database / Storage</td>
              <td colspan="4">MySQL, PostgreSQL (pgvector), MongoDB, SQLite, Room, Firebase, Supabase &nbsp;|&nbsp; <strong>Vector DB</strong>: Pinecone, Weaviate, Faiss &nbsp;|&nbsp; <strong>OS</strong>: Linux, Windows, Android</td>
            </tr>
            <tr>
              <td class="bg-black/40 font-semibold">Libraries</td>
              <td>NumPy, Pandas, Matplotlib, TorchVision, Keras, PyTorch, Scikit-learn, OpenCV, YOLOv11, OpenVINO<br><strong>Platforms</strong>: Roboflow, HuggingFace</td>
              <td>React Native, Cordova, Retrofit, RxJava, Jetpack, Kotlin Coroutines, Glide, Dagger Hilt</td>
              <td>React Native, Vue.js, Angular, jQuery, ASP.NET</td>
              <td>OpenGL, DirectX &nbsp;<span class="opacity-60">(Unity / Blender)</span></td>
            </tr>
            <tr>
              <td class="bg-black/40 font-semibold">Frameworks / Tools</td>
              <td>Jupyter Notebook, Anaconda, Docker, LangChain, Langflow, LlamaIndex, TensorFlow, AWS (EC2, Lambda), Google Cloud, DigitalOcean, Git</td>
              <td>Multi-OS Engine, Codename One, Appcelerator Titanium, Ionic, Cordova, Capacitor, PWA Builder, Git</td>
              <td>Bootstrap, Tailwind, Django, Flask, Laravel, CodeIgniter, cPanel, Git, Vercel</td>
              <td>Unity, Blender, Git</td>
            </tr>
            <tr>
              <td class="bg-black/40 font-semibold">Automation Workflow</td>
              <td colspan="2" class="text-left px-4">
                <strong>Low-Code Platforms</strong>: n8n, Zapier, Make, SmythOS, Abacus.AI<br>
                <strong>AI Coding Tools</strong>: Claude Code, Claude Design, Codex (GPT), Qwen, Ollama, GitHub Copilot, Letta Code
              </td>
              <td colspan="2" class="text-left px-4">
                <strong>Platforms</strong>: RingCentral, Synthesia, GoHighLevel, Slack, Delphi.AI, HuggingFace, Airtable, Lovable, 11labs<br>
                <strong>Default Frameworks</strong>: MCP setup, Skills setup, Embedding, Transformers, Prompt Engineering, Multi-Agent Orchestration, Message Parsing, State Management
              </td>
            </tr>
            <tr>
              <td class="bg-black/40 font-semibold">CRM / Collab / Comms</td>
              <td colspan="4">GoHighLevel, HubSpot, Zoho, Google Workspace, Jira / Atlassian, Slack, Contentful, ClickUp, MS Teams &nbsp;|&nbsp; <strong>Methodology</strong>: Scrum Master</td>
            </tr>
            <tr>
              <td class="bg-black/40 font-semibold">Soft Skills</td>
              <td colspan="4">Analytical Thinking, Continuous Learning, Problem-Solving, Time Management, Communication, Teamwork, Leadership, Critical Thinking</td>
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
