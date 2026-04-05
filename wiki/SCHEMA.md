# NEURALYX Job Intelligence Wiki — Schema

Based on Andrej Karpathy's LLM Wiki pattern. This wiki is a persistent, compounding knowledge base maintained by AI agents. The AI writes and maintains all of it. You curate sources, direct analysis, and ask questions.

## Architecture

### Layer 1: Raw Sources (`wiki/raw/`)
- Job descriptions (auto-saved when pulled)
- Company research results (SearXNG + AI)
- Application responses (emails, messages)
- Interview notes
- Recruiter profiles
- Industry reports

### Layer 2: Wiki Pages (`wiki/pages/`)
AI-generated and maintained markdown files:

**Company Pages** (`pages/companies/`)
- One file per company researched
- Tech stack, culture, funding, Glassdoor sentiment
- Recruiter contacts found
- Application history with this company
- Updated every time we interact with this company

**Recruiter Pages** (`pages/recruiters/`)
- One file per recruiter/hiring manager contacted
- Contact info, platform, company
- Communication history
- Response patterns

**Skill Demand Pages** (`pages/skills/`)
- One file per skill/technology
- How often it appears in job descriptions
- Salary correlation
- Companies that need it
- Trending up or down

**Application Pattern Pages** (`pages/patterns/`)
- What works: cover letter approaches, application methods
- Response rates by channel (email vs job board vs portal)
- Best time to apply, follow-up cadence
- ATS-specific patterns (Greenhouse vs Lever vs Workday)

**Synthesis Pages** (`pages/`)
- `overview.md` — current job market snapshot
- `strategy.md` — evolving application strategy
- `insights.md` — patterns discovered across all applications
- `weekly-report.md` — auto-generated weekly summary

### Layer 3: Schema (this file)
Conventions and workflows for the LLM agents.

## Special Files

**`wiki/index.md`** — catalog of all wiki pages with one-line summaries
**`wiki/log.md`** — chronological record of all wiki operations

## Operations

### Ingest (after every job pull)
1. For each new job found, extract company name
2. Check if `pages/companies/{company}.md` exists
3. If not, create it with initial data from job description
4. If yes, update with new job listing info
5. Update skill demand pages based on job requirements
6. Update index.md
7. Append to log.md

### Query (when user asks about a company/pattern)
1. Read index.md to find relevant pages
2. Read those pages
3. Synthesize answer with citations
4. If answer is valuable, save as new wiki page

### Lint (weekly maintenance)
1. Check for companies with no recent activity (stale pages)
2. Find skills trending up/down
3. Update overview.md with current market snapshot
4. Flag contradictions between pages
5. Suggest new sources to investigate

## Page Format

Every wiki page uses this frontmatter:

```yaml
---
title: Company Name
type: company | recruiter | skill | pattern | synthesis
created: 2026-04-06
updated: 2026-04-06
sources: 3
tags: [ai, automation, remote]
---
```

## Conventions
- All files are markdown
- Use `[[wikilinks]]` for cross-references
- Keep pages focused — one entity/concept per page
- AI updates pages in-place, never creates duplicates
- Every change is logged in log.md
