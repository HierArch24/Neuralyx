import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Project, Skill, Tool, NewsArticle } from '@/types/database'

const uid = () => crypto.randomUUID()
const now = new Date().toISOString()

const FALLBACK_SKILLS: Skill[] = [
  // Programming Languages
  { id: uid(), name: 'Python', category: 'programming', icon: '🐍', proficiency: 95, years_experience: 5, created_at: now, updated_at: now },
  { id: uid(), name: 'TypeScript', category: 'programming', icon: '🔷', proficiency: 90, years_experience: 4, created_at: now, updated_at: now },
  { id: uid(), name: 'JavaScript', category: 'programming', icon: '⚡', proficiency: 92, years_experience: 5, created_at: now, updated_at: now },
  { id: uid(), name: 'Kotlin', category: 'programming', icon: '🟣', proficiency: 80, years_experience: 3, created_at: now, updated_at: now },
  { id: uid(), name: 'C#', category: 'programming', icon: '🎯', proficiency: 78, years_experience: 3, created_at: now, updated_at: now },
  { id: uid(), name: 'Java', category: 'programming', icon: '☕', proficiency: 75, years_experience: 3, created_at: now, updated_at: now },
  { id: uid(), name: 'Dart', category: 'programming', icon: '💎', proficiency: 70, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'SQL', category: 'programming', icon: '🗃️', proficiency: 88, years_experience: 4, created_at: now, updated_at: now },
  { id: uid(), name: 'GDScript', category: 'programming', icon: '🎮', proficiency: 60, years_experience: 1, created_at: now, updated_at: now },
  // LLM & AI Agents
  { id: uid(), name: 'LangChain', category: 'llm-agents', icon: '🔗', proficiency: 93, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'CrewAI', category: 'llm-agents', icon: '🤖', proficiency: 90, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'OpenAI API', category: 'llm-agents', icon: '🧠', proficiency: 95, years_experience: 3, created_at: now, updated_at: now },
  { id: uid(), name: 'Claude API / MCP', category: 'llm-agents', icon: '🟠', proficiency: 92, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'RAG Pipelines', category: 'llm-agents', icon: '📚', proficiency: 88, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'LlamaIndex', category: 'llm-agents', icon: '🦙', proficiency: 82, years_experience: 1, created_at: now, updated_at: now },
  { id: uid(), name: 'Gemini API', category: 'llm-agents', icon: '✨', proficiency: 80, years_experience: 1, created_at: now, updated_at: now },
  { id: uid(), name: 'Vector Databases', category: 'llm-agents', icon: '📐', proficiency: 85, years_experience: 2, created_at: now, updated_at: now },
  // ML / AI
  { id: uid(), name: 'TensorFlow', category: 'ml-ai', icon: '🧠', proficiency: 82, years_experience: 3, created_at: now, updated_at: now },
  { id: uid(), name: 'PyTorch', category: 'ml-ai', icon: '🔥', proficiency: 78, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'Scikit-learn', category: 'ml-ai', icon: '📊', proficiency: 85, years_experience: 3, created_at: now, updated_at: now },
  { id: uid(), name: 'YOLOv11', category: 'ml-ai', icon: '👁️', proficiency: 80, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'Computer Vision', category: 'ml-ai', icon: '📷', proficiency: 78, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'NLP', category: 'ml-ai', icon: '💬', proficiency: 80, years_experience: 2, created_at: now, updated_at: now },
  // Full-Stack Frameworks
  { id: uid(), name: 'Vue.js', category: 'full-stack', icon: '💚', proficiency: 92, years_experience: 4, created_at: now, updated_at: now },
  { id: uid(), name: 'React', category: 'full-stack', icon: '⚛️', proficiency: 84, years_experience: 3, created_at: now, updated_at: now },
  { id: uid(), name: 'Node.js', category: 'full-stack', icon: '🟢', proficiency: 90, years_experience: 4, created_at: now, updated_at: now },
  { id: uid(), name: 'FastAPI', category: 'full-stack', icon: '🚀', proficiency: 88, years_experience: 3, created_at: now, updated_at: now },
  { id: uid(), name: 'Django', category: 'full-stack', icon: '🎸', proficiency: 78, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'Flask', category: 'full-stack', icon: '🧪', proficiency: 80, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'Tailwind CSS', category: 'full-stack', icon: '🎨', proficiency: 94, years_experience: 3, created_at: now, updated_at: now },
  { id: uid(), name: 'GSAP', category: 'full-stack', icon: '✨', proficiency: 85, years_experience: 2, created_at: now, updated_at: now },
  // Database & Backend
  { id: uid(), name: 'PostgreSQL', category: 'database', icon: '🐘', proficiency: 88, years_experience: 4, created_at: now, updated_at: now },
  { id: uid(), name: 'Supabase', category: 'database', icon: '⚡', proficiency: 90, years_experience: 3, created_at: now, updated_at: now },
  { id: uid(), name: 'MongoDB', category: 'database', icon: '🍃', proficiency: 75, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'Firebase', category: 'database', icon: '🔥', proficiency: 80, years_experience: 3, created_at: now, updated_at: now },
  { id: uid(), name: 'Redis', category: 'database', icon: '🔴', proficiency: 70, years_experience: 1, created_at: now, updated_at: now },
  { id: uid(), name: 'ChromaDB', category: 'database', icon: '🎨', proficiency: 78, years_experience: 1, created_at: now, updated_at: now },
  // Automation & DevOps
  { id: uid(), name: 'n8n', category: 'automation', icon: '⚙️', proficiency: 92, years_experience: 3, created_at: now, updated_at: now },
  { id: uid(), name: 'Zapier', category: 'automation', icon: '⚡', proficiency: 88, years_experience: 3, created_at: now, updated_at: now },
  { id: uid(), name: 'Make (Integromat)', category: 'automation', icon: '🔄', proficiency: 82, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'GitHub Actions', category: 'automation', icon: '🔧', proficiency: 85, years_experience: 3, created_at: now, updated_at: now },
  { id: uid(), name: 'Docker', category: 'automation', icon: '🐳', proficiency: 88, years_experience: 3, created_at: now, updated_at: now },
  // Mobile Development
  { id: uid(), name: 'Flutter', category: 'mobile', icon: '📱', proficiency: 78, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'Android (Kotlin)', category: 'mobile', icon: '🤖', proficiency: 80, years_experience: 3, created_at: now, updated_at: now },
  { id: uid(), name: 'React Native', category: 'mobile', icon: '📲', proficiency: 72, years_experience: 1, created_at: now, updated_at: now },
  // Cloud & Deployment
  { id: uid(), name: 'AWS', category: 'cloud', icon: '☁️', proficiency: 75, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'GCP', category: 'cloud', icon: '🌐', proficiency: 72, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'Vercel', category: 'cloud', icon: '▲', proficiency: 85, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'DigitalOcean', category: 'cloud', icon: '🌊', proficiency: 80, years_experience: 2, created_at: now, updated_at: now },
  { id: uid(), name: 'Cloudflare', category: 'cloud', icon: '🛡️', proficiency: 82, years_experience: 2, created_at: now, updated_at: now },
  // Game Dev
  { id: uid(), name: 'Godot', category: 'game-dev', icon: '🎮', proficiency: 65, years_experience: 1, created_at: now, updated_at: now },
  { id: uid(), name: 'Unity', category: 'game-dev', icon: '🕹️', proficiency: 60, years_experience: 1, created_at: now, updated_at: now },
]

const FALLBACK_PROJECTS: Project[] = [
  {
    id: uid(), title: 'NEURALYX Portfolio', slug: 'neuralyx-portfolio',
    description: 'Cinematic portfolio with scroll-synced video background, parallax animations, and admin dashboard. Built with Vue 3, TypeScript, GSAP, and Supabase.',
    image_url: null, tech_stack: ['Vue 3', 'TypeScript', 'GSAP', 'Tailwind CSS', 'Supabase'],
    category: 'web', github_url: 'https://github.com/HierArch24/NEURALYX', live_url: 'https://neuralyx.ai.dev-environment.site',
    video_url: null, is_featured: true, sort_order: 1, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'LIVITI AI Content Engine', slug: 'liviti-content-engine',
    description: 'Enterprise-grade AI content automation platform that replaced 6-8 specialists and $25K/mo in SaaS costs. Features a 5-agent AI pipeline (Orchestrator → Researcher → Writer → Critic → Editor), 10 Docker microservices, WordPress auto-publishing, SEO scoring engine, and multi-platform content repurposing to YouTube, Instagram, LinkedIn, Facebook & X — all from a single topic input.',
    image_url: '/assets/images/projects/liviti-blog-history.png', tech_stack: ['Vue 3', 'TypeScript', 'n8n', 'Supabase', 'Docker', 'Google Gemini', 'SearXNG', 'WordPress API', 'SerpBear', 'Semrush MCP'],
    category: 'ai', github_url: null, live_url: '/assets/documents/liviti-content-engine-overview.pdf',
    video_url: null, is_featured: true, sort_order: 2, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'AI Agent Orchestrator', slug: 'ai-agent-orchestrator',
    description: 'Multi-agent system using CrewAI and LangChain for automated research, content generation, and task delegation across intelligent AI agents.',
    image_url: null, tech_stack: ['Python', 'CrewAI', 'LangChain', 'OpenAI', 'FastAPI'],
    category: 'ai', github_url: null, live_url: null,
    video_url: null, is_featured: true, sort_order: 3, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'Billing System', slug: 'billing-system',
    description: 'Full-stack billing and invoice management system with real-time updates, role-based access, and automated payment tracking.',
    image_url: null, tech_stack: ['Vue.js', 'Supabase', 'PostgreSQL', 'Tailwind CSS'],
    category: 'web', github_url: null, live_url: null,
    video_url: null, is_featured: true, sort_order: 3, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'Digital Polygraph — Lie Detection', slug: 'digital-polygraph',
    description: 'AI-powered digital polygraph tool for lie detection course integration. Uses physiological signal analysis and machine learning to detect deception patterns in real-time.',
    image_url: null, tech_stack: ['Python', 'TensorFlow', 'OpenCV', 'Flask', 'JavaScript'],
    category: 'web', github_url: null, live_url: null,
    video_url: '/assets/videos/Digital Polygraph tool for lie Detection Course.mp4', is_featured: true, sort_order: 4, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'Facial Recognition Lie Detection', slug: 'facial-recognition-lie-detection',
    description: 'Computer vision system using facial micro-expression analysis and YOLOv11 to detect deception indicators with high accuracy across real-time video feeds.',
    image_url: null, tech_stack: ['Python', 'YOLOv11', 'OpenCV', 'PyTorch', 'FastAPI'],
    category: 'web', github_url: null, live_url: null,
    video_url: '/assets/videos/Facial Recognition Lie detection.mp4', is_featured: true, sort_order: 5, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'HR Portal & Employee Attendance — SIC', slug: 'hr-portal-sic',
    description: 'Comprehensive HR management and employee attendance portal for Speech Improvement Center. Features payroll automation, leave management, biometric integration, and real-time analytics.',
    image_url: null, tech_stack: ['PHP', 'MySQL', 'JavaScript', 'Bootstrap', 'HTML/CSS'],
    category: 'web', github_url: null, live_url: null,
    video_url: '/assets/videos/HR portal And Employee Attendance portal for SIC.mp4', is_featured: true, sort_order: 6, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'Ishaan LMS — Admin Dashboard', slug: 'ishaan-lms-admin',
    description: 'Full-featured learning management system admin dashboard built in React. Manages courses, student enrollment, progress tracking, assessments, and institutional reporting.',
    image_url: null, tech_stack: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Tailwind CSS'],
    category: 'web', github_url: null, live_url: null,
    video_url: '/assets/videos/Ishaan LMS Web Admin Dashboard  built in React.mp4', is_featured: true, sort_order: 7, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'Speech Improvement Center — SIC Database', slug: 'speech-improvement-center',
    description: 'Integrated clinical database system for Speech Improvement Center. Manages patient records, therapy sessions, progress tracking, appointment scheduling, and staff operations.',
    image_url: null, tech_stack: ['PHP', 'MySQL', 'JavaScript', 'CSS', 'HTML'],
    category: 'web', github_url: null, live_url: null,
    video_url: '/assets/videos/Speech Improvement Center.mp4', is_featured: true, sort_order: 8, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'Automation Pipeline Engine', slug: 'automation-pipeline',
    description: 'Custom workflow automation platform integrating n8n, webhooks, and AI-powered decision nodes for business process automation.',
    image_url: null, tech_stack: ['n8n', 'Node.js', 'PostgreSQL', 'Docker'],
    category: 'automation', github_url: null, live_url: null,
    video_url: null, is_featured: true, sort_order: 4, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'RAG Knowledge Base', slug: 'rag-knowledge-base',
    description: 'Retrieval-augmented generation system for intelligent document search and question answering over custom knowledge bases.',
    image_url: null, tech_stack: ['Python', 'LangChain', 'ChromaDB', 'FastAPI', 'OpenAI'],
    category: 'ai', github_url: null, live_url: null,
    video_url: null, is_featured: true, sort_order: 5, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'MCP Server Suite', slug: 'mcp-server-suite',
    description: 'Custom Model Context Protocol servers enabling AI assistants to interact with databases, APIs, and development tools.',
    image_url: null, tech_stack: ['TypeScript', 'MCP SDK', 'Supabase', 'Node.js'],
    category: 'ai', github_url: null, live_url: null,
    video_url: null, is_featured: true, sort_order: 6, created_at: now, updated_at: now,
  },
]

const FALLBACK_TOOLS: Tool[] = [
  // IDE & Code
  { id: uid(), name: 'VS Code', category: 'ide', icon: '💻', url: null, description: 'Primary code editor with extensive extensions', created_at: now, updated_at: now },
  { id: uid(), name: 'Cursor', category: 'ide', icon: '🖱️', url: null, description: 'AI-powered code editor', created_at: now, updated_at: now },
  { id: uid(), name: 'Claude Code', category: 'ide', icon: '🟠', url: null, description: 'AI coding assistant CLI for agentic development', created_at: now, updated_at: now },
  { id: uid(), name: 'Android Studio', category: 'ide', icon: '🤖', url: null, description: 'Android & Kotlin development', created_at: now, updated_at: now },
  // AI Tools
  { id: uid(), name: 'ChatGPT', category: 'ai-tools', icon: '🤖', url: null, description: 'OpenAI conversational AI & GPT-4o', created_at: now, updated_at: now },
  { id: uid(), name: 'Claude', category: 'ai-tools', icon: '🟠', url: null, description: 'Anthropic AI assistant & API', created_at: now, updated_at: now },
  { id: uid(), name: 'GitHub Copilot', category: 'ai-tools', icon: '🤝', url: null, description: 'AI pair programming', created_at: now, updated_at: now },
  { id: uid(), name: 'Midjourney', category: 'ai-tools', icon: '🎨', url: null, description: 'AI image generation', created_at: now, updated_at: now },
  { id: uid(), name: 'Hugging Face', category: 'ai-tools', icon: '🤗', url: null, description: 'Model hub & inference API', created_at: now, updated_at: now },
  // DevOps & Infra
  { id: uid(), name: 'Docker', category: 'devops', icon: '🐳', url: null, description: 'Containerization & orchestration', created_at: now, updated_at: now },
  { id: uid(), name: 'GitHub Actions', category: 'devops', icon: '⚙️', url: null, description: 'CI/CD pipeline automation', created_at: now, updated_at: now },
  { id: uid(), name: 'Cloudflare', category: 'devops', icon: '🌐', url: null, description: 'CDN, DNS, and edge workers', created_at: now, updated_at: now },
  { id: uid(), name: 'Nginx', category: 'devops', icon: '🔧', url: null, description: 'Reverse proxy & load balancing', created_at: now, updated_at: now },
  // Productivity & Design
  { id: uid(), name: 'Notion', category: 'productivity', icon: '📝', url: null, description: 'Knowledge management & docs', created_at: now, updated_at: now },
  { id: uid(), name: 'Figma', category: 'productivity', icon: '🎨', url: null, description: 'UI/UX design & prototyping', created_at: now, updated_at: now },
  { id: uid(), name: 'n8n', category: 'productivity', icon: '🔄', url: null, description: 'Workflow automation platform', created_at: now, updated_at: now },
  { id: uid(), name: 'Postman', category: 'productivity', icon: '📮', url: null, description: 'API testing & documentation', created_at: now, updated_at: now },
]

const FALLBACK_RESUME_HTML = `<div class="resume-ats">
  <header class="resume-header">
    <h1>GABRIEL ALVIN AQUINO</h1>
    <p class="contact-line">gabrielalvin.info@gmail.com &bull; github.com/HierArch24 &bull; linkedin.com/in/gabriel-alvin-aquino-56a1a0258</p>
    <p class="tagline">AI Systems Engineer &bull; Full-Stack Developer &bull; AI Automation Specialist</p>
  </header>

  <section class="resume-section">
    <h2>PROFESSIONAL SUMMARY</h2>
    <p>AI Systems Engineer and Full-Stack Developer with 8+ years of experience building production-grade intelligent systems. Specialized in LLM agent orchestration, RAG pipelines, computer vision, AI automation, and full-stack web & mobile development. Proven ability to replace entire teams with autonomous AI systems, delivering $400K+ annual savings. Proficient across 9+ programming languages, 50+ frameworks, and end-to-end DevOps pipelines.</p>
  </section>

  <section class="resume-section">
    <h2>WORK EXPERIENCE</h2>

    <div class="job">
      <div class="job-header">
        <div>
          <h3>Head Automation Engineer — AI / Full-Stack <span class="company">(Current)</span></h3>
          <p class="company-name">Excis Compliance Corporation · Remote (Philippines)</p>
        </div>
        <span class="dates">September 2025 – Present</span>
      </div>
      <ul>
        <li><strong>One-line summary:</strong> Led the design and delivery of an AI-driven billing automation platform that cut Excis Compliance Corporation's monthly billing cycle by <strong>~85%</strong>, removed <strong>~95%</strong> of manual invoice work, and brought audit traceability to <strong>100%</strong> — across four regions and a Tier-1 customer base (HCL/Caterpillar etc.).</li>
        <li>Architected an end-to-end automation that takes a finance operator from "raw tickets in ManageEngine" to "approved PO-deducted invoice ready for Xero" in a single browser session — AI handles validation, rate-card matching, and anomaly detection.</li>
        <li>Cut a typical monthly billing cycle from <strong>3–5 days</strong> of manual work down to <strong>under 2 hours</strong> per customer batch (~85–90% reduction).</li>
        <li>Drove rate-card match accuracy to <strong>~95%</strong> on first pass using a hybrid AI matcher (deterministic scoring + AI vector-search fallback) — replacing an LLM-only workflow that was both slower and less accurate, while reducing AI token spend by <strong>~80%</strong>.</li>
        <li>Reduced billing errors and rework by an estimated <strong>70–80%</strong> by validating every ticket with AI against the FSO calculation rules (Dispatch / Dedicated / SV / Standby / Project) before reviewer.</li>
        <li>Collapsed approval turnaround from days to minutes (<strong>~75% faster</strong>) via single-click in-app review, replacing the email-thread approval limbo.</li>
        <li>Delivered <strong>100% audit traceability</strong> (up from ~0%) — every ticket fetch, AI decision, rate-card match, human approval, PO deduction, and invoice push permanently logged with timestamps, actor, and reason.</li>
        <li>Scaled coverage from a single region to <strong>4 regions</strong> (APAC, EMEA, NAM, LATAM) in one pipeline, with automatic country → region inference and per-country VAT rule resolution.</li>
        <li>Cut PO reconciliation overhead by <strong>~60%</strong> with auto-matching + balance-before/after tracking, flagging PO over-utilisation before invoicing.</li>
        <li>Removed duplicate-ticket inflation overstating finance totals by up to <strong>6×</strong> on some PO reports — deduplication retrofit collapsed 212 raw rows to 33 true tickets, restoring trust in the figures.</li>
        <li>Replaced manual Xero entry with direct API push: invoices now auto-generate, get approved, and land in Xero as draft/submitted entries.</li>
        <li>Owned: pipeline (ServiceDesk → AI validation → rate-card match → Xero push), AI strategy & integration, operator-facing dashboards (Monitor Billing, Billing Run Wizard, PO Report, Step 4 Finalized Report), CI/CD to production cPanel, compliance/audit posture (versioned pre-billing files, OT/Weekend reason gates, tamper-evident timeline).</li>
      </ul>
    </div>

    <div class="job">
      <div class="job-header">
        <div>
          <h3>Lead Full-Stack Developer & AI Engineer <span class="company">(Solo Developer)</span></h3>
          <p class="company-name">Wonder Group Pty Ltd — Project: LIVITI AI Content Studio</p>
        </div>
        <span class="dates">January 27, 2026 – March 20, 2026</span>
      </div>
      <ul>
        <li>Architected and built a fully autonomous, AI-powered content generation platform from the ground up, replacing an entire content marketing team (10+ roles) with a system of 6 specialized AI agents, resulting in estimated annual savings of <strong>$474,000–$624,000</strong> in team and tooling costs.</li>
        <li>Designed and implemented a complex 6-agent AI pipeline (Orchestrator, Researcher, Writer, Critic, Editor, Image Agent) using n8n Cloud. Orchestrated multi-step workflows for researching, writing, scoring, and publishing SEO-optimized content, reducing the time to produce 5 complete blog articles from days to <strong>25–30 minutes</strong>.</li>
        <li>Engineered a proprietary 24-criteria SEO scoring engine (LIVITI Scorer) evaluating content across SEO, Tone, and Structure dimensions, ensuring a first-pass quality score of <strong>80–100%</strong>.</li>
        <li>Developed a full-featured, responsive Vue 3 dashboard with over <strong>40 custom components</strong>, featuring real-time pipeline monitoring, conversational AI chat interface, side-by-side content version comparison, and a comprehensive admin panel with 15 distinct management sections.</li>
        <li>Built a robust Node.js + Express backend API with over <strong>20 route modules</strong> and 15 utility libraries. Managed database architecture using PostgreSQL with pgvector on Supabase, handling 10+ tables.</li>
        <li>Led all DevOps and infrastructure initiatives — CI/CD pipeline with GitHub Actions, automated deployment to DigitalOcean, server management using cPanel, Docker, and nginx.</li>
        <li>Integrated <strong>14 third-party services</strong> including Gemini 2.0 Flash, SearXNG & Perplexica, Pixabay, Surfer SEO API, and Zoho Cliq for automated team notifications.</li>
        <li>Implemented automated content marketing workflow running daily at 6:00 AM AEST — generating 5 unique articles, scoring, auto-publishing to WordPress with full SEO metadata, and distributing PDF reports — all without manual intervention.</li>
        <li>Created system health monitoring with "Kill Switch Guard" for emergency disconnect, comprehensive session logging, and auto-heal capabilities for 24/7 reliability.</li>
        <li>Solely responsible for the entire technology stack (frontend, backend, AI/ML, SEO engineering, DevOps) — a scope typically requiring <strong>10–12 specialists</strong>.</li>
      </ul>
    </div>

    <div class="job">
      <div class="job-header">
        <div>
          <h3>AI Augmented Engineer | Full-Stack Developer | AI Marketing Specialist</h3>
          <p class="company-name">GcorpCleans</p>
        </div>
        <span class="dates">September 2025 – February 2026</span>
      </div>
      <ul>
        <li>Spearheaded the design and implementation of GcorpCleans' end-to-end digital ecosystem, combining workflow automation, AI integration, and client-facing applications.</li>
        <li>Acted as both Product Manager and Lead Engineer, aligning technical delivery with operational oversight and marketing objectives.</li>
        <li>Integrated a custom AI chatbot into the mobile app (Flutter) for cleaners and clients, enabling appointment booking, job monitoring, and real-time communication.</li>
        <li>Developed AI-driven engagement workflows using n8n, connecting the chatbot with backend systems and management dashboards.</li>
        <li>Established seamless integration with GoHighLevel pipelines to support lead tracking and marketing automation.</li>
        <li>Built Vue.js web-based management system for supervisors to track, manage, and monitor cleaning operations and staff performance.</li>
        <li>Automated onboarding and operational workflows using n8n, reducing manual overhead and improving process transparency.</li>
        <li>Designed dashboards for real-time job monitoring, pay tracking, and operational reporting.</li>
        <li>Developed custom conversion lead tracking inside the system, enabling structured capture and funnel management.</li>
      </ul>
    </div>

    <div class="job">
      <div class="job-header">
        <div>
          <h3>Automation Engineer</h3>
          <p class="company-name">Revaya Company</p>
        </div>
        <span class="dates">August 2025 – October 2025</span>
      </div>
      <ul>
        <li>Designed and deployed lead follow-up and appointment booking workflows using n8n and GoHighLevel (GHL), automating client engagement across Revaya's funnel.</li>
        <li>Implemented real-time lead capture with automated CRM updates and booking triggers, reducing manual scheduling by <strong>60%</strong> and boosting conversion rates by <strong>45%</strong>.</li>
        <li>Integrated GHL calendar and pipeline logic with n8n nodes to automate reminders, reschedules, and post-booking follow-ups, cutting response delays by <strong>70%</strong>.</li>
        <li>Created modular automation templates for scalable reuse across campaigns, reducing setup time by <strong>50%</strong> and improving operational consistency.</li>
        <li>Monitored workflow performance with custom logging and error handling, ensuring high reliability and measurable ROI.</li>
        <li>Engineered logic-based branching and conditional triggers to personalize user journeys, maximizing booking success and client satisfaction.</li>
      </ul>
    </div>

    <div class="job">
      <div class="job-header">
        <div>
          <h3>AI Automation Engineer | Full-Stack Developer | AI Marketing Specialist</h3>
          <p class="company-name">Access Insurance Underwrite LLC</p>
        </div>
        <span class="dates">February 2025 – August 2025</span>
      </div>
      <ul>
        <li>Took full initiative to conceptualize, design, and implement the entire AI chatbot, automation, and integration ecosystem from the ground up.</li>
        <li>Acted as Product Manager and Lead Automation Engineer, overseeing end-to-end development while aligning technical delivery with marketing objectives.</li>
        <li>Built a custom chatbot interface using Python & Django, integrating advanced AI platforms including Heygen, Synthesia, OpenAI, Abacus AI, and Delphi AI.</li>
        <li>Created AI agents with Abacus AI for dynamic customer engagement. Deployed the system via Heroku, managing the full development-to-production pipeline.</li>
        <li>Designed n8n workflows to optimize avatar generation, reducing execution time and improving scalability.</li>
        <li>Built an automated avatar-based email marketing system that embedded avatars in customer responses, driving engagement and boosting lead generation efficiency.</li>
        <li>Supported marketing operations by managing RingCentral inbound calls, capturing and addressing customer needs.</li>
        <li>Enhanced SEO performance for the company's legacy website, improving search visibility and organic reach.</li>
      </ul>
    </div>

    <div class="job">
      <div class="job-header">
        <div>
          <h3>Full Stack Developer</h3>
          <p class="company-name">Speech Improvement Center</p>
        </div>
        <span class="dates">April 2024 – February 2025</span>
      </div>
      <ul>
        <li>Spearheaded the development of a HR, Employee Dashboard, Analytics Database using PHP, improving patient record handling, appointment scheduling, and inventory management.</li>
        <li>Engineered a secure, scalable web application with SQL for efficient data storage and retrieval, reducing data access time by <strong>40%</strong> and increasing database performance by <strong>25%</strong>.</li>
        <li>Designed intuitive, user-friendly interfaces with HTML, CSS, and JavaScript, enhancing patient and staff experience and increasing system adoption by <strong>20%</strong>.</li>
        <li>Optimized clinic processes and workflows by identifying bottlenecks and applying automation, leading to a <strong>15%</strong> reduction in patient wait times.</li>
        <li>Tested and debugged the system using unit and integration testing, ensuring a <strong>99%</strong> system uptime and minimizing error rates by <strong>40%</strong>.</li>
      </ul>
    </div>

    <div class="job">
      <div class="job-header">
        <div>
          <h3>AI Programmer</h3>
          <p class="company-name">Abacus.AI Platform</p>
        </div>
        <span class="dates">January 2023 – January 2024</span>
      </div>
      <ul>
        <li>Developed the Abacus.AI platform using Python and Flask, implementing automated machine learning workflows, model deployment, and process workflows for AI agent customization.</li>
        <li>Integrated cloud-based services (AWS) for scalable data processing and real-time model training, reducing setup time by <strong>25%</strong> and simplifying onboarding for new users.</li>
        <li>Engineered a robust API system for seamless integration with external tools and databases, enhancing data pipeline efficiency.</li>
        <li>Implemented an AI-driven recommendation engine powered by Abacus.AI's proprietary models, providing personalized insights and improving user engagement through tailored predictive analytics.</li>
      </ul>
    </div>
  </section>

  <section class="resume-section">
    <h2>PROJECTS</h2>

    <div class="job">
      <div class="job-header">
        <div>
          <h3>Mobile Developer — BillSense Application</h3>
        </div>
        <span class="dates">January 2025 – December 2025</span>
      </div>
      <ul>
        <li>Built a mobile app using Android Studio and Java, leveraging Convolutional Neural Networks (CNN) to accurately distinguish between genuine and counterfeit bills, ensuring enhanced security and fraud prevention.</li>
        <li>Trained a CNN model for image-based currency authentication, improving detection accuracy.</li>
        <li>Implemented real-time verification with native Java, optimizing fraud detection speed and user experience.</li>
        <li>Designed an intuitive UI/UX for seamless navigation, enhancing accessibility and usability.</li>
        <li>Developed automated data processing pipelines for efficient counterfeit analysis.</li>
        <li>Integrated AI-powered workflow enhancements, improving detection reliability.</li>
      </ul>
    </div>
    <div class="view-more-projects">
      <a href="/projects" class="view-more-link">View More Projects &rarr;</a>
    </div>
  </section>

  <section class="resume-section">
    <h2>TECHNICAL SKILLS</h2>
    <div class="skills-table-wrap">
    <table class="skills-table">
      <thead>
        <tr>
          <th>Category</th>
          <th>Machine Learning</th>
          <th>Mobile App Development</th>
          <th>Game Development</th>
          <th>Web Development</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="cat-label">Languages</td>
          <td><span class="skill-chip"><i class="devicon-python-plain"></i> Python</span> <span class="skill-chip">R</span></td>
          <td><span class="skill-chip"><i class="devicon-java-plain"></i> Java</span> <span class="skill-chip"><i class="devicon-kotlin-plain"></i> Kotlin</span> <span class="skill-chip"><i class="devicon-php-plain"></i> PHP</span></td>
          <td><span class="skill-chip"><i class="devicon-csharp-plain"></i> C#</span> <span class="skill-chip"><i class="devicon-cplusplus-plain"></i> C++</span> <span class="skill-chip"><i class="devicon-javascript-plain"></i> JavaScript</span></td>
          <td><span class="skill-chip"><i class="devicon-javascript-plain"></i> JavaScript</span> <span class="skill-chip"><i class="devicon-python-plain"></i> Python</span> <span class="skill-chip"><i class="devicon-php-plain"></i> PHP</span> <span class="skill-chip"><i class="devicon-wordpress-plain"></i> WordPress</span></td>
        </tr>
        <tr>
          <td class="cat-label">Database / Operating System</td>
          <td colspan="4"><span class="skill-chip"><i class="devicon-mysql-plain"></i> MySQL</span> <span class="skill-chip"><i class="devicon-postgresql-plain"></i> PostgreSQL</span> <span class="skill-chip"><i class="devicon-mongodb-plain"></i> MongoDB</span> <span class="skill-chip"><i class="devicon-sqlite-plain"></i> SQLite</span> <span class="skill-chip">Room</span> <span class="skill-chip"><i class="devicon-firebase-plain"></i> Firebase</span> <span class="skill-chip"><i class="devicon-supabase-plain"></i> Supabase</span> <span class="skill-chip">Vector DB: Pinecone, Weaviate, Faiss</span> <span class="skill-chip"><i class="devicon-linux-plain"></i> Linux</span> <span class="skill-chip"><i class="devicon-windows11-original"></i> Windows</span> <span class="skill-chip"><i class="devicon-android-plain"></i> Android</span></td>
        </tr>
        <tr>
          <td class="cat-label">Libraries</td>
          <td><span class="skill-chip"><i class="devicon-numpy-original"></i> NumPy</span> <span class="skill-chip"><i class="devicon-pandas-original"></i> Pandas</span> <span class="skill-chip"><i class="devicon-matplotlib-plain"></i> Matplotlib</span> <span class="skill-chip"><i class="devicon-pytorch-original"></i> TorchVision</span> <span class="skill-chip"><i class="devicon-keras-original"></i> Keras</span> <span class="skill-chip"><i class="devicon-pytorch-original"></i> PyTorch</span> <span class="skill-chip"><i class="devicon-scikitlearn-plain"></i> Scikit-learn</span> <span class="skill-chip"><i class="devicon-opencv-plain"></i> OpenCV</span> <span class="skill-chip">YOLOv11</span> <span class="skill-chip">OpenVINO</span> <span class="skill-chip">Roboflow</span> <span class="skill-chip">HuggingFace</span></td>
          <td><span class="skill-chip"><i class="devicon-react-original"></i> React Native</span> <span class="skill-chip">Cordova</span> <span class="skill-chip">Retrofit</span> <span class="skill-chip">RxJava</span> <span class="skill-chip"><i class="devicon-jetpackcompose-original"></i> Jetpack</span> <span class="skill-chip"><i class="devicon-kotlin-plain"></i> Kotlin Coroutines</span> <span class="skill-chip">Glide</span> <span class="skill-chip">Dagger Hilt</span></td>
          <td><span class="skill-chip"><i class="devicon-opengl-plain"></i> OpenGL</span> <span class="skill-chip">DirectX</span></td>
          <td><span class="skill-chip"><i class="devicon-react-original"></i> React Native</span> <span class="skill-chip"><i class="devicon-javascript-plain"></i> JavaScript</span> <span class="skill-chip"><i class="devicon-vuejs-plain"></i> Vue.js</span> <span class="skill-chip"><i class="devicon-angularjs-plain"></i> Angular</span> <span class="skill-chip"><i class="devicon-jquery-plain"></i> jQuery</span> <span class="skill-chip"><i class="devicon-dot-net-plain"></i> ASP.NET</span></td>
        </tr>
        <tr>
          <td class="cat-label">Frameworks / Tools</td>
          <td><span class="skill-chip"><i class="devicon-jupyter-plain"></i> Jupyter</span> <span class="skill-chip"><i class="devicon-anaconda-original"></i> Anaconda</span> <span class="skill-chip"><i class="devicon-docker-plain"></i> Docker</span> <span class="skill-chip">LangChain</span> <span class="skill-chip">LangFlow</span> <span class="skill-chip">LlamaIndex</span> <span class="skill-chip"><i class="devicon-tensorflow-original"></i> TensorFlow</span> <span class="skill-chip"><i class="devicon-amazonwebservices-plain-wordmark"></i> AWS (EC2, Lambda)</span> <span class="skill-chip"><i class="devicon-googlecloud-plain"></i> Google Cloud</span> <span class="skill-chip">DigitalOcean</span> <span class="skill-chip"><i class="devicon-git-plain"></i> Git</span></td>
          <td><span class="skill-chip">Multi-OS Engine</span> <span class="skill-chip">Codename One</span> <span class="skill-chip">Appcelerator Titanium</span> <span class="skill-chip"><i class="devicon-ionic-original"></i> Ionic</span> <span class="skill-chip">Cordova</span> <span class="skill-chip">Capacitor</span> <span class="skill-chip">PWA Builder</span> <span class="skill-chip"><i class="devicon-git-plain"></i> Git</span></td>
          <td><span class="skill-chip"><i class="devicon-unity-original"></i> Unity</span> <span class="skill-chip"><i class="devicon-blender-original"></i> Blender</span> <span class="skill-chip"><i class="devicon-git-plain"></i> Git</span></td>
          <td><span class="skill-chip"><i class="devicon-bootstrap-plain"></i> Bootstrap</span> <span class="skill-chip"><i class="devicon-tailwindcss-original"></i> Tailwind</span> <span class="skill-chip"><i class="devicon-django-plain"></i> Django</span> <span class="skill-chip"><i class="devicon-flask-original"></i> Flask</span> <span class="skill-chip"><i class="devicon-laravel-original"></i> Laravel</span> <span class="skill-chip">CodeIgniter</span> <span class="skill-chip">cPanel</span> <span class="skill-chip"><i class="devicon-git-plain"></i> Git</span> <span class="skill-chip">Vercel</span></td>
        </tr>
        <tr>
          <td class="cat-label">Automation Workflow</td>
          <td colspan="2">
            <strong>Low Code Platforms:</strong> n8n, Zapier, Make, SmythOS, Abacus.AI<br>
            <strong>AI Coding Tools:</strong> Claude Code, Claude Design, Codex (GPT), Qwen, Ollama, GitHub Copilot, Letta Code
          </td>
          <td colspan="2">
            <strong>Platforms:</strong> RingCentral, Synthesia, GHL, Slack, Delphi.AI, HuggingFace, Airtable, Lovable, 11labs<br>
            <strong>Default Frameworks:</strong> MCP setup, Skills setup, Embedding, Transformers, Prompt Engineering, Multi-Agent Orchestration, Message Parsing, State Management
          </td>
        </tr>
        <tr>
          <td class="cat-label">CRM / Collab / Comms</td>
          <td colspan="4">GoHighLevel &bull; HubSpot &bull; Zoho &bull; Google Workspace &bull; Jira / Atlassian &bull; Slack &bull; Contentful &bull; ClickUp &bull; MS Teams &nbsp;|&nbsp; <strong>Methodology:</strong> Scrum Master</td>
        </tr>
        <tr>
          <td class="cat-label">Soft Skills</td>
          <td colspan="4">Analytical Thinking &bull; Continuous Learning &bull; Problem-Solving &bull; Time Management &bull; Communication Skills &bull; Teamwork &bull; Leadership &bull; Critical Thinking</td>
        </tr>
      </tbody>
    </table>
    </div>
  </section>

  <section class="resume-section">
    <h2>EDUCATION</h2>
    <div class="job">
      <div class="job-header">
        <div>
          <h3>Bachelor of Science in Information Technology</h3>
          <p class="company-name">Major in Network and Security — University of Cordilleras</p>
        </div>
        <span class="dates">September 2018 – September 2022</span>
      </div>
    </div>
    <div class="job">
      <div class="job-header">
        <div>
          <h3>Senior High School</h3>
          <p class="company-name">University of Cordilleras</p>
        </div>
        <span class="dates">August 2016 – October 2018</span>
      </div>
    </div>
  </section>

  <section class="resume-section">
    <h2>CERTIFICATES</h2>
    <ul class="certs-list">
      <li class="cert-item"><span class="cert-info"><span class="cert-name">Data Science, Machine Learning, Data Analysis</span> <span class="cert-issuer">— DATAhill Solutions Scrinivas Reddy</span></span><button class="cert-view-btn" data-cert-image="/assets/images/certificates/Data Science, Machine Learning, Data Analysis, Python &amp; R.jpg">View</button></li>
      <li class="cert-item"><span class="cert-info"><span class="cert-name">Comprehensive course on Langflow and Langchain</span> <span class="cert-issuer">— Techlatest.net</span></span><button class="cert-view-btn" data-cert-image="/assets/images/certificates/comprehensive course on Langflow and Langchain.jpg">View</button></li>
      <li class="cert-item"><span class="cert-info"><span class="cert-name">Business Intelligence by Google Career</span> <span class="cert-issuer">— Cursa</span></span><button class="cert-view-btn" data-cert-image="/assets/images/certificates/Business Intelligence by Google Career.png">View</button></li>
      <li class="cert-item"><span class="cert-info"><span class="cert-name">Machine Learning using Python</span> <span class="cert-issuer">— Simplilearn</span></span><button class="cert-view-btn" data-cert-image="/assets/images/certificates/Machine Learning.pdf">View</button></li>
    </ul>
  </section>

  <section class="resume-section">
    <h2>KEY COMPETENCIES</h2>
    <p>Analytical Thinking &bull; Problem-Solving &bull; Leadership &bull; Continuous Learning &bull; Teamwork &bull; Communication &bull; Critical Thinking &bull; Time Management &bull; Solo Full-Stack Delivery &bull; AI Architecture &bull; Autonomous System Design</p>
  </section>
</div>`

const FALLBACK_NEWS: NewsArticle[] = [
  {
    id: uid(), title: 'MiroFish: The Universal Swarm Intelligence Engine That Predicts Anything', slug: 'mirofish-swarm-intelligence',
    summary: 'A simple, universal swarm intelligence engine that can predict anything — from market trends to complex system behavior — using biologically-inspired collective computation.',
    content: `<h2>What Is Swarm Intelligence?</h2><p>MiroFish is a zero-dependency swarm intelligence engine inspired by how fish schools and bird flocks solve complex problems collectively. Unlike traditional ML models, swarm systems are emergent — intelligence arises from simple rules applied at scale.</p><h2>Why It Matters</h2><p>MiroFish is model-agnostic and universal. Feed it time-series data, classify patterns, or predict future states — all without heavy ML infrastructure. It runs lean, fast, and surprisingly accurate for many real-world prediction tasks.</p><h2>Use Cases</h2><p>Market prediction, anomaly detection, traffic routing, load forecasting, and any domain where collective behavior outperforms individual estimation. A powerful tool to have in your AI arsenal alongside traditional neural networks.</p><a href="https://github.com/666ghj/MiroFish" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/666ghj/MiroFish', video_url: null,
    link_url: 'https://github.com/666ghj/MiroFish',
    category: 'ai-agent', is_published: true, is_featured: true, sort_order: 1, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'BettaFish: Break Your Information Bubble with Multi-Agent Sentiment AI', slug: 'bettafish-sentiment-analysis',
    summary: 'A multi-agent public opinion analysis assistant built from scratch — no frameworks — that breaks information silos, reveals true sentiment, and predicts future trends.',
    content: `<h2>The Problem: Information Bubbles</h2><p>Social media algorithms trap you in echo chambers. BettaFish tears them down. Built from the ground up without any AI framework dependency, it deploys multiple specialized agents to crawl, analyze, and synthesize public sentiment across platforms.</p><h2>How It Works</h2><p>Each agent handles a specific domain — news, forums, social media — then a synthesis agent aggregates divergent viewpoints, surfaces hidden narratives, and models future sentiment trajectories. Pure multi-agent orchestration at the systems level.</p><h2>Engineering Insight</h2><p>Building this without LangChain or CrewAI is a masterclass in agent design. Every inter-agent message protocol, memory layer, and decision boundary is custom-crafted. An excellent reference for understanding what frameworks abstract away.</p><a href="https://github.com/666ghj/BettaFish" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/666ghj/BettaFish', video_url: null,
    link_url: 'https://github.com/666ghj/BettaFish',
    category: 'ai-agent', is_published: true, is_featured: true, sort_order: 2, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'claude-mem: Auto-Capture Every Claude Coding Session with AI Compression', slug: 'claude-mem-plugin',
    summary: 'A Claude Code plugin that automatically records everything Claude does during coding sessions, compresses it with AI, and injects relevant context back into future sessions.',
    content: `<h2>Never Lose Context Again</h2><p>claude-mem is a Claude Code plugin that silently captures every action, decision, and code change Claude makes during your sessions. Using Claude\'s agent SDK, it then compresses these logs intelligently — keeping what matters, discarding noise.</p><h2>Context Injection</h2><p>On your next session, claude-mem automatically scans your history, finds relevant past decisions, and injects them as context before you even type your first prompt. It\'s persistent memory for Claude Code without manual effort.</p><p class="used-in-project">✅ Utilized in this project for session continuity.</p><a href="https://github.com/thedotmack/claude-mem" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/thedotmack/claude-mem', video_url: null,
    link_url: 'https://github.com/thedotmack/claude-mem',
    category: 'tool', is_published: true, is_featured: true, sort_order: 3, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'The Ultimate Claude Code Awesome List: Skills, Hooks, Agents & More', slug: 'awesome-claude-code',
    summary: 'A curated collection of the best skills, hooks, slash-commands, agent orchestrators, applications, and plugins for Claude Code — the definitive reference for power users.',
    content: `<h2>Your Claude Code Power-Up Vault</h2><p>The awesome-claude-code repository is the community-curated hub for everything that extends Claude Code. From custom hooks that trigger on events, to slash-command libraries, to full agent orchestrators — it\'s all here, organized and rated.</p><h2>What\'s Inside</h2><p>Skills (reusable task templates), hooks (event-driven automation), slash commands (custom workflows), MCP integrations (tool access), and full application examples. Whether you\'re building a CI pipeline assistant or a code review bot, this list has a starting point.</p><p class="used-in-project">✅ Referenced for skill and hook patterns used in this project.</p><a href="https://github.com/hesreallyhim/awesome-claude-code" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/hesreallyhim/awesome-claude-code', video_url: null,
    link_url: 'https://github.com/hesreallyhim/awesome-claude-code',
    category: 'tool', is_published: true, is_featured: false, sort_order: 4, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'Context Mode: The Privacy-First Virtualization Layer for MCP Context', slug: 'context-mode-mcp',
    summary: 'MCP gives AI tools access to your systems. Context Mode adds a virtualization layer that controls exactly what context gets shared — privacy-first, with surgical precision.',
    content: `<h2>The Context Problem</h2><p>MCP (Model Context Protocol) is the protocol that lets AI agents access tools, files, databases, and APIs. But every connection is a potential context leak. Context Mode sits between your MCP servers and the AI, acting as a virtualization layer.</p><h2>How It Works</h2><p>Context Mode intercepts context requests, filters sensitive data, transforms outputs, and applies access policies before any information reaches the model. Think of it as a reverse proxy — but for AI context instead of HTTP traffic.</p><h2>Why This Matters</h2><p>As MCP adoption grows, the attack surface for context exfiltration expands. Context Mode is a foundational security primitive for production AI agent deployments.</p><a href="https://github.com/mksglu/context-mode" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/mksglu/context-mode', video_url: null,
    link_url: 'https://github.com/mksglu/context-mode',
    category: 'mcp', is_published: true, is_featured: false, sort_order: 5, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'WorldMonitor: Real-Time Global Intelligence Dashboard Powered by AI', slug: 'worldmonitor-dashboard',
    summary: 'A unified situational awareness interface that aggregates AI-powered news, monitors geopolitical events, and tracks infrastructure — all in real time.',
    content: `<h2>Command Center for the Information Age</h2><p>WorldMonitor is an open-source global intelligence dashboard that pulls from dozens of live data sources — news APIs, satellite data, infrastructure monitors, and social signals — then uses AI to surface what actually matters.</p><h2>Features</h2><p>Real-time news aggregation with AI summarization, geopolitical event tracking, infrastructure status monitoring (internet exchanges, BGP routes, power grids), and a unified timeline view. Think Bloomberg Terminal meets threat intelligence platform.</p><h2>Built For</h2><p>Security researchers, journalists, policy analysts, and anyone who needs to stay ahead of global events. The open-source nature makes it extensible for custom intelligence feeds.</p><a href="https://github.com/koala73/worldmonitor" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/koala73/worldmonitor', video_url: null,
    link_url: 'https://github.com/koala73/worldmonitor',
    category: 'ai-agent', is_published: true, is_featured: false, sort_order: 6, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'Qwen Image Edit 2511: State-of-the-Art Visual AI Editing on Hugging Face', slug: 'qwen-image-edit-2511',
    summary: 'Alibaba\'s latest multimodal model for precise image editing via natural language — inpainting, style transfer, object manipulation, all through simple text instructions.',
    content: `<h2>Edit Images with Words</h2><p>Qwen-Image-Edit-2511 is Alibaba\'s frontier multimodal model specialized for image editing. Unlike generation-only models, it understands existing images and makes precise, instruction-following edits — "remove the background", "change the shirt to red", "add a sunset sky".</p><h2>Capabilities</h2><p>Object addition and removal, style transfer, background replacement, inpainting with context awareness, and compositional editing. All driven by natural language with state-of-the-art precision.</p><h2>Access</h2><p>Available via Hugging Face with both API access and local deployment options. Pairs well with LangChain tool wrappers for automated image processing pipelines.</p><a href="https://huggingface.co/Qwen/Qwen-Image-Edit-2511" target="_blank">View on Hugging Face →</a>`,
    image_url: 'https://cdn-thumbnails.huggingface.co/social-thumbnails/models/Qwen/Qwen2.5-72B-Instruct.png', video_url: null,
    link_url: 'https://huggingface.co/Qwen/Qwen-Image-Edit-2511',
    category: 'ai-model', is_published: true, is_featured: false, sort_order: 7, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'Kie.ai: One API Hub for Video, Image & Music Generation', slug: 'kie-ai-api-hub',
    summary: 'A unified API gallery giving developers access to the best video, image, and music generation AI models — one key, one integration, every model.',
    content: `<h2>The Generative AI API Marketplace</h2><p>Kie.ai aggregates the best generative AI models — Sora-class video generators, FLUX image models, Suno-style music generators — behind a single unified API. One integration, any model.</p><h2>Why It Matters for Developers</h2><p>Instead of managing a dozen different API keys, rate limits, and response formats, Kie.ai normalizes everything. Switch between Midjourney-style image generation and cinematic video production without changing your code structure.</p><h2>Platform Features</h2><p>Unified billing, model benchmarking, output galleries, and workflow templates. Build generative AI features into any product without the infrastructure overhead of running models yourself.</p><a href="https://kie.ai" target="_blank">Visit Kie.ai →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/openai/openai-python', video_url: null,
    link_url: 'https://kie.ai',
    category: 'platform', is_published: true, is_featured: false, sort_order: 8, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'AirLLM: Run 70B LLMs on a Single 4GB GPU — No Quantization Needed', slug: 'airllm-70b-inference',
    summary: 'AirLLM makes 70-billion parameter inference possible on consumer hardware through layer-by-layer streaming — no quantization, no quality loss, no data center required.',
    content: `<h2>The Hardware Barrier, Broken</h2><p>Running a 70B parameter model normally requires 140GB+ of VRAM — the equivalent of multiple A100s. AirLLM shatters this constraint through a technique called inference-time layer streaming: it loads only one transformer layer at a time, processes it, then swaps to the next.</p><h2>How It Works</h2><p>Instead of holding the entire model in VRAM, AirLLM streams layers from disk (NVMe SSD recommended) or CPU memory, processes each layer\'s forward pass, then moves on. The result: full-precision 70B inference on a single 4GB GPU with no quality degradation.</p><h2>Trade-offs</h2><p>Speed is lower than full-VRAM inference — roughly 1-3 tokens/sec depending on hardware. But for non-latency-critical tasks (batch generation, research, local experimentation), it\'s a game-changer for accessibility.</p><a href="https://github.com/lyogavin/airllm" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/lyogavin/airllm', video_url: null,
    link_url: 'https://github.com/lyogavin/airllm',
    category: 'ai-model', is_published: true, is_featured: false, sort_order: 9, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'LiquidAI LFM2-24B: Hybrid Architecture Redefining Efficient Inference', slug: 'liquidai-lfm2-24b',
    summary: 'LiquidAI\'s LFM2-24B-A2B model combines liquid neural networks with mixture-of-experts, delivering frontier reasoning at a fraction of the compute cost.',
    content: `<h2>Beyond Transformers</h2><p>Liquid Foundation Models (LFMs) are LiquidAI\'s alternative to pure transformer architectures. LFM2-24B-A2B uses a hybrid approach: liquid neural network layers for long-context reasoning combined with sparse mixture-of-experts for efficient scaling.</p><h2>The Numbers</h2><p>24B total parameters, only 2B active per forward pass. This means inference costs rival 2-3B dense models while maintaining capabilities that compete with much larger systems. Particularly strong on reasoning benchmarks, code, and instruction following.</p><h2>Availability</h2><p>Available on Hugging Face for local deployment and API access. A strong candidate for self-hosted production deployments where cost efficiency matters.</p><a href="https://huggingface.co/LiquidAI/LFM2-24B-A2B" target="_blank">View on Hugging Face →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/huggingface/transformers', video_url: null,
    link_url: 'https://huggingface.co/LiquidAI/LFM2-24B-A2B',
    category: 'ai-model', is_published: true, is_featured: false, sort_order: 10, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: '20 SEO & GEO Skills for Claude Code: Dominate Search with AI Agents', slug: 'seo-geo-claude-skills',
    summary: 'A ready-to-install set of 20 specialized SEO and GEO (Generative Engine Optimization) skills for Claude Code — keyword research, audits, content writing, rank tracking, and more.',
    content: `<h2>AI-Native SEO at Your Command</h2><p>The seo-geo-claude-skills package brings 20 production-ready skills to Claude Code, Cursor, Codex, and 35+ other AI coding agents. Each skill implements proven SEO/GEO workflows using CORE-EEAT and CITE frameworks.</p><h2>What\'s Included</h2><p>Keyword research automation, technical SEO audits, AI-optimized content writing, rank tracking pipelines, backlink analysis, schema markup generation, competitor gap analysis, and GEO optimization for AI search engines like Perplexity and SearchGPT.</p><h2>Why GEO Matters Now</h2><p>Traditional SEO optimizes for Google crawlers. GEO optimizes for AI systems that synthesize information. As AI-powered search grows, GEO becomes as critical as traditional SEO. These skills put you ahead of the curve.</p><p class="used-in-project">✅ Skills referenced for this project\'s content optimization.</p><a href="https://github.com/aaron-he-zhu/seo-geo-claude-skills" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/aaron-he-zhu/seo-geo-claude-skills', video_url: null,
    link_url: 'https://github.com/aaron-he-zhu/seo-geo-claude-skills',
    category: 'skills', is_published: true, is_featured: false, sort_order: 11, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: '1000+ Claude Code Templates: Agents, Commands, Skills & MCP Integrations', slug: 'claude-code-templates',
    summary: 'A CLI tool and massive template library for configuring and monitoring Claude Code — over 1000 agents, commands, skills, and MCP integrations ready to deploy.',
    content: `<h2>The Claude Code Template Vault</h2><p>claude-code-templates is both a library and a CLI tool. The library contains 1000+ production-ready configurations — agent definitions, slash commands, workflow skills, and MCP server integrations. The CLI lets you browse, install, and manage them directly from your terminal.</p><h2>What You Get</h2><p>Pre-built agents for code review, deployment, testing, documentation, and more. Slash commands for common workflows. MCP integrations for GitHub, Linear, Slack, databases, and cloud providers. All configured and ready to drop into your Claude Code setup.</p><h2>Monitoring Built In</h2><p>The CLI also provides monitoring capabilities — track token usage, session history, agent performance, and cost analytics directly from the terminal.</p><p class="used-in-project">✅ Templates and patterns utilized in this project\'s Claude Code setup.</p><a href="https://github.com/davila7/claude-code-templates" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/davila7/claude-code-templates', video_url: null,
    link_url: 'https://github.com/davila7/claude-code-templates',
    category: 'tool', is_published: true, is_featured: false, sort_order: 12, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'TRELLIS.2: Native Structured Latents Pushing 3D Generation to New Heights', slug: 'trellis2-3d-generation',
    summary: 'TRELLIS.2 introduces native compact structured latent representations for 3D generation — higher fidelity, faster inference, and better multi-view consistency than its predecessor.',
    content: `<h2>The Next Frontier in 3D AI</h2><p>TRELLIS.2 advances the state of 3D generation by operating directly in structured latent space — a compact representation that natively encodes 3D geometry, texture, and material properties. Unlike mesh-based or NeRF-based approaches, structured latents enable end-to-end differentiable 3D generation.</p><h2>Key Improvements Over TRELLIS</h2><p>Native multi-view consistency (no post-processing stitching), higher geometric fidelity for complex shapes, faster inference due to compact latent dimensionality, and better texture coherence across viewing angles. It also supports conditional generation from text, images, and partial 3D inputs.</p><h2>Applications</h2><p>Game asset generation, product visualization, architectural previsualization, VR/AR content creation, and any domain requiring rapid 3D prototype generation from conceptual input.</p>`,
    image_url: 'https://opengraph.githubassets.com/1/microsoft/DeepSpeed', video_url: null,
    link_url: 'https://github.com/Microsoft/TRELLIS',
    category: '3d-gen', is_published: true, is_featured: false, sort_order: 13, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'Top 3D AI: Your Complete Guide to Comparing AI 3D Generators', slug: 'top3d-ai-comparison',
    summary: 'A comprehensive platform that benchmarks, rates, and compares the best AI 3D generators — helping creators find the right tool for every use case.',
    content: `<h2>Navigate the 3D AI Landscape</h2><p>The AI 3D generation space has exploded — Tripo3D, CSM, Meshy, TripoSR, InstantMesh, TRELLIS, Shap-E, and dozens more. Top 3D AI cuts through the noise with systematic benchmarks, real-world tests, and honest ratings.</p><h2>What Makes It Useful</h2><p>Side-by-side comparisons on the same input prompts, quality metrics across geometry, texture, and consistency, speed benchmarks, pricing analysis, and use-case recommendations. Whether you need game-ready meshes, print-quality models, or quick concept visualizations — there\'s a guide for it.</p><h2>For Developers</h2><p>API documentation comparisons and integration guides help developers pick the right model for their production pipeline without wasting credits on trial and error.</p><a href="https://top3dai.com" target="_blank">Visit Top 3D AI →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/openai/shap-e', video_url: null,
    link_url: 'https://top3dai.com',
    category: '3d-gen', is_published: true, is_featured: false, sort_order: 14, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'Tencent Hunyuan3D: Industrial-Grade AI 3D Asset Generation', slug: 'tencent-hunyuan3d',
    summary: 'Tencent\'s Hunyuan3D model brings enterprise-scale 3D generation to Hugging Face — high-quality textured meshes from text or image in seconds.',
    content: `<h2>3D Generation at Scale</h2><p>Tencent Hunyuan3D is a production-grade 3D generation model trained on massive datasets with enterprise use cases in mind. It generates high-quality textured 3D meshes from text descriptions or reference images — ready for game engines, e-commerce, and industrial visualization.</p><h2>Technical Strengths</h2><p>Multi-view consistent generation, detailed texture synthesis, support for PBR (Physically Based Rendering) materials, and output formats compatible with major 3D tools (OBJ, GLB, FBX). The model handles complex organic shapes, architectural elements, and product designs with equal competence.</p><h2>Enterprise Access</h2><p>Available via Hugging Face with API endpoints. Designed for batch processing workflows where high-volume 3D asset creation is required — content pipelines, e-commerce catalogs, metaverse environments.</p><a href="https://huggingface.co/tencent/Hunyuan3D-2" target="_blank">View on Hugging Face →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/Tencent/HunyuanVideo', video_url: null,
    link_url: 'https://huggingface.co/tencent/Hunyuan3D-2',
    category: '3d-gen', is_published: true, is_featured: false, sort_order: 15, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: '1273+ Agentic Skills: The Mega-Library for Claude Code, Cursor & More', slug: 'antigravity-awesome-skills',
    summary: 'An installable GitHub library of over 1273 agentic skills for Claude Code, Cursor, Codex CLI, Gemini CLI, and more — with a CLI installer, bundles, and official + community collections.',
    content: `<h2>The Largest Agentic Skills Library</h2><p>antigravity-awesome-skills is the most comprehensive collection of installable agentic skills in existence — 1273+ skills spanning every domain, workflow, and programming language. Compatible with Claude Code, Cursor, Codex CLI, Gemini CLI, Antigravity, and any agent that supports skill files.</p><h2>What\'s Included</h2><p>Official skill bundles from tool vendors, community-contributed skills for niche workflows, skill composition patterns, multi-agent orchestration templates, and domain-specific collections (DevOps, Data Science, Mobile, Security, and more).</p><h2>The CLI Installer</h2><p>Don\'t browse GitHub manually — the included CLI installer lets you search, preview, and install skills directly. Bundle management keeps your skill sets organized and updatable with a single command.</p><p class="used-in-project">✅ Skills from this library are active in this project\'s Claude Code environment.</p><a href="https://github.com/sickn33/antigravity-awesome-skills" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/sickn33/antigravity-awesome-skills', video_url: null,
    link_url: 'https://github.com/sickn33/antigravity-awesome-skills',
    category: 'skills', is_published: true, is_featured: false, sort_order: 16, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'Trigger.dev: Build & Deploy Fully-Managed AI Agents Without the Infra Pain', slug: 'triggerdev-ai-agents',
    summary: 'Trigger.dev lets you build long-running, production-grade AI agents and workflows that run reliably in the cloud — no servers to manage, no queue infrastructure to maintain.',
    content: `<h2>The Agent Runtime You\'ve Been Waiting For</h2><p>Building AI agents that run reliably in production is hard. They need persistent state, retry logic, timeout handling, and observability. Trigger.dev handles all of this — you write the agent logic, it handles the runtime.</p><h2>Key Features</h2><p>Long-running tasks (hours or days) without timeouts, automatic retries with exponential backoff, real-time execution logs, built-in concurrency control, and native integrations with OpenAI, Anthropic, and every major AI provider.</p><h2>The Developer Experience</h2><p>Write your agent as a TypeScript/JavaScript function. Deploy it. Trigger it via API, webhooks, schedules, or event queues. Monitor execution in a beautiful dashboard. No Kubernetes, no queues, no infrastructure headaches.</p><a href="https://trigger.dev" target="_blank">Visit Trigger.dev →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/triggerdotdev/trigger.dev-examples', video_url: null,
    link_url: 'https://trigger.dev',
    category: 'platform', is_published: true, is_featured: false, sort_order: 17, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'Higgsfield: Cinematic AI Video & Image Generation for Creators', slug: 'higgsfield-ai-video',
    summary: 'Higgsfield delivers Hollywood-quality AI video and image generation with precise character consistency, dynamic camera control, and physics-aware motion — built for creators who demand more.',
    content: `<h2>AI Video That Looks Real</h2><p>Higgsfield AI is a next-generation video and image generation platform that solves the hardest problems in AI video: character consistency across frames, realistic physics, and controllable camera motion. The results are cinematic-quality outputs that hold up to professional scrutiny.</p><h2>Creator-First Features</h2><p>Subject lock (keep a character consistent across an entire video), camera path control (dolly, orbit, crane shots via text), physics simulation for realistic object interaction, and style transfer that maintains scene coherence. All accessible through a clean API and web interface.</p><h2>Applications</h2><p>Brand videos, social content, product demos, film previsualzation, game cinematics, and any creative work that benefits from AI-accelerated production.</p><a href="https://higgsfield.ai" target="_blank">Visit Higgsfield →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/facebookresearch/AnimatedDrawings', video_url: null,
    link_url: 'https://higgsfield.ai',
    category: 'ai-model', is_published: true, is_featured: false, sort_order: 18, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'Picoclaw: Lightweight AI-Powered Automation for Modern Developers', slug: 'picoclaw-automation',
    summary: 'Picoclaw brings minimal, fast, AI-native automation to your development workflow — tiny footprint, maximum impact, designed for the modern dev stack.',
    content: `<h2>Automation That Stays Out of Your Way</h2><p>Picoclaw is a lightweight automation tool built with AI integration as a first-class feature. Where traditional automation tools bolt on AI as an afterthought, Picoclaw was designed from the ground up for AI-native workflows.</p><h2>The Philosophy</h2><p>Small binary, zero config sprawl, composable primitives. You define triggers and actions in minimal configuration — Picoclaw handles the wiring. AI decision nodes can be inserted at any step to add intelligent routing, classification, or generation to your automation chains.</p><h2>Use Cases</h2><p>Development workflow automation, CI/CD event handling, webhook processing with AI enrichment, and any scenario where you need fast, reliable automation without the overhead of a full platform like n8n or Zapier.</p><a href="https://picoclaw.com" target="_blank">Visit Picoclaw →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/n8n-io/n8n', video_url: null,
    link_url: 'https://picoclaw.com',
    category: 'tool', is_published: true, is_featured: false, sort_order: 19, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'Kiro: The Autonomous AI Agent That Ships Code Independently', slug: 'kiro-autonomous-agent',
    summary: 'Kiro is an autonomous AI coding agent that takes a task, researches it, plans the implementation, writes the code, tests it, and delivers a working result — all without hand-holding.',
    content: `<h2>Beyond Code Completion</h2><p>Kiro is a fully autonomous coding agent — not a copilot, not an autocomplete. Give it a task in plain English, and it independently: researches the codebase, plans the implementation, writes and refactors code, runs tests, fixes failures, and delivers a pull request. You review the result, not the process.</p><h2>How It\'s Different</h2><p>Most AI coding tools augment your workflow. Kiro replaces entire phases of it. For well-defined tasks — feature implementations, bug fixes, test writing, documentation — Kiro operates at an engineering-team level of autonomy.</p><h2>Safety & Control</h2><p>Kiro operates within sandboxed environments with configurable permissions. Every change is tracked, every decision is logged, and you always have the ability to review and reject before any code merges.</p><a href="https://kiro.dev" target="_blank">Visit Kiro →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/anthropics/claude-code', video_url: null,
    link_url: 'https://kiro.dev',
    category: 'ai-agent', is_published: true, is_featured: false, sort_order: 20, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'GitNexus: Zero-Server Code Intelligence with Browser-Native Knowledge Graphs', slug: 'gitnexus-knowledge-graph',
    summary: 'GitNexus runs entirely in your browser — drop in a GitHub repo or ZIP, get an interactive knowledge graph with a built-in Graph RAG agent for intelligent code exploration.',
    content: `<h2>Code Intelligence Without a Server</h2><p>GitNexus is a client-side knowledge graph engine for codebases. Drop in a GitHub URL or ZIP file, and it parses the entire repository in your browser — building an interactive knowledge graph that maps relationships between files, functions, classes, and dependencies.</p><h2>Graph RAG Built In</h2><p>The embedded Graph RAG agent lets you query your codebase in natural language. "What calls this function?", "Show me the data flow for user authentication", "Which files depend on this module?" — answered instantly from the graph without any server infrastructure.</p><h2>Zero Data Exposure</h2><p>Because everything runs client-side, your code never leaves your machine. No API calls to external servers, no code uploaded to third parties. Private codebases stay private while you get production-grade intelligence tooling.</p><p class="used-in-project">✅ GitNexus is integrated into this project\'s admin panel for codebase exploration.</p><a href="https://gitnexus.vercel.app" target="_blank">Open GitNexus →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/nxpatterns/gitnexus', video_url: null,
    link_url: 'https://gitnexus.vercel.app',
    category: 'tool', is_published: true, is_featured: false, sort_order: 23, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'WorldGen: Generate Interactive 3D Scenes from Text & Images in Seconds', slug: 'worldgen-3d-scenes',
    summary: 'WorldGen converts text descriptions or images into fully explorable 360-degree 3D environments — instant scene generation with loop closure consistency for seamless exploration.',
    content: `<h2>From Text to Explorable Worlds</h2><p>WorldGen is a breakthrough model that generates interactive 3D scenes from simple text prompts or reference images. Unlike static 3D generation, WorldGen produces fully explorable environments you can navigate in 360 degrees — with consistent geometry and textures from every angle.</p><h2>How It Works</h2><p>The system operates in two stages:</p><ul><li><strong>Stage 1:</strong> Generates high-resolution 360-degree panoramic images from your input (text or image)</li><li><strong>Stage 2:</strong> Converts panoramas into 3D representations (3D Gaussian Splatting or mesh) for real-time interactive exploration</li></ul><h2>Key Innovation: Loop Closure</h2><p>The critical challenge in 360° generation is consistency — when you rotate back to your starting point, the scene must match perfectly. WorldGen solves this with a loop closure mechanism that ensures seamless panoramic continuity.</p><h2>Applications</h2><p>Game level prototyping, virtual environment design, architectural visualization, VR content creation, and rapid 3D concept art generation. A single text prompt produces a navigable 3D world in seconds.</p><a href="https://github.com/ZiYang-xie/WorldGen" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/ZiYang-xie/WorldGen', video_url: null,
    link_url: 'https://worldgen.github.io/',
    category: '3d-gen', is_published: true, is_featured: false, sort_order: 22, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'LLM Wiki: Andrej Karpathy\'s Pattern for AI-Maintained Knowledge Bases', slug: 'karpathy-llm-wiki',
    summary: 'Karpathy\'s viral pattern: instead of RAG, have an LLM incrementally build and maintain a persistent wiki — a compounding knowledge base that gets richer with every source you add.',
    content: `<h2>Beyond RAG: The Wiki Pattern</h2><p>Most people's experience with LLMs and documents looks like RAG: upload files, retrieve chunks at query time, generate an answer. The LLM rediscovers knowledge from scratch on every question. Nothing compounds.</p><p>Karpathy's idea is different. Instead of retrieving from raw documents, the LLM <strong>incrementally builds and maintains a persistent wiki</strong> — structured, interlinked markdown files that sit between you and the raw sources. When you add a new source, the LLM reads it, extracts key information, and integrates it into the existing wiki — updating entity pages, revising summaries, noting contradictions.</p><h2>Three Layers</h2><ul><li><strong>Raw Sources</strong> — your curated documents. Immutable. The LLM reads but never modifies.</li><li><strong>The Wiki</strong> — LLM-generated markdown. Summaries, entity pages, cross-references. The LLM owns this entirely.</li><li><strong>The Schema</strong> — conventions telling the LLM how to structure and maintain the wiki.</li></ul><h2>Operations</h2><ul><li><strong>Ingest:</strong> Drop a source, LLM processes it, updates 10-15 wiki pages, logs the operation.</li><li><strong>Query:</strong> Ask questions, LLM searches wiki pages, synthesizes answers with citations. Good answers get filed back as new pages.</li><li><strong>Lint:</strong> Periodic health checks — find contradictions, stale claims, orphan pages, missing cross-references.</li></ul><h2>Why It Works</h2><p>The tedious part of maintaining a knowledge base is the bookkeeping — updating cross-references, keeping summaries current, noting contradictions. Humans abandon wikis because maintenance grows faster than value. LLMs don't get bored and can touch 15 files in one pass.</p><h2>Implemented in NEURALYX</h2><p>This pattern is now live in the NEURALYX job pipeline. Every time jobs are pulled, the system automatically builds company wiki pages, tracks skill demand, and maintains a growing intelligence database. The wiki compounds with every job search.</p><p class="used-in-project">✅ Actively implemented in this project's job intelligence wiki system.</p><a href="https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f" target="_blank">Read Karpathy's Original Gist →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/karpathy/442a6bf555914893e9891c11519de94f', video_url: null,
    link_url: 'https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f',
    category: 'ai', is_published: true, is_featured: true, sort_order: 1, created_at: now, updated_at: now,
  },
  {
    id: uid(), title: 'TruffleHog: Find & Validate Leaked Secrets Across 800+ Credential Types', slug: 'trufflehog-secrets-scanner',
    summary: 'TruffleHog discovers, classifies, validates, and analyzes leaked credentials across Git repos, cloud storage, Docker images, CI/CD pipelines, and more — covering 800+ secret types with 25.6K GitHub stars.',
    content: `<h2>Your Secrets Are Leaking — TruffleHog Finds Them</h2><p>TruffleHog is the industry-standard open-source tool for detecting leaked secrets and credentials. With 25.6K GitHub stars, it scans across Git repositories, S3 buckets, Docker images, Slack messages, wikis, logs, and API platforms to find API keys, database passwords, private encryption keys, and other authentication credentials that should never have been exposed.</p><h2>Why It Matters</h2><p>A single leaked API key can compromise an entire organization. TruffleHog doesn't just find secrets — it <strong>validates</strong> them to confirm if they're still active, and <strong>analyzes</strong> the scope of damage by checking what permissions the credential grants. This turns a noisy scan into actionable intelligence.</p><h2>800+ Secret Types</h2><p>TruffleHog classifies over 800 different secret types — from AWS keys and GitHub tokens to database connection strings, JWT secrets, Stripe keys, and private certificates. Each detection is mapped to a specific identity and service for precise remediation.</p><h2>Scan Anything</h2><ul><li><strong>Git repos</strong> — individual repos, entire GitHub/GitLab organizations</li><li><strong>Cloud storage</strong> — S3, GCS buckets</li><li><strong>Docker images</strong> — scan container layers for embedded secrets</li><li><strong>CI/CD</strong> — Jenkins, CircleCI build logs</li><li><strong>Chat & Wikis</strong> — Slack, Confluence</li><li><strong>Elasticsearch</strong> — cluster-wide secret scanning</li></ul><h2>DevSecOps Integration</h2><p>TruffleHog integrates with pre-commit hooks, CI/CD pipelines, and outputs JSON for automated processing. Essential for any security-conscious development workflow.</p><a href="https://github.com/trufflesecurity/trufflehog" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/trufflesecurity/trufflehog', video_url: null,
    link_url: 'https://github.com/trufflesecurity/trufflehog',
    category: 'tool', is_published: true, is_featured: false, sort_order: 24, created_at: now, updated_at: now,
  },
]

export const useContentStore = defineStore('content', () => {
  const sections = ref<{ slug: string; title: string; subtitle: string | null; content: Record<string, unknown>; sort_order: number; is_visible: boolean }[]>([])
  const projects = ref<Project[]>([])
  const skills = ref<Skill[]>([])
  const tools = ref<Tool[]>([])
  const news = ref<NewsArticle[]>([])
  const resumeHtml = ref(FALLBACK_RESUME_HTML)
  const loaded = ref(false)
  const loading = ref(false)

  const getSection = (slug: string) =>
    computed(() => sections.value.find((s) => s.slug === slug))

  const getSkillsByCategory = (category: string) =>
    computed(() => skills.value.filter((s) => s.category === category))

  const featuredProjects = computed(() =>
    projects.value.filter((p) => p.is_featured).sort((a, b) => a.sort_order - b.sort_order),
  )

  const skillCategories = computed(() => {
    const cats = new Set(skills.value.map((s) => s.category))
    return Array.from(cats).sort()
  })

  const toolCategories = computed(() => {
    const cats = new Set(tools.value.map((t) => t.category))
    return Array.from(cats).sort()
  })

  const publishedNews = computed(() =>
    news.value.filter((n) => n.is_published).sort((a, b) => b.sort_order - a.sort_order),
  )

  const featuredNews = computed(() => {
    const featured = publishedNews.value.filter((n) => n.is_featured)
    if (featured.length >= 3) return featured.slice(0, 3)
    // Fall back to first 3 published if not enough featured
    return publishedNews.value.slice(0, 3)
  })

  function loadFallback() {
    skills.value = FALLBACK_SKILLS
    projects.value = FALLBACK_PROJECTS
    tools.value = FALLBACK_TOOLS
    news.value = FALLBACK_NEWS
    loaded.value = true
  }

  async function fetchAll() {
    if (loaded.value || loading.value) return
    loading.value = true

    try {
      const [sectionsRes, projectsRes, skillsRes, toolsRes, newsRes] = await Promise.all([
        supabase.from('sections').select('*').eq('is_visible', true).order('sort_order'),
        supabase.from('projects').select('*').order('sort_order'),
        supabase.from('skills').select('*').order('proficiency', { ascending: false }),
        supabase.from('tools').select('*').order('name'),
        supabase.from('news').select('*').order('sort_order', { ascending: false }),
      ])

      const hasData = skillsRes.data && skillsRes.data.length > 0

      if (hasData) {
        if (sectionsRes.data) sections.value = sectionsRes.data
        if (projectsRes.data) projects.value = projectsRes.data
        if (skillsRes.data) skills.value = skillsRes.data
        if (toolsRes.data) tools.value = toolsRes.data
        if (newsRes.data && newsRes.data.length > 0) {
          news.value = (newsRes.data as NewsArticle[]).map(n => ({ ...n, is_featured: n.is_featured ?? false }))
        } else {
          news.value = FALLBACK_NEWS
        }
        loaded.value = true
      } else {
        loadFallback()
      }
    } catch {
      console.warn('Supabase not available, using fallback content')
      loadFallback()
    } finally {
      loading.value = false
    }
  }

  return {
    sections,
    projects,
    skills,
    tools,
    news,
    loaded,
    loading,
    getSection,
    getSkillsByCategory,
    featuredProjects,
    publishedNews,
    featuredNews,
    resumeHtml,
    skillCategories,
    toolCategories,
    fetchAll,
  }
})
