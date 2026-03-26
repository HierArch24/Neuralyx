# NEURALYX - AI Systems Engineering Portfolio

A cinematic, full-stack portfolio platform built for AI Systems Engineer **Gabriel Alvin Aquino**. Features scroll-synced animations, parallax effects, an admin dashboard with CRUD management, AI-powered client validation, and a secure credentials vault.

**Live Site:** [neuralyx.ai.dev-environment.site](https://neuralyx.ai.dev-environment.site)

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | Vue 3, TypeScript, Vite 8, Tailwind CSS v4 |
| Animation | GSAP, ScrollTrigger, Lenis Smooth Scroll |
| State | Pinia, Vue Router 4 |
| Backend | Supabase (PostgreSQL, Auth, REST API) |
| AI | OpenAI GPT-5.2 (Validate Need, News Gen, DALL-E thumbnails) |
| DevOps | Docker, nginx, GitHub Actions CI/CD |
| Hosting | cPanel (production), Docker (local dev) |
| Security | TOTP 2FA (Google Authenticator), PIN-protected vault |

## Features

### Landing Page
- Cinematic hero with scroll-synced video background
- Parallax rings section with mouse-reactive layers
- Mobile app portfolio carousel with video demos (14 apps)
- Web development projects showcase (admin-managed)
- Skills table with technology logos
- Tech News section with smart search and pagination (9/page)
- Interactive certificates gallery (20 certificates)
- AI automation projects showcase
- "Validate What You Need" floating button with AI analysis

### Admin Dashboard
- **Projects** - CRUD with search, category filters, drag-and-drop image upload, video URLs
- **Skills** - Bulk edit (set all years/proficiency), search, category filters, pagination
- **News & Articles** - Table management with inline image swap, AI thumbnail generation, smart category search, pagination, URL-to-article AI generator
- **Resume** - Structured editor synced with certificates tab
- **Certificates** - Grid gallery with featured toggle for resume
- **Sections** - Landing page section management
- **Messages** - Contact form submissions
- **Connections** - Read-only system connection health monitor
- **Git Nexus** - Self-hosted code intelligence engine (iframe on localhost, external link on live)
- **Credentials Vault** - Secure credential management with PIN + Google Authenticator 2FA
- **Introduction Video** - Drag-and-drop video upload for landing page

### Credentials Vault
- PIN + TOTP (Google Authenticator) required on every visit
- Company-based accordion with expandable service tables
- Per-credential: type, status (Active/In Use/Expired/Quota Exceeded/Revoked), utilized_by tracking, last_used_at
- Floating detail window with masked values, reveal/copy/edit/delete
- Filters by status, search across companies/services/labels

### AI-Powered Features
- **News from URL** - Paste a URL, GPT-5.2 generates title, summary, content, category
- **AI Thumbnail Generator** - Screenshot (microlink.io) or DALL-E 3 generation for missing article images
- **Batch Fix** - One-click thumbnail generation for all articles missing images
- **Validate What You Need** - GPT-powered client needs assessment with file upload analysis
- **GitNexus Auto Clone** - AI agent fills GitHub URL and PAT in self-hosted GitNexus iframe

### Shareable Content
- `/video/:slug` - Shareable video player pages for project demos
- `/certificates` - Public certificates gallery
- `/automation` - Automation projects showcase
- `/news` - Tech news articles with smart search and category filters

## Architecture

```
src/
  components/
    landing/     # 10 section components (Hero, About, Skills, etc.)
    shared/      # NavBar, ResumeModal, VideoModal, ValidateNeedModal
  views/
    admin/       # 12 admin pages (Dashboard, Projects, Skills, News, Credentials, etc.)
  stores/        # Pinia stores (content, auth, admin)
  composables/   # Reusable hooks (useScrollVideo, useSmoothScroll, etc.)
  utils/         # generateNewsFromUrl, generateThumbnail
  layouts/       # AdminLayout with collapsible sidebar
docker/
  Dockerfile.frontend  # Multi-stage: build app + GitNexus, serve via nginx
  Dockerfile.mcp       # MCP API server (URL fetch, screenshots, image proxy/upload)
  nginx.conf           # SPA routing + GitNexus sub-app
mcp-server/            # Node.js API server (fetch-url, screenshot, proxy-image, upload)
```

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Docker (full stack)
docker compose up -d --build

# Docker (frontend only)
docker compose up -d --build frontend
```

## Deployment

Push to `main` branch triggers GitHub Actions CI/CD:
1. Builds Vue app with Supabase + OpenAI env vars
2. Builds GitNexus from source
3. Deploys via rsync to cPanel

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `VITE_OPENAI_KEY` | OpenAI API key (GPT-5.2, DALL-E 3) |
| `VITE_MCP_SERVER_URL` | MCP API server URL (default: http://localhost:8080) |

## Database (Supabase)

Tables: `projects`, `skills`, `tools`, `news`, `sections`, `contact_messages`, `site_settings`, `credentials`

---

Built by **Gabriel Alvin Aquino** | AI Systems Engineer | 8+ Years Experience
