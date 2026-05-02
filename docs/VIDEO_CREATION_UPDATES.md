# NEURALYX Video Creation & Agent Updates
**Date: May 2026**

This document summarizes the comprehensive updates made to the NEURALYX Video Creation pipeline, AI Interview Chat, and the underlying AI Agent/MCP architecture.

## 1. Video Creation Page & Gaze Polish Pipeline

### Unified Model Picker
*   **Old Flow:** Confusing dual-picker system where users picked a live model and separately picked a polish backend, often resulting in silent failures (e.g. WebM/MP4 mismatch for Maxine).
*   **New Flow:** Single unified dropdown at the top of the page. The system automatically derives the correct `polishBackend`.
*   **Auto-Polish on Stop:** If a server-side model is selected (WangWilly, STED-Gaze, Maxine Cloud/Local), the system skips browser-side warping, records raw, and *automatically* fires the polish pipeline on Stop.

### Backend Routing & Transcoding
*   **WebM to MP4 Transcoding:** The browser records natively in WebM (VP9). NVIDIA Maxine gRPC NIM silently rejects WebM. The Python Gaze sidecar now detects Maxine requests and automatically transcodes WebM/VP9 to H.264 MP4 (`+faststart`) before beaming to the cloud.
*   **Auto-Fallback Chain:** If Maxine Cloud or Maxine Local fails (API key issue, timeout, offline), the sidecar automatically catches the exception and falls back to the local `wangwilly` L2SC TF model so the user still gets a corrected video.
*   **STED-Gaze Integration:** Fully integrated `sted_onnx` path (128x128 face crop redirection) handling all head poses.

## 2. Gabriel AI — Floating Chat Window

### Draggable Floating UI
*   The Gabriel AI Interview Practice chat inside the Video Creation wizard can now be expanded into a **floating window**.
*   Users can click and drag the header to move the chat anywhere on the screen.
*   The backdrop was lightened (`bg-black/30`) to ensure scripts/prompts remain readable behind the chat window.
*   Added a "Reset Position" button to easily snap the floating window back to its default location.

### Chat Cache Management & Cross-Window Sync
*   **Improved Clear Button:** Now displays the total message count (e.g., `Clear (12)`).
*   **Confirmation:** Explicit "This cannot be undone" confirmation to prevent accidental history wipes.
*   **BroadcastChannel Sync:** Clearing the cache in the inline wizard instantly broadcasts a `chat:clear` event, which wipes the history in any opened Popout windows to keep everything perfectly synchronized.

## 3. Comprehensive MCP & Skill Architecture

The platform's underlying toolset was upgraded by integrating the **Everything Claude Code (ECC)** and **Get Shit Done (GSD)** methodologies.

### 14 Configured MCP Servers
1.  **supabase:** Database, auth, and storage.
2.  **playwright:** Browser automation (Edge).
3.  **n8n / n8n-workflows:** Workflow orchestration.
4.  **heygen:** AI video generation.
5.  **github:** Repository management.
6.  **memory:** Persistent context memory.
7.  **sequential-thinking:** Complex reasoning.
8.  **context7:** Code & library context lookup.
9.  **filesystem:** File operations.
10. **token-optimizer:** Context window optimization.
11. **vercel:** Deployment management.
12. **skill-seekers:** Ingesting doc sites/repos/PDFs into knowledge.
13. **designlang:** Extracting design systems/tokens from URLs.

### 182+ ECC Skills & Rules
*   **27 ECC Rules** merged into `.claude/rules/ecc/` enforcing code quality, TDD, security patterns, and architecture.
*   **Custom Skills:** 
    *   `karpathy-wiki`: A self-curating project wiki workflow.
    *   `seo-geo`: 20 geographic and technical SEO optimization skills.
    *   `caveman` & `caveman-compress`: File compression and code analysis.

---
*These updates solidify NEURALYX as a highly autonomous, multi-agent platform capable of professional-grade video interview prep and scalable job application workflows.*