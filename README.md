# NEURALYX - AI Systems Engineering Portfolio

A cinematic, full-stack portfolio platform built for AI Systems Engineer **Gabriel Alvin Aquino**. Features scroll-synced animations, parallax effects, an admin dashboard with CRUD management, and AI-powered client validation.

**Live Site:** [neuralyx.ai.dev-environment.site](https://neuralyx.ai.dev-environment.site)

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | Vue 3, TypeScript, Vite 8, Tailwind CSS v4 |
| Animation | GSAP, ScrollTrigger, Lenis Smooth Scroll |
| State | Pinia, Vue Router 4 |
| Backend | Supabase (PostgreSQL, Auth, REST API) |
| AI | OpenAI GPT-4o (Validate Need feature) |
| DevOps | Docker, nginx, GitHub Actions CI/CD |
| Hosting | cPanel (production), Docker (local dev) |

## Features

### Landing Page
- Cinematic hero with scroll-synced video background
- Parallax rings section with mouse-reactive layers
- Mobile app portfolio carousel with video demos (14 apps)
- Web development projects showcase (admin-managed)
- Skills table with technology logos
- Tech News section (21+ curated articles)
- Interactive certificates gallery (20 certificates)
- AI automation projects showcase
- "Validate What You Need" floating button with AI analysis

### Admin Dashboard
- **Projects** - CRUD with search, category filters, drag-and-drop image upload, video URLs
- **Skills** - Bulk edit (set all years/proficiency), search, category filters, pagination
- **News** - Article management with category filters, pagination (10/page)
- **Resume** - Structured editor synced with certificates tab
- **Certificates** - Grid gallery with featured toggle for resume
- **Sections** - Landing page section management
- **Messages** - Contact form submissions
- **Connections** - Read-only system connection health monitor
- **Git Nexus** - Self-hosted code intelligence engine with Auto Clone agent
- **Introduction Video** - Drag-and-drop video upload for landing page

### AI-Powered Features
- **Validate What You Need** - GPT-4o powered client needs assessment
  - 7 domain expertise matching (Business, Marketing, DevOps, AI/ML, Chatbots, Integration, Data)
  - File upload analysis (PDF, Word, Excel, CSV)
  - Guided domain selection for unsure users
  - Match percentage, recommendations, toolset, prerequisites
- **GitNexus Auto Clone** - AI agent fills GitHub URL and PAT in self-hosted GitNexus iframe

### Shareable Content
- `/video/:slug` - Shareable video player pages for project demos
- `/certificates` - Public certificates gallery
- `/automation` - Automation projects showcase
- `/news` - Tech news articles with category filters

## Architecture

```
src/
  components/
    landing/     # 10 section components (Hero, About, Skills, etc.)
    shared/      # NavBar, ResumeModal, VideoModal, ValidateNeedModal
  views/
    admin/       # 10 admin pages (Dashboard, Projects, Skills, etc.)
  stores/        # Pinia stores (content, auth, admin)
  composables/   # Reusable hooks (useScrollVideo, useSmoothScroll, etc.)
  layouts/       # AdminLayout with collapsible sidebar
docker/
  Dockerfile.frontend  # Multi-stage: build app + GitNexus, serve via nginx
  nginx.conf           # SPA routing + GitNexus sub-app
mcp-server/            # MCP server with Supabase tools
```

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Docker (local)
docker compose up -d --build frontend
```

## Deployment

Push to `main` branch triggers GitHub Actions CI/CD:
1. Builds Vue app with Supabase + OpenAI env vars
2. Builds GitNexus from source
3. Deploys via rsync to cPanel

Development happens on `dev` branch - no auto-deploy.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `VITE_OPENAI_KEY` | OpenAI API key (for Validate Need AI) |

## Database (Supabase)

Tables: `projects`, `skills`, `tools`, `news`, `sections`, `contact_messages`, `site_settings`

---

Built by **Gabriel Alvin Aquino** | AI Systems Engineer | 8+ Years Experience
