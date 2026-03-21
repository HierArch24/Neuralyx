import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://phpdxvaowytijhvclljb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBocGR4dmFvd3l0aWpodmNsbGpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MjE4ODksImV4cCI6MjA4OTQ5Nzg4OX0.ClHZrdLj47HKUiDTfh6oolx3zRtD_dO2kidjfqY92nY'
)

// ── PROJECTS ──
const projects = [
  // Web projects (from FALLBACK_PROJECTS)
  {
    title: 'NEURALYX Portfolio', slug: 'neuralyx-portfolio',
    description: 'Cinematic portfolio with scroll-synced video background, parallax animations, and admin dashboard. Built with Vue 3, TypeScript, GSAP, and Supabase.',
    tech_stack: ['Vue 3', 'TypeScript', 'GSAP', 'Tailwind CSS', 'Supabase'],
    category: 'web', github_url: 'https://github.com/HierArch24/NEURALYX', live_url: 'https://neuralyx.ai.dev-environment.site',
    is_featured: true, sort_order: 1,
  },
  {
    title: 'AI Agent Orchestrator', slug: 'ai-agent-orchestrator',
    description: 'Multi-agent system using CrewAI and LangChain for automated research, content generation, and task delegation across intelligent AI agents.',
    tech_stack: ['Python', 'CrewAI', 'LangChain', 'OpenAI', 'FastAPI'],
    category: 'ai', is_featured: true, sort_order: 2,
  },
  {
    title: 'Billing System', slug: 'billing-system',
    description: 'Full-stack billing and invoice management system with real-time updates, role-based access, and automated payment tracking.',
    tech_stack: ['Vue.js', 'Supabase', 'PostgreSQL', 'Tailwind CSS'],
    category: 'web', is_featured: true, sort_order: 3,
  },
  {
    title: 'Automation Pipeline Engine', slug: 'automation-pipeline',
    description: 'Custom workflow automation platform integrating n8n, webhooks, and AI-powered decision nodes for business process automation.',
    tech_stack: ['n8n', 'Node.js', 'PostgreSQL', 'Docker'],
    category: 'automation', is_featured: true, sort_order: 4,
  },
  {
    title: 'RAG Knowledge Base', slug: 'rag-knowledge-base',
    description: 'Retrieval-augmented generation system for intelligent document search and question answering over custom knowledge bases.',
    tech_stack: ['Python', 'LangChain', 'ChromaDB', 'FastAPI', 'OpenAI'],
    category: 'ai', is_featured: true, sort_order: 5,
  },
  {
    title: 'MCP Server Suite', slug: 'mcp-server-suite',
    description: 'Custom Model Context Protocol servers enabling AI assistants to interact with databases, APIs, and development tools.',
    tech_stack: ['TypeScript', 'MCP SDK', 'Supabase', 'Node.js'],
    category: 'ai', is_featured: true, sort_order: 6,
  },
  // Web Projects (from WebProjectsSection)
  {
    title: 'SIC HR Development & Employee Attendance Panel', slug: 'sic-hr-attendance',
    description: 'HR development portal and employee clock attendance tracking system for Speech Improvement Center with automated timesheets and reporting.',
    tech_stack: ['PHP', 'cPanel', 'SQL'],
    category: 'web', is_featured: false, sort_order: 7,
  },
  {
    title: 'Facial Recognition Lie Detection', slug: 'facial-recognition-lie-detection',
    description: 'Machine learning-powered facial recognition system for lie detection using deep learning models and real-time video analysis.',
    tech_stack: ['Python', 'Flask', 'SQL', 'Machine Learning', 'Deep Learning'],
    category: 'ai', is_featured: false, sort_order: 8,
  },
  {
    title: 'SIC Database Management & Landing Page', slug: 'sic-database-landing',
    description: 'Database management system and public-facing landing page for Speech Improvement Center built on WordPress with custom PHP integration.',
    tech_stack: ['WordPress', 'PHP', 'SQL'],
    category: 'web', is_featured: false, sort_order: 9,
  },
  {
    title: 'Digital Polygraph Tool for Lie Detection Course', slug: 'digital-polygraph-tool',
    description: 'Interactive 3D digital polygraph simulation tool for educational lie detection courses with Blender-modeled assets and real-time visualization.',
    tech_stack: ['C#', 'Unity', 'Blender 3D', 'HTML', 'CSS', 'JavaScript'],
    category: 'game', is_featured: false, sort_order: 10,
  },
  {
    title: 'Ishaan Admin Dashboard & User Management', slug: 'ishaan-admin-dashboard',
    description: 'Admin dashboard for Ishaan Learning Management System with appointment scheduling, user management, and analytics built in React Native and Firebase.',
    tech_stack: ['JavaScript', 'React Native', 'Firebase'],
    category: 'web', is_featured: false, sort_order: 11,
  },
  // Mobile Apps (from MobilePortfolioSection)
  {
    title: 'Tarakain', slug: 'tarakain',
    description: 'Eatery finder mobile application helping users discover nearby restaurants and food establishments with reviews, menus, and navigation.',
    tech_stack: ['Kotlin', 'Android', 'Firebase', 'Google Maps API'],
    category: 'mobile', is_featured: false, sort_order: 12,
  },
  {
    title: 'Adutucart', slug: 'adutucart',
    description: 'Full-featured grocery shopping mobile app with product catalog, cart management, order tracking, and delivery integration.',
    tech_stack: ['Kotlin', 'Android', 'Firebase'],
    category: 'mobile', is_featured: false, sort_order: 13,
  },
  {
    title: 'Ishaan', slug: 'ishaan-mobile',
    description: 'Learning management system mobile app with student and teacher portals, course management, assignments, and real-time progress tracking.',
    tech_stack: ['React Native', 'Firebase', 'JavaScript'],
    category: 'mobile', is_featured: false, sort_order: 14,
  },
  {
    title: 'Mindwell', slug: 'mindwell',
    description: 'Mental health and wellness mobile app for patient monitoring, appointment scheduling, and telehealth consultations.',
    tech_stack: ['Kotlin', 'Android', 'Firebase'],
    category: 'mobile', is_featured: false, sort_order: 15,
  },
  {
    title: 'Rescuenet', slug: 'rescuenet',
    description: 'Emergency relief coordination mobile app for disaster response — real-time alerts, resource tracking, and volunteer coordination.',
    tech_stack: ['Kotlin', 'Android', 'Firebase', 'Google Maps API'],
    category: 'mobile', is_featured: false, sort_order: 16,
  },
  {
    title: 'Telemedicare', slug: 'telemedicare',
    description: 'Telehealth mobile application connecting patients with healthcare providers for remote consultations, prescriptions, and health monitoring.',
    tech_stack: ['Kotlin', 'Android', 'Firebase'],
    category: 'mobile', is_featured: false, sort_order: 17,
  },
  {
    title: 'Comfpee', slug: 'comfpee',
    description: 'Public comfort room finder app helping users locate the nearest clean public restrooms with ratings and directions.',
    tech_stack: ['Kotlin', 'Android', 'Google Maps API'],
    category: 'mobile', is_featured: false, sort_order: 18,
  },
  {
    title: 'Transire', slug: 'transire',
    description: 'Hotel booking mobile application with room browsing, reservation management, payment integration, and booking confirmation.',
    tech_stack: ['Kotlin', 'Android', 'Firebase'],
    category: 'mobile', is_featured: false, sort_order: 19,
  },
  {
    title: 'Do-mi', slug: 'do-mi',
    description: 'Community service coordination app connecting volunteers with local organizations for service opportunities and event management.',
    tech_stack: ['Kotlin', 'Android', 'Firebase'],
    category: 'mobile', is_featured: false, sort_order: 20,
  },
  {
    title: 'Spree', slug: 'spree',
    description: 'Safety navigation mobile app providing safe route suggestions, real-time alerts, and emergency SOS features for pedestrians and commuters.',
    tech_stack: ['Kotlin', 'Android', 'Google Maps API', 'Firebase'],
    category: 'mobile', is_featured: false, sort_order: 21,
  },
  {
    title: 'Eima', slug: 'eima',
    description: 'Educational learning management mobile app with interactive lessons, quizzes, progress analytics, and student-teacher collaboration.',
    tech_stack: ['Kotlin', 'Android', 'Firebase'],
    category: 'mobile', is_featured: false, sort_order: 22,
  },
  {
    title: 'Play n Learn', slug: 'play-n-learn',
    description: 'Gamified educational app combining interactive games with learning modules for children, featuring progress tracking and rewards.',
    tech_stack: ['Kotlin', 'Android', 'Firebase'],
    category: 'mobile', is_featured: false, sort_order: 23,
  },
  {
    title: 'Pasabay', slug: 'pasabay',
    description: 'Ride-sharing and carpooling mobile app connecting drivers with commuters headed to the same destination for affordable transportation.',
    tech_stack: ['Kotlin', 'Android', 'Firebase', 'Google Maps API'],
    category: 'mobile', is_featured: false, sort_order: 24,
  },
  {
    title: 'Ecomart', slug: 'ecomart',
    description: 'Eco-friendly grocery shopping app promoting sustainable products with carbon footprint tracking and green vendor marketplace.',
    tech_stack: ['Kotlin', 'Android', 'Firebase'],
    category: 'mobile', is_featured: false, sort_order: 25,
  },
  // BillSense (from resume — project)
  {
    title: 'BillSense Application', slug: 'billsense',
    description: 'AI-powered billing and expense tracking application with automated categorization, smart receipt scanning, and financial analytics.',
    tech_stack: ['Python', 'FastAPI', 'Vue.js', 'PostgreSQL', 'AI/ML'],
    category: 'web', is_featured: false, sort_order: 26,
  },
]

// ── NEWS ARTICLES ──
const articles = [
  {
    title: 'MiroFish: The Universal Swarm Intelligence Engine That Predicts Anything', slug: 'mirofish-swarm-intelligence',
    summary: 'A simple, universal swarm intelligence engine that can predict anything — from market trends to complex system behavior.',
    content: '<h2>What Is Swarm Intelligence?</h2><p>MiroFish is a zero-dependency swarm intelligence engine inspired by how fish schools and bird flocks solve complex problems collectively.</p><a href="https://github.com/666ghj/MiroFish" target="_blank">View on GitHub</a>',
    image_url: 'https://opengraph.githubassets.com/1/666ghj/MiroFish',
    link_url: 'https://github.com/666ghj/MiroFish', category: 'ai-agent', is_published: true, sort_order: 1,
  },
  {
    title: 'BettaFish: Break Your Information Bubble with Multi-Agent Sentiment AI', slug: 'bettafish-sentiment-analysis',
    summary: 'A multi-agent public opinion analysis assistant built from scratch that breaks information silos and predicts future trends.',
    content: '<h2>The Problem</h2><p>Social media algorithms trap you in echo chambers. BettaFish deploys multiple specialized agents to analyze sentiment across platforms.</p><a href="https://github.com/666ghj/BettaFish" target="_blank">View on GitHub</a>',
    image_url: 'https://opengraph.githubassets.com/1/666ghj/BettaFish',
    link_url: 'https://github.com/666ghj/BettaFish', category: 'ai-agent', is_published: true, sort_order: 2,
  },
  {
    title: 'claude-mem: Auto-Capture Every Claude Coding Session with AI Compression', slug: 'claude-mem-plugin',
    summary: 'A Claude Code plugin that records everything Claude does, compresses it with AI, and injects relevant context into future sessions.',
    content: '<h2>Never Lose Context Again</h2><p>claude-mem silently captures every action and decision during sessions, then compresses logs intelligently.</p><p class="used-in-project">Utilized in this project</p><a href="https://github.com/thedotmack/claude-mem" target="_blank">View on GitHub</a>',
    image_url: 'https://opengraph.githubassets.com/1/thedotmack/claude-mem',
    link_url: 'https://github.com/thedotmack/claude-mem', category: 'tool', is_published: true, sort_order: 3,
  },
  {
    title: 'The Ultimate Claude Code Awesome List: Skills, Hooks, Agents & More', slug: 'awesome-claude-code',
    summary: 'A curated collection of the best skills, hooks, slash-commands, agent orchestrators, and plugins for Claude Code.',
    content: '<h2>Power-Up Vault</h2><p>The community-curated hub for everything that extends Claude Code.</p><p class="used-in-project">Referenced in this project</p><a href="https://github.com/hesreallyhim/awesome-claude-code" target="_blank">View on GitHub</a>',
    image_url: 'https://opengraph.githubassets.com/1/hesreallyhim/awesome-claude-code',
    link_url: 'https://github.com/hesreallyhim/awesome-claude-code', category: 'tool', is_published: true, sort_order: 4,
  },
  {
    title: 'Context Mode: The Privacy-First Virtualization Layer for MCP Context', slug: 'context-mode-mcp',
    summary: 'MCP gives AI tools access to your systems. Context Mode adds a virtualization layer that controls exactly what context gets shared.',
    content: '<h2>The Context Problem</h2><p>Context Mode sits between your MCP servers and the AI, filtering sensitive data and applying access policies.</p><a href="https://github.com/mksglu/context-mode" target="_blank">View on GitHub</a>',
    image_url: 'https://opengraph.githubassets.com/1/mksglu/context-mode',
    link_url: 'https://github.com/mksglu/context-mode', category: 'mcp', is_published: true, sort_order: 5,
  },
  {
    title: 'WorldMonitor: Real-Time Global Intelligence Dashboard Powered by AI', slug: 'worldmonitor-dashboard',
    summary: 'A unified situational awareness interface aggregating AI-powered news, geopolitical monitoring, and infrastructure tracking.',
    content: '<h2>Command Center</h2><p>Open-source global intelligence dashboard pulling from dozens of live data sources with AI-powered surfacing.</p><a href="https://github.com/koala73/worldmonitor" target="_blank">View on GitHub</a>',
    image_url: 'https://opengraph.githubassets.com/1/koala73/worldmonitor',
    link_url: 'https://github.com/koala73/worldmonitor', category: 'ai-agent', is_published: true, sort_order: 6,
  },
  {
    title: 'Qwen Image Edit 2511: State-of-the-Art Visual AI Editing on Hugging Face', slug: 'qwen-image-edit-2511',
    summary: "Alibaba's latest multimodal model for precise image editing via natural language instructions.",
    content: '<h2>Edit Images with Words</h2><p>Specialized for image editing — inpainting, style transfer, object manipulation with state-of-the-art precision.</p><a href="https://huggingface.co/Qwen/Qwen-Image-Edit-2511" target="_blank">View on Hugging Face</a>',
    link_url: 'https://huggingface.co/Qwen/Qwen-Image-Edit-2511', category: 'ai-model', is_published: true, sort_order: 7,
  },
  {
    title: 'Kie.ai: One API Hub for Video, Image & Music Generation', slug: 'kie-ai-api-hub',
    summary: 'A unified API gallery for the best video, image, and music generation AI models — one key, one integration.',
    content: '<h2>API Marketplace</h2><p>Switch between image generation and video production without changing your code structure.</p><a href="https://kie.ai" target="_blank">Visit Kie.ai</a>',
    link_url: 'https://kie.ai', category: 'platform', is_published: true, sort_order: 8,
  },
  {
    title: 'AirLLM: Run 70B LLMs on a Single 4GB GPU — No Quantization Needed', slug: 'airllm-70b-inference',
    summary: 'AirLLM makes 70B parameter inference possible on consumer hardware through layer-by-layer streaming.',
    content: '<h2>Hardware Barrier Broken</h2><p>Layer streaming enables full-precision 70B inference on a single 4GB GPU.</p><a href="https://github.com/lyogavin/airllm" target="_blank">View on GitHub</a>',
    image_url: 'https://opengraph.githubassets.com/1/lyogavin/airllm',
    link_url: 'https://github.com/lyogavin/airllm', category: 'ai-model', is_published: true, sort_order: 9,
  },
  {
    title: 'LiquidAI LFM2-24B: Hybrid Architecture Redefining Efficient Inference', slug: 'liquidai-lfm2-24b',
    summary: "LiquidAI's LFM2-24B combines liquid neural networks with mixture-of-experts for frontier reasoning at low compute cost.",
    content: '<h2>Beyond Transformers</h2><p>24B parameters, only 2B active per forward pass — inference costs rival 2-3B dense models.</p><a href="https://huggingface.co/LiquidAI/LFM2-24B-A2B" target="_blank">View on Hugging Face</a>',
    link_url: 'https://huggingface.co/LiquidAI/LFM2-24B-A2B', category: 'ai-model', is_published: true, sort_order: 10,
  },
  {
    title: '20 SEO & GEO Skills for Claude Code: Dominate Search with AI Agents', slug: 'seo-geo-claude-skills',
    summary: '20 specialized SEO and GEO skills for Claude Code — keyword research, audits, content writing, and rank tracking.',
    content: '<h2>AI-Native SEO</h2><p>Production-ready skills using CORE-EEAT and CITE frameworks.</p><p class="used-in-project">Utilized in this project</p><a href="https://github.com/aaron-he-zhu/seo-geo-claude-skills" target="_blank">View on GitHub</a>',
    image_url: 'https://opengraph.githubassets.com/1/aaron-he-zhu/seo-geo-claude-skills',
    link_url: 'https://github.com/aaron-he-zhu/seo-geo-claude-skills', category: 'skills', is_published: true, sort_order: 11,
  },
  {
    title: '1000+ Claude Code Templates: Agents, Commands, Skills & MCP Integrations', slug: 'claude-code-templates',
    summary: 'CLI tool and library with 1000+ agents, commands, skills, and MCP integrations for Claude Code.',
    content: '<h2>Template Vault</h2><p>Browse, install, and manage configurations from your terminal.</p><p class="used-in-project">Utilized in this project</p><a href="https://github.com/davila7/claude-code-templates" target="_blank">View on GitHub</a>',
    image_url: 'https://opengraph.githubassets.com/1/davila7/claude-code-templates',
    link_url: 'https://github.com/davila7/claude-code-templates', category: 'tool', is_published: true, sort_order: 12,
  },
  {
    title: 'TRELLIS.2: Native Structured Latents Pushing 3D Generation to New Heights', slug: 'trellis2-3d-generation',
    summary: 'TRELLIS.2 introduces native compact structured latent representations for higher fidelity 3D generation.',
    content: '<h2>Next Frontier in 3D AI</h2><p>Operates directly in structured latent space for end-to-end differentiable 3D generation.</p>',
    category: '3d-gen', is_published: true, sort_order: 13,
  },
  {
    title: 'Top 3D AI: Your Complete Guide to Comparing AI 3D Generators', slug: 'top3d-ai-comparison',
    summary: 'A platform that benchmarks, rates, and compares the best AI 3D generators.',
    content: '<h2>Navigate the 3D AI Landscape</h2><p>Side-by-side comparisons, quality metrics, speed benchmarks, and pricing analysis.</p><a href="https://top3dai.com" target="_blank">Visit Top 3D AI</a>',
    link_url: 'https://top3dai.com', category: '3d-gen', is_published: true, sort_order: 14,
  },
  {
    title: 'Tencent Hunyuan3D: Industrial-Grade AI 3D Asset Generation', slug: 'tencent-hunyuan3d',
    summary: "Tencent's Hunyuan3D produces high-quality textured meshes from text or image in seconds.",
    content: '<h2>3D Generation at Scale</h2><p>PBR materials, OBJ/GLB/FBX output, batch processing for content pipelines.</p><a href="https://huggingface.co/tencent/Hunyuan3D-2" target="_blank">View on Hugging Face</a>',
    link_url: 'https://huggingface.co/tencent/Hunyuan3D-2', category: '3d-gen', is_published: true, sort_order: 15,
  },
  {
    title: '1273+ Agentic Skills: The Mega-Library for Claude Code, Cursor & More', slug: 'antigravity-awesome-skills',
    summary: 'Over 1273 installable agentic skills for Claude Code, Cursor, Codex CLI, Gemini CLI, and more.',
    content: '<h2>Largest Skills Library</h2><p>CLI installer for searching, previewing, and installing skills directly.</p><p class="used-in-project">Active in this project</p><a href="https://github.com/sickn33/antigravity-awesome-skills" target="_blank">View on GitHub</a>',
    image_url: 'https://opengraph.githubassets.com/1/sickn33/antigravity-awesome-skills',
    link_url: 'https://github.com/sickn33/antigravity-awesome-skills', category: 'skills', is_published: true, sort_order: 16,
  },
  {
    title: 'Trigger.dev: Build & Deploy Fully-Managed AI Agents Without the Infra Pain', slug: 'triggerdev-ai-agents',
    summary: 'Build long-running, production-grade AI agents and workflows that run reliably in the cloud.',
    content: '<h2>Agent Runtime</h2><p>Long-running tasks, automatic retries, real-time logs, native AI provider integrations.</p><a href="https://trigger.dev" target="_blank">Visit Trigger.dev</a>',
    link_url: 'https://trigger.dev', category: 'platform', is_published: true, sort_order: 17,
  },
  {
    title: 'Higgsfield: Cinematic AI Video & Image Generation for Creators', slug: 'higgsfield-ai-video',
    summary: 'Hollywood-quality AI video generation with character consistency, camera control, and physics-aware motion.',
    content: '<h2>AI Video That Looks Real</h2><p>Subject lock, camera path control, physics simulation, and style transfer.</p><a href="https://higgsfield.ai" target="_blank">Visit Higgsfield</a>',
    link_url: 'https://higgsfield.ai', category: 'ai-model', is_published: true, sort_order: 18,
  },
  {
    title: 'Picoclaw: Lightweight AI-Powered Automation for Modern Developers', slug: 'picoclaw-automation',
    summary: 'Minimal, fast, AI-native automation with tiny footprint and maximum impact.',
    content: '<h2>Stays Out of Your Way</h2><p>Small binary, zero config sprawl, composable primitives with AI decision nodes.</p><a href="https://picoclaw.com" target="_blank">Visit Picoclaw</a>',
    link_url: 'https://picoclaw.com', category: 'tool', is_published: true, sort_order: 19,
  },
  {
    title: 'Kiro: The Autonomous AI Agent That Ships Code Independently', slug: 'kiro-autonomous-agent',
    summary: 'An autonomous AI coding agent that researches, plans, writes code, tests, and delivers — all without hand-holding.',
    content: '<h2>Beyond Code Completion</h2><p>Give Kiro a task and it independently delivers a pull request. You review the result, not the process.</p><a href="https://kiro.dev" target="_blank">Visit Kiro</a>',
    link_url: 'https://kiro.dev', category: 'ai-agent', is_published: true, sort_order: 20,
  },
  {
    title: 'GitNexus: Zero-Server Code Intelligence with Browser-Native Knowledge Graphs', slug: 'gitnexus-knowledge-graph',
    summary: 'Drop in a GitHub repo, get an interactive knowledge graph with a built-in Graph RAG agent — all in your browser.',
    content: '<h2>Code Intelligence Without a Server</h2><p>Client-side knowledge graph engine with Graph RAG agent. Everything runs in the browser.</p><p class="used-in-project">Integrated in this project admin panel</p><a href="https://gitnexus.vercel.app" target="_blank">Open GitNexus</a>',
    image_url: 'https://opengraph.githubassets.com/1/nxpatterns/gitnexus',
    link_url: 'https://gitnexus.vercel.app', category: 'tool', is_published: true, sort_order: 21,
  },
]

async function seed() {
  console.log('=== Seeding Projects ===')
  // Clear existing projects
  const { error: delProjErr } = await supabase.from('projects').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (delProjErr) console.error('  Delete projects error:', delProjErr.message)
  else console.log('  Cleared old projects')

  // Insert projects
  const { data: projData, error: projErr } = await supabase.from('projects').insert(projects).select()
  if (projErr) console.error('  Insert projects error:', projErr.message)
  else console.log(`  Inserted ${projData.length} projects`)

  console.log('\n=== Seeding News ===')
  // Try inserting news
  const { data: newsData, error: newsErr } = await supabase.from('news').insert(articles).select()
  if (newsErr) {
    if (newsErr.message.includes('not find the table')) {
      console.error('  ❌ news table does not exist. Please create it in Supabase SQL Editor:')
      console.log(`
CREATE TABLE news (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    summary TEXT DEFAULT '',
    content TEXT DEFAULT '',
    image_url TEXT,
    video_url TEXT,
    link_url TEXT,
    category TEXT DEFAULT 'general',
    is_published BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS but allow all for now (same as other tables)
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON news FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER news_updated_at BEFORE UPDATE ON news FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `)
    } else {
      console.error('  Insert news error:', newsErr.message)
    }
  } else {
    console.log(`  Inserted ${newsData.length} articles`)
  }
}

seed()
