# NEURALYX — AI Systems Engineering Portfolio

A cinematic, full-stack portfolio platform built for AI Systems Engineer **Gabriel Alvin Aquino**. Features scroll-synced animations, parallax video backgrounds, an admin dashboard with CRUD management, AI-powered interview coaching, a self-hosted job application pipeline, and a secure credentials vault.

**Live Site:** [neuralyx.ai.dev-environment.site](https://neuralyx.ai.dev-environment.site)

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 + TypeScript + Vite 8 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) |
| Animation | GSAP + ScrollTrigger, Lenis Smooth Scroll |
| State | Pinia + Vue Router 4 |
| Database | PostgreSQL 17 (pgvector) |
| Backend / API | Node 20 Alpine (Express, MCP server) |
| Auth | TOTP 2FA (Google Authenticator) + PIN vault |
| Workflow Automation | n8n |
| Job Browser Automation | Playwright (Edge Profile 7) |
| AI Video | SadTalker (lip-sync), VoxCPM (voice clone), Gaze Correction sidecar |
| Speech | Whisper (local STT) |
| Search | SearXNG (self-hosted) |
| Browser Pool | Browserless Chrome |
| Reverse Proxy | Nginx |
| Containerisation | Docker Compose |

---

## Project Structure

```
Navlink/
├── src/
│   ├── components/
│   │   ├── landing/          # 10 cinematic landing page sections
│   │   └── shared/           # NavBar, ScrollVideoBackground, ParallaxLayer
│   ├── views/
│   │   └── admin/            # Dashboard, Jobs, Video Creation, Credentials, Logs
│   ├── stores/               # Pinia: content, auth, admin
│   ├── composables/          # useScrollVideo, useParallax, useSupabase
│   └── router/
├── mcp-server/               # MCP tools server (Supabase / local DB bridge)
├── scripts/                  # apply-indeed.ts — Playwright job auto-apply
├── docker/
│   ├── postgres/             # init.sql schema
│   └── nginx/                # nginx.conf
├── services/
│   ├── gaze/                 # Gaze-correction model (passthrough / ONNX)
│   ├── sadtalker/            # Lip-sync engine (CPU mode, GPU-ready)
│   ├── voxcpm/               # Voice clone engine
│   └── whisper/              # Local speech-to-text
├── docker-compose.yml        # Production services
├── docker-compose.dev.yml    # Dev overrides
└── dist/                     # Vite production build output
```

---

## Services (Docker Compose)

| Container | Port | Purpose |
|---|---|---|
| `neuralyx-frontend` | 80 / 443 | Vue SPA served via Nginx |
| `neuralyx-postgres` | 5432 | PostgreSQL 17 + pgvector |
| `neuralyx-mcp` | 3001 | MCP server — DB bridge + tools |
| `neuralyx-ai` | 8000 | AI orchestration service |
| `neuralyx-n8n` | 5678 | n8n workflow automation |
| `neuralyx-browser` | 3000 | Browserless Chrome pool |
| `neuralyx-gaze` | 8001 | Gaze correction sidecar |
| `neuralyx-sadtalker` | 8002 | SadTalker lip-sync |
| `neuralyx-voxcpm` | 8003 | VoxCPM voice clone |
| `neuralyx-whisper` | 8004 | Whisper STT |
| `neuralyx-searxng` | 8080 | SearXNG self-hosted search |

---

## Key Features

### Landing Page
- Cinematic scroll-video background with GSAP parallax
- 10 animated sections: Hero, About, Services, Projects, Skills, Tools, Certificates, Contact
- Color flow: Dark cyber (purple/cyan) → Transition → Angelic (gold/white)
- Mobile app portfolio carousel with video demos
- "Validate What You Need" floating AI client analysis

### Admin Dashboard

#### Video Creation (AI Interview Coach)
- Question bank with default scripts (PREP / STAR frameworks)
- Auto-match: typed or pasted question triggers the relevant default script
- **Refine with AI** — detects paste type (Job Description / Company Description / Recruiter Question / Simple Correction) and refines intelligently
- Floating script editor — draggable + 5-direction resize handles
- SadTalker lip-sync preview generation
- VoxCPM voice clone integration

#### Job Pipeline
- Kanban board: Saved → Applied → Interview → Offer
- Playwright auto-apply for Indeed (Edge Profile 7)
- n8n orchestration webhook
- Real-time pipeline health monitor

#### Other Admin Pages
- **Projects** — CRUD with image upload and video URLs
- **Skills** — Bulk edit with proficiency and years
- **News & Articles** — AI thumbnail generation, URL-to-article generator
- **Credentials Vault** — PIN + TOTP 2FA, masked reveal, per-credential status tracking
- **Session Logs** — Browser automation logs with filtering
- **Connections** — Read-only service health monitor

---

## Local Development

### Prerequisites
- Docker Desktop
- Node 20+

### Setup

```bash
# Clone
git clone git@github.com-hierarch24:HierArch24/NEURALYX.git
cd NEURALYX

# Install deps
npm install

# Copy env (fill in your keys)
cp .env.example .env

# Start all services
docker-compose up -d

# Frontend dev server (hot reload)
npm run dev
```

- Dev server: `http://localhost:5173`
- Admin login: `admin@neuralyx.dev` / `neuralyx2026`

### Build

```bash
npm run build
```

Output in `dist/`. Served by the Nginx container in production.

---

## Deployment

Two git remotes configured:

| Remote | Target |
|---|---|
| `origin` | GitHub — `HierArch24/NEURALYX` |
| `cpanel` | cPanel live site — `neuralyx.ai.dev-environment.site` |

```bash
# Push source to GitHub
git push origin main

# Deploy to live site
git push cpanel main
```

---

## Database Schema

Tables (defined in `docker/postgres/init.sql`):
`sections` · `projects` · `skills` · `tools` · `contact_messages` · `site_settings` · `credentials` · `news`

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (or local Postgres via MCP) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_OPENAI_KEY` | OpenAI API (Refine with AI, news gen, client validate) |
| `VITE_MCP_SERVER_URL` | MCP tools server (default: `http://localhost:3001`) |
| `HEYGEN_API_KEY` | HeyGen video generation |
| `N8N_WEBHOOK_URL` | n8n job pipeline webhook |
| `JWT_SECRET` | Admin auth token signing |

---

Built by **Gabriel Alvin Aquino** | AI Systems Engineer | 8+ Years Experience
