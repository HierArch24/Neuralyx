/**
 * Catalog of gaze-correction approaches the Record tab can offer.
 *
 * Cleaned dashboard (v3) — 8 rows.
 *
 * status:
 *   - 'ready'     → drop-in usable today
 *   - 'config'    → needs a one-time setup step (model file, sidecar build, GPU rental, etc.)
 *   - 'future'    → reserved for paths the user is still considering but not active
 */

export type GazeStatus = 'ready' | 'config' | 'future'

export interface GazeModel {
  id: string
  label: string
  short: string
  status: GazeStatus
  pipelineMode: 'off' | 'landmark' | 'custom' | 'onnx' | 'chihfanhsu'
  description: string
  pros: string[]
  cons: string[]
  setup: string[]
  runtime: 'browser' | 'server' | 'browser+server'
  license: string
  reference?: string
}

export const GAZE_MODELS: GazeModel[] = [
  {
    id: 'auto',
    label: 'Auto (recommended)',
    short: 'Recording stays clean — WangWilly polish runs server-side on Stop',
    status: 'ready',
    pipelineMode: 'auto' as unknown as 'custom',  // resolved at runtime by useRecorderPipeline
    runtime: 'browser+server',
    license: 'MIT (this project)',
    description: 'No warp during recording. The saved take is clean raw camera. After Stop, the WangWilly L2SC server-side model is auto-applied to redirect eyes — without any of the live-warp artifacts that browser modes can introduce when your face geometry isn\'t perfectly frontal.',
    pros: ['No live-warp artifacts in the recording', 'Photorealistic correction via WangWilly on stop', 'Best quality / safety balance'],
    cons: ['Adds 10-30 s post-record processing time', 'Live preview shows raw eyes (no instant feedback)'],
    setup: [],
  },
  {
    id: 'off',
    label: 'Off',
    short: 'No correction — passthrough',
    status: 'ready',
    pipelineMode: 'off',
    runtime: 'browser',
    license: '—',
    description: 'Your camera frame is recorded as-is, with no gaze redirection.',
    pros: ['Zero overhead', 'Most accurate to reality'],
    cons: ['No eye-contact effect — viewer can tell when you read off-camera'],
    setup: [],
  },
  {
    id: 'custom',
    label: 'Custom — radial pixel warp',
    short: 'Browser-side Gaussian warp of your real iris pixels (live preview)',
    status: 'ready',
    pipelineMode: 'custom',
    runtime: 'browser',
    license: 'MIT (this project)',
    description: 'Per-pixel radial warp running in the browser. Detects iris position with MediaPipe FaceLandmarker and pulls real eye pixels toward the eye center with a Gaussian falloff — no painted overlays, no synthetic discs. Useful when you want a visible live preview during recording, accepting that the warp is heuristic rather than learned.',
    pros: ['Runs at 30 fps in-browser', 'No external models', 'Adjustable strength slider'],
    cons: ['Heuristic, not learned — can over-distort on extreme gaze offsets', 'Bakes warp into the recording (cleaner to use Auto + WangWilly polish on stop)'],
    setup: ['Already configured. Pick from dropdown to opt in.'],
  },
  {
    id: 'wangwilly',
    label: 'WangWilly L2SC (server, BSD-3)',
    short: 'Pretrained chihfanhsu warping CNN — primary post-process polish',
    status: 'ready',
    pipelineMode: 'off',  // server-side; live preview falls back to Auto/Custom
    runtime: 'server',
    license: 'BSD-3-Clause',
    reference: 'https://github.com/WangWilly/gaze-correction-cam',
    description: 'Real pretrained gaze-warping CNN released by WangWilly under BSD-3. Same chihfanhsu/L2SC architecture used in academic papers, with weights trained on the DIRL dataset (~5.7 MB). Runs in the Python sidecar (TF 2.19 + dlib + ffmpeg) for the post-record polish path. Trained on head-pose 0 only — best results when face is frontal.',
    pros: ['Real pretrained model — not a heuristic', 'No painted overlays — warps your real iris pixels', 'BSD-3 license, runs locally, no cloud dependency'],
    cons: ['Trained on head-pose 0 only — can show artifacts on heavily turned heads', 'Server-side only — adds 10-30 s post-record processing time'],
    setup: [
      'Already configured. Pick as the polish backend in the Record tab.',
      'Hidden config: services/gaze/checkpoints/wangwilly/{L,R}/ + shape_predictor_68_face_landmarks.dat',
    ],
  },
  {
    id: 'onnx',
    label: 'Browser ONNX (drop-in)',
    short: 'Bring-your-own ONNX gaze model — runs client-side via ORT-Web',
    status: 'ready',
    pipelineMode: 'onnx',
    runtime: 'browser',
    license: 'Depends on model',
    description: 'Generic ONNX gaze-redirection slot. ONNX Runtime Web is bundled. Default expects a 64×64 RGB eye crop input → same-shape warped eye output. Drop in our self-trained TinyUNet today (1.7 MB), or replace with a STED-Gaze ONNX after you train one on rented GPU.',
    pros: ['Runs fully in-browser', 'Lazy-loaded — zero cost if unused', 'Auto-detects whatever .onnx is at public/models/gaze_redirect.onnx'],
    cons: ['Tied to a specific input shape; bigger models may need code adjustments', 'TinyUNet currently shipped is near-identity — visible warp requires a stronger model'],
    setup: [
      'Default model already at public/models/gaze_redirect.onnx (TinyUNet trained on Columbia + your pairs)',
      'To upgrade: train STED-Gaze (see services/gaze/training/sted/README.md) and replace the file',
    ],
  },
  {
    id: 'nvidia_maxine_cloud',
    label: 'NVIDIA Maxine (cloud, free trial)',
    short: 'SOTA quality via NVIDIA hosted gRPC API — pick on Polish for best result',
    status: 'ready',
    pipelineMode: 'off',  // server-side only; live preview falls back to Custom/Auto
    runtime: 'server',
    license: 'NVIDIA Trial Service Terms (deprecation announced)',
    reference: 'https://build.nvidia.com/nvidia/eyecontact/api',
    description: 'Calls NVIDIA\'s hosted Maxine Eye Contact NIM via gRPC at grpc.nvcf.nvidia.com. Same model that ships with NVIDIA Broadcast — the best gaze redirection currently available. Uses an API key configured in NVIDIA_NIM_API_KEY. Marked deprecated in NVIDIA UI — use it while it lasts; sidecar auto-falls-back to WangWilly if the API errors.',
    pros: ['SOTA quality (NVIDIA Broadcast model)', 'Cloud — no local GPU needed', 'Auto-fallback to WangWilly if API down'],
    cons: ['Marked for deprecation by NVIDIA', 'Requires API key in env', 'Per-call cost after free trial'],
    setup: [
      'Get an API key at https://build.nvidia.com/nvidia/eyecontact (free NVIDIA developer account)',
      'Set NVIDIA_NIM_API_KEY in .env',
      'docker compose up -d --build gaze',
      'Pick "NVIDIA Maxine" as the polish backend in the Record tab',
    ],
  },
  {
    id: 'nvidia_maxine_local',
    label: 'NVIDIA Maxine (self-hosted, NVIDIA GPU)',
    short: 'Run Maxine SDK on your own NVIDIA box — survives cloud deprecation',
    status: 'ready',
    pipelineMode: 'off',
    runtime: 'server',
    license: 'NVIDIA Maxine SDK EULA (dev/personal use free)',
    reference: 'https://developer.nvidia.com/maxine',
    description: 'Download the Maxine SDK to a machine with an NVIDIA GPU (RTX 20-series or newer) and run inference locally. Survives the NVIDIA hosted-API deprecation but requires owning or renting an NVIDIA box and exposing a tunnel back to our sidecar. See services/gaze/training/HARDWARE_DECISION.md for cost/benefit.',
    pros: ['Same SOTA model as cloud, locally hosted', 'Survives deprecation of the hosted API', 'No per-call cost'],
    cons: ['Hard requirement: NVIDIA RTX 20-series+', 'NGC account + ~24h SDK approval', 'Network tunnel from sidecar to GPU box', 'Operational overhead'],
    setup: [
      'Sign up at https://developer.nvidia.com/maxine and accept Maxine SDK EULA',
      'Provision an NVIDIA GPU box (Vast.ai RTX 4090 ~$0.30/hr on-demand, or a dedicated RTX 3060+ for permanent hosting)',
      'Install Maxine SDK Eye Contact module',
      'Wrap the SDK in a Flask /correct endpoint',
      'Expose via Cloudflare Tunnel / ngrok and set MAXINE_LOCAL_URL in our sidecar env',
    ],
  },
  {
    id: 'landmark',
    label: 'Landmark (built-in)',
    short: 'MediaPipe FaceMesh iris translation',
    status: 'ready',
    pipelineMode: 'landmark',
    runtime: 'browser',
    license: 'Apache-2.0 (MediaPipe)',
    reference: 'https://developers.google.com/mediapipe/solutions/vision/face_landmarker',
    description: 'Detects iris position with MediaPipe FaceLandmarker (478 points incl. iris ring), then applies a soft 2-D translation of a small ROI per eye toward the eye center. Subtle effect — translation only, no real warping. Kept available for users who want a softer alternative to Custom mode.',
    pros: ['Works today, no extra files', 'Real-time at 30 fps in-browser', 'Subtler than Custom mode'],
    cons: ['Visible effect can be near zero — translation only, no learned warp'],
    setup: ['Already configured. Pick the strength you want.'],
  },
  {
    id: 'self_trained',
    label: 'Self-trained TinyUNet (your data)',
    short: 'Same browser ONNX path, currently using your trained TinyUNet',
    status: 'ready',
    pipelineMode: 'onnx',
    runtime: 'browser',
    license: 'MIT (this project)',
    reference: 'services/gaze/training/README.md',
    description: 'A 2 MB encoder-decoder trained on 5,707 paired captures (107 yours + 5,600 Columbia synthesized). Runs via the same Browser ONNX path. Visible warp is near-identity due to small model + L1 loss + limited data. Replace with a STED-Gaze ONNX after a Vast.ai weekend training run for SOTA quality.',
    pros: ['Identity-personalized (trained on YOUR face)', 'Tiny (~2 MB) → fast in-browser inference', 'Already installed at public/models/gaze_redirect.onnx'],
    cons: ['Near-identity warp due to architecture limits', 'Won\'t generalize to other faces'],
    setup: [
      'Already installed. To improve: collect more pairs + retrain (services/gaze/training/README.md), or train STED-Gaze (services/gaze/training/sted/README.md)',
    ],
  },
  {
    id: 'gAIze',
    label: 'jatolentino/gAIze',
    short: 'PyTorch eye-warp model — fork-only, no public weights',
    status: 'future',
    pipelineMode: 'off',
    runtime: 'server',
    license: 'See repo',
    reference: 'https://github.com/jatolentino/gAIze',
    description: 'PyTorch implementation of an eye-warping gaze-redirection network. Same integration pattern as the WangWilly sidecar — would expose /correct over HTTP. Listed for completeness; no public weights ship.',
    pros: ['PyTorch is easier to ONNX-export than TF1.8', 'Active research repo'],
    cons: ['No public weights — would need to train yourself', 'Less actionable than STED-Gaze'],
    setup: [
      'Clone the repo + train, OR find a published checkpoint',
      'Export to ONNX (torch.onnx.export) at 64×64 eye-ROI input',
      'Drop the .onnx file at public/models/gaze_redirect.onnx',
      'Switch this Record tab to the "Browser ONNX (drop-in)" mode',
    ],
  },
  {
    id: 'eth_xgaze',
    label: 'ETH-XGaze (estimation only)',
    short: 'Gaze direction estimation, NOT redirection',
    status: 'future',
    pipelineMode: 'off',
    runtime: 'server',
    license: 'CC-BY-NC',
    reference: 'https://github.com/xucong-zhang/ETH-XGaze',
    description: 'Estimates gaze yaw/pitch from a face crop. Useful as ANALYTICS — combine with a redirection model to know how much warping to apply per frame, or to score how often you looked away during a take. Does not redirect on its own.',
    pros: ['Highly accurate on cross-dataset benchmarks', 'Pre-trained checkpoint available'],
    cons: ['Does NOT redirect gaze — only measures it', 'Non-commercial license'],
    setup: [
      'Used as a complementary analytics input, not a primary mode',
      'Convert the published Caffe/PyTorch model to ONNX',
      'Wire to a separate /api/gaze/estimate endpoint',
    ],
  },
  {
    id: 'antoinelame_gazetracking',
    label: 'antoinelame/GazeTracking (estimation)',
    short: 'OpenCV + dlib gaze ratio detector',
    status: 'future',
    pipelineMode: 'off',
    runtime: 'server',
    license: 'MIT',
    reference: 'https://github.com/antoinelame/GazeTracking',
    description: 'Reports pupil position and a left/right/center ratio. Like ETH-XGaze, this is estimation — useful for "you looked away N times" feedback during practice but cannot warp the eye.',
    pros: ['MIT license', 'Lightweight Python — runs CPU-only at full 30 fps'],
    cons: ['Estimation only, no redirection', 'Python + dlib — ~150 MB Docker image'],
    setup: [
      'Add as a sidecar or local script if "gaze analytics" UI is needed later',
      'Frontend overlay shows live "looking: center / 0.52 ratio" badge for practice',
    ],
  },
  {
    id: 'sted',
    label: 'STED-Gaze (pretrained, server)',
    short: 'SOTA gaze redirection — authors\' pretrained weights, ONNX-exported, server-side',
    status: 'ready',
    pipelineMode: 'onnx',
    runtime: 'server',
    license: 'STED-Gaze research license (non-commercial)',
    reference: 'https://github.com/zhengyuf/STED-gaze',
    description: 'Self-Transforming Encoder-Decoder for gaze redirection (zhengyuf, NeurIPS 2020). Disentangles gaze from head pose so it works at any angle (unlike WangWilly which is head-pose 0 only). Uses the authors\' pretrained weights (trained on MPIIGaze + GazeCapture + Columbia + EYEDIAP), exported to ONNX on a rented Vast.ai RTX 3090. ~155 MB total (0.5 MB graph + 154 MB external weights). Server-side only (too large for browser). Input: 128×128 face crop + target gaze (B,2) + target head pose (B,2).',
    pros: ['SOTA quality — authors\' weights, paper-validated', 'Handles all head poses (vs WangWilly head-pose 0 only)', 'No training needed — pretrained model already deployed'],
    cons: ['Server-side only (~155 MB ONNX too large for browser)', 'Research license — non-commercial use only', 'Requires per-frame gaze + head-pose estimation upstream to drive the redirection target'],
    setup: [
      'Already deployed at services/gaze/checkpoints/sted_gaze.onnx (+ .data sidecar)',
      'Sidecar /correct?backend=sted_onnx — see services/gaze/app.py:load_sted_model',
      'Export script preserved at services/gaze/training/sted/export_sted_onnx.py if a re-export is needed',
    ],
  },
]

export function getModel(id: string): GazeModel | undefined {
  return GAZE_MODELS.find((m) => m.id === id)
}
