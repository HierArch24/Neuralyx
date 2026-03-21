import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://phpdxvaowytijhvclljb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBocGR4dmFvd3l0aWpodmNsbGpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MjE4ODksImV4cCI6MjA4OTQ5Nzg4OX0.ClHZrdLj47HKUiDTfh6oolx3zRtD_dO2kidjfqY92nY'
)

const articles = [
  {
    title: 'MiroFish: The Universal Swarm Intelligence Engine That Predicts Anything',
    slug: 'mirofish-swarm-intelligence',
    summary: 'A simple, universal swarm intelligence engine that can predict anything — from market trends to complex system behavior — using biologically-inspired collective computation.',
    content: `<h2>What Is Swarm Intelligence?</h2><p>MiroFish is a zero-dependency swarm intelligence engine inspired by how fish schools and bird flocks solve complex problems collectively. Unlike traditional ML models, swarm systems are emergent — intelligence arises from simple rules applied at scale.</p><h2>Why It Matters</h2><p>MiroFish is model-agnostic and universal. Feed it time-series data, classify patterns, or predict future states — all without heavy ML infrastructure.</p><a href="https://github.com/666ghj/MiroFish" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/666ghj/MiroFish',
    video_url: null, link_url: 'https://github.com/666ghj/MiroFish',
    category: 'ai-agent', is_published: true, sort_order: 1,
  },
  {
    title: 'BettaFish: Break Your Information Bubble with Multi-Agent Sentiment AI',
    slug: 'bettafish-sentiment-analysis',
    summary: 'A multi-agent public opinion analysis assistant built from scratch — no frameworks — that breaks information silos, reveals true sentiment, and predicts future trends.',
    content: `<h2>The Problem: Information Bubbles</h2><p>Social media algorithms trap you in echo chambers. BettaFish tears them down. Built without any AI framework dependency, it deploys multiple specialized agents to crawl, analyze, and synthesize public sentiment across platforms.</p><a href="https://github.com/666ghj/BettaFish" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/666ghj/BettaFish',
    video_url: null, link_url: 'https://github.com/666ghj/BettaFish',
    category: 'ai-agent', is_published: true, sort_order: 2,
  },
  {
    title: 'claude-mem: Auto-Capture Every Claude Coding Session with AI Compression',
    slug: 'claude-mem-plugin',
    summary: 'A Claude Code plugin that automatically records everything Claude does during coding sessions, compresses it with AI, and injects relevant context back into future sessions.',
    content: `<h2>Never Lose Context Again</h2><p>claude-mem silently captures every action, decision, and code change Claude makes during your sessions. Using Claude's agent SDK, it compresses logs intelligently — keeping what matters, discarding noise.</p><p class="used-in-project">✅ Utilized in this project for session continuity.</p><a href="https://github.com/thedotmack/claude-mem" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/thedotmack/claude-mem',
    video_url: null, link_url: 'https://github.com/thedotmack/claude-mem',
    category: 'tool', is_published: true, sort_order: 3,
  },
  {
    title: 'The Ultimate Claude Code Awesome List: Skills, Hooks, Agents & More',
    slug: 'awesome-claude-code',
    summary: 'A curated collection of the best skills, hooks, slash-commands, agent orchestrators, applications, and plugins for Claude Code — the definitive reference for power users.',
    content: `<h2>Your Claude Code Power-Up Vault</h2><p>The awesome-claude-code repository is the community-curated hub for everything that extends Claude Code. From custom hooks to full agent orchestrators — it's all here.</p><p class="used-in-project">✅ Referenced for skill and hook patterns used in this project.</p><a href="https://github.com/hesreallyhim/awesome-claude-code" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/hesreallyhim/awesome-claude-code',
    video_url: null, link_url: 'https://github.com/hesreallyhim/awesome-claude-code',
    category: 'tool', is_published: true, sort_order: 4,
  },
  {
    title: 'Context Mode: The Privacy-First Virtualization Layer for MCP Context',
    slug: 'context-mode-mcp',
    summary: 'MCP gives AI tools access to your systems. Context Mode adds a virtualization layer that controls exactly what context gets shared — privacy-first, with surgical precision.',
    content: `<h2>The Context Problem</h2><p>MCP is the protocol that lets AI agents access tools, files, databases, and APIs. But every connection is a potential context leak. Context Mode sits between your MCP servers and the AI, acting as a virtualization layer for context control.</p><a href="https://github.com/mksglu/context-mode" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/mksglu/context-mode',
    video_url: null, link_url: 'https://github.com/mksglu/context-mode',
    category: 'mcp', is_published: true, sort_order: 5,
  },
  {
    title: 'WorldMonitor: Real-Time Global Intelligence Dashboard Powered by AI',
    slug: 'worldmonitor-dashboard',
    summary: 'A unified situational awareness interface that aggregates AI-powered news, monitors geopolitical events, and tracks infrastructure — all in real time.',
    content: `<h2>Command Center for the Information Age</h2><p>WorldMonitor pulls from dozens of live data sources — news APIs, satellite data, infrastructure monitors, and social signals — then uses AI to surface what actually matters.</p><a href="https://github.com/koala73/worldmonitor" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/koala73/worldmonitor',
    video_url: null, link_url: 'https://github.com/koala73/worldmonitor',
    category: 'ai-agent', is_published: true, sort_order: 6,
  },
  {
    title: 'Qwen Image Edit 2511: State-of-the-Art Visual AI Editing on Hugging Face',
    slug: 'qwen-image-edit-2511',
    summary: "Alibaba's latest multimodal model for precise image editing via natural language — inpainting, style transfer, object manipulation, all through simple text instructions.",
    content: `<h2>Edit Images with Words</h2><p>Qwen-Image-Edit-2511 is Alibaba's frontier multimodal model specialized for image editing. It understands existing images and makes precise, instruction-following edits.</p><a href="https://huggingface.co/Qwen/Qwen-Image-Edit-2511" target="_blank">View on Hugging Face →</a>`,
    image_url: null, video_url: null,
    link_url: 'https://huggingface.co/Qwen/Qwen-Image-Edit-2511',
    category: 'ai-model', is_published: true, sort_order: 7,
  },
  {
    title: 'Kie.ai: One API Hub for Video, Image & Music Generation',
    slug: 'kie-ai-api-hub',
    summary: 'A unified API gallery giving developers access to the best video, image, and music generation AI models — one key, one integration, every model.',
    content: `<h2>The Generative AI API Marketplace</h2><p>Kie.ai aggregates the best generative AI models behind a single unified API. Switch between image generation and cinematic video production without changing your code structure.</p><a href="https://kie.ai" target="_blank">Visit Kie.ai →</a>`,
    image_url: null, video_url: null, link_url: 'https://kie.ai',
    category: 'platform', is_published: true, sort_order: 8,
  },
  {
    title: 'AirLLM: Run 70B LLMs on a Single 4GB GPU — No Quantization Needed',
    slug: 'airllm-70b-inference',
    summary: 'AirLLM makes 70-billion parameter inference possible on consumer hardware through layer-by-layer streaming — no quantization, no quality loss, no data center required.',
    content: `<h2>The Hardware Barrier, Broken</h2><p>AirLLM streams layers from disk, processes each layer's forward pass, then moves on. Full-precision 70B inference on a single 4GB GPU with no quality degradation.</p><a href="https://github.com/lyogavin/airllm" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/lyogavin/airllm',
    video_url: null, link_url: 'https://github.com/lyogavin/airllm',
    category: 'ai-model', is_published: true, sort_order: 9,
  },
  {
    title: 'LiquidAI LFM2-24B: Hybrid Architecture Redefining Efficient Inference',
    slug: 'liquidai-lfm2-24b',
    summary: "LiquidAI's LFM2-24B-A2B model combines liquid neural networks with mixture-of-experts, delivering frontier reasoning at a fraction of the compute cost.",
    content: `<h2>Beyond Transformers</h2><p>24B total parameters, only 2B active per forward pass. Inference costs rival 2-3B dense models while maintaining capabilities that compete with much larger systems.</p><a href="https://huggingface.co/LiquidAI/LFM2-24B-A2B" target="_blank">View on Hugging Face →</a>`,
    image_url: null, video_url: null,
    link_url: 'https://huggingface.co/LiquidAI/LFM2-24B-A2B',
    category: 'ai-model', is_published: true, sort_order: 10,
  },
  {
    title: '20 SEO & GEO Skills for Claude Code: Dominate Search with AI Agents',
    slug: 'seo-geo-claude-skills',
    summary: 'A ready-to-install set of 20 specialized SEO and GEO skills for Claude Code — keyword research, audits, content writing, rank tracking, and more.',
    content: `<h2>AI-Native SEO at Your Command</h2><p>20 production-ready skills implementing CORE-EEAT and CITE frameworks for SEO/GEO optimization across Claude Code, Cursor, Codex, and 35+ agents.</p><p class="used-in-project">✅ Skills referenced for this project's content optimization.</p><a href="https://github.com/aaron-he-zhu/seo-geo-claude-skills" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/aaron-he-zhu/seo-geo-claude-skills',
    video_url: null, link_url: 'https://github.com/aaron-he-zhu/seo-geo-claude-skills',
    category: 'skills', is_published: true, sort_order: 11,
  },
  {
    title: '1000+ Claude Code Templates: Agents, Commands, Skills & MCP Integrations',
    slug: 'claude-code-templates',
    summary: 'A CLI tool and massive template library for configuring and monitoring Claude Code — over 1000 agents, commands, skills, and MCP integrations ready to deploy.',
    content: `<h2>The Claude Code Template Vault</h2><p>1000+ production-ready configurations — agent definitions, slash commands, workflow skills, and MCP server integrations. Browse, install, and manage directly from your terminal.</p><p class="used-in-project">✅ Templates and patterns utilized in this project's Claude Code setup.</p><a href="https://github.com/davila7/claude-code-templates" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/davila7/claude-code-templates',
    video_url: null, link_url: 'https://github.com/davila7/claude-code-templates',
    category: 'tool', is_published: true, sort_order: 12,
  },
  {
    title: 'TRELLIS.2: Native Structured Latents Pushing 3D Generation to New Heights',
    slug: 'trellis2-3d-generation',
    summary: 'TRELLIS.2 introduces native compact structured latent representations for 3D generation — higher fidelity, faster inference, and better multi-view consistency.',
    content: `<h2>The Next Frontier in 3D AI</h2><p>TRELLIS.2 operates directly in structured latent space — a compact representation that natively encodes 3D geometry, texture, and material properties for end-to-end differentiable 3D generation.</p>`,
    image_url: null, video_url: null, link_url: null,
    category: '3d-gen', is_published: true, sort_order: 13,
  },
  {
    title: 'Top 3D AI: Your Complete Guide to Comparing AI 3D Generators',
    slug: 'top3d-ai-comparison',
    summary: 'A comprehensive platform that benchmarks, rates, and compares the best AI 3D generators — helping creators find the right tool for every use case.',
    content: `<h2>Navigate the 3D AI Landscape</h2><p>Side-by-side comparisons, quality metrics, speed benchmarks, pricing analysis, and use-case recommendations for all major AI 3D generation tools.</p><a href="https://top3dai.com" target="_blank">Visit Top 3D AI →</a>`,
    image_url: null, video_url: null, link_url: 'https://top3dai.com',
    category: '3d-gen', is_published: true, sort_order: 14,
  },
  {
    title: 'Tencent Hunyuan3D: Industrial-Grade AI 3D Asset Generation',
    slug: 'tencent-hunyuan3d',
    summary: "Tencent's Hunyuan3D model brings enterprise-scale 3D generation to Hugging Face — high-quality textured meshes from text or image in seconds.",
    content: `<h2>3D Generation at Scale</h2><p>Production-grade 3D generation trained on massive datasets — PBR materials, OBJ/GLB/FBX output, batch processing for content pipelines and e-commerce catalogs.</p><a href="https://huggingface.co/tencent/Hunyuan3D-2" target="_blank">View on Hugging Face →</a>`,
    image_url: null, video_url: null,
    link_url: 'https://huggingface.co/tencent/Hunyuan3D-2',
    category: '3d-gen', is_published: true, sort_order: 15,
  },
  {
    title: '1273+ Agentic Skills: The Mega-Library for Claude Code, Cursor & More',
    slug: 'antigravity-awesome-skills',
    summary: 'An installable GitHub library of over 1273 agentic skills for Claude Code, Cursor, Codex CLI, Gemini CLI, and more — with a CLI installer and bundles.',
    content: `<h2>The Largest Agentic Skills Library</h2><p>1273+ skills spanning every domain and programming language. CLI installer lets you search, preview, and install skills directly.</p><p class="used-in-project">✅ Skills from this library are active in this project's Claude Code environment.</p><a href="https://github.com/sickn33/antigravity-awesome-skills" target="_blank">View on GitHub →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/sickn33/antigravity-awesome-skills',
    video_url: null, link_url: 'https://github.com/sickn33/antigravity-awesome-skills',
    category: 'skills', is_published: true, sort_order: 16,
  },
  {
    title: 'Trigger.dev: Build & Deploy Fully-Managed AI Agents Without the Infra Pain',
    slug: 'triggerdev-ai-agents',
    summary: 'Trigger.dev lets you build long-running, production-grade AI agents and workflows that run reliably in the cloud — no servers to manage.',
    content: `<h2>The Agent Runtime</h2><p>Long-running tasks without timeouts, automatic retries, real-time execution logs, and native AI provider integrations. Write TypeScript agent logic, deploy, trigger via API or webhooks.</p><a href="https://trigger.dev" target="_blank">Visit Trigger.dev →</a>`,
    image_url: null, video_url: null, link_url: 'https://trigger.dev',
    category: 'platform', is_published: true, sort_order: 17,
  },
  {
    title: 'Higgsfield: Cinematic AI Video & Image Generation for Creators',
    slug: 'higgsfield-ai-video',
    summary: 'Higgsfield delivers Hollywood-quality AI video and image generation with precise character consistency, dynamic camera control, and physics-aware motion.',
    content: `<h2>AI Video That Looks Real</h2><p>Subject lock for character consistency, camera path control (dolly, orbit, crane via text), physics simulation, and style transfer — all through a clean API and web interface.</p><a href="https://higgsfield.ai" target="_blank">Visit Higgsfield →</a>`,
    image_url: null, video_url: null, link_url: 'https://higgsfield.ai',
    category: 'ai-model', is_published: true, sort_order: 18,
  },
  {
    title: 'Picoclaw: Lightweight AI-Powered Automation for Modern Developers',
    slug: 'picoclaw-automation',
    summary: 'Picoclaw brings minimal, fast, AI-native automation to your development workflow — tiny footprint, maximum impact.',
    content: `<h2>Automation That Stays Out of Your Way</h2><p>Small binary, zero config sprawl, composable primitives. AI decision nodes can be inserted at any step for intelligent routing, classification, or generation.</p><a href="https://picoclaw.com" target="_blank">Visit Picoclaw →</a>`,
    image_url: null, video_url: null, link_url: 'https://picoclaw.com',
    category: 'tool', is_published: true, sort_order: 19,
  },
  {
    title: 'Kiro: The Autonomous AI Agent That Ships Code Independently',
    slug: 'kiro-autonomous-agent',
    summary: 'Kiro is an autonomous AI coding agent that takes a task, researches, plans, writes code, tests, and delivers a working result — all without hand-holding.',
    content: `<h2>Beyond Code Completion</h2><p>Give Kiro a task in plain English and it independently researches the codebase, plans implementation, writes code, runs tests, and delivers a pull request. You review the result, not the process.</p><a href="https://kiro.dev" target="_blank">Visit Kiro →</a>`,
    image_url: null, video_url: null, link_url: 'https://kiro.dev',
    category: 'ai-agent', is_published: true, sort_order: 20,
  },
  {
    title: 'GitNexus: Zero-Server Code Intelligence with Browser-Native Knowledge Graphs',
    slug: 'gitnexus-knowledge-graph',
    summary: 'GitNexus runs entirely in your browser — drop in a GitHub repo or ZIP, get an interactive knowledge graph with a built-in Graph RAG agent.',
    content: `<h2>Code Intelligence Without a Server</h2><p>Client-side knowledge graph engine for codebases. Built-in Graph RAG agent answers natural language queries about your code. Everything runs in the browser — no data leaves your machine.</p><p class="used-in-project">✅ GitNexus is integrated into this project's admin panel for codebase exploration.</p><a href="https://gitnexus.vercel.app" target="_blank">Open GitNexus →</a>`,
    image_url: 'https://opengraph.githubassets.com/1/nxpatterns/gitnexus',
    video_url: null, link_url: 'https://gitnexus.vercel.app',
    category: 'tool', is_published: true, sort_order: 21,
  },
]

async function seed() {
  // First delete old articles
  const { error: delErr } = await supabase.from('news').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (delErr) console.error('Delete error:', delErr.message)
  else console.log('Cleared old articles')

  // Insert new articles
  const { data, error } = await supabase.from('news').insert(articles).select()
  if (error) {
    console.error('Insert error:', error.message)
  } else {
    console.log(`Successfully inserted ${data.length} articles`)
  }
}

seed()
