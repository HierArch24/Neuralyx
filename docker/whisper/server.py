import os
import tempfile
import logging
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("whisper")

MODEL_NAME = os.getenv("WHISPER_MODEL", "large-v3-turbo")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
CACHE = os.getenv("WHISPER_CACHE", "/app/models")
PORT = int(os.getenv("PORT", "7870"))

os.makedirs(CACHE, exist_ok=True)

app = FastAPI(title="NEURALYX faster-whisper")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODELS: dict[str, WhisperModel] = {}

def get_model(name: str) -> WhisperModel:
    if name not in MODELS:
        log.info("Loading model %s (device=%s compute=%s)", name, DEVICE, COMPUTE_TYPE)
        MODELS[name] = WhisperModel(name, device=DEVICE, compute_type=COMPUTE_TYPE, download_root=CACHE)
        log.info("Model %s ready", name)
    return MODELS[name]

@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_NAME, "device": DEVICE, "compute_type": COMPUTE_TYPE, "loaded": list(MODELS.keys())}

@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    model: Optional[str] = Form(None),
    language: Optional[str] = Form("en"),
    prompt: Optional[str] = Form(None),
    vad: Optional[str] = Form("true"),
):
    selected = model or MODEL_NAME
    try:
        m = get_model(selected)
    except Exception as e:
        log.exception("Model load failed")
        raise HTTPException(status_code=500, detail=f"Model load failed: {e}")

    suffix = os.path.splitext(file.filename or "")[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        content = await file.read()
        if len(content) < 500:
            raise HTTPException(status_code=400, detail=f"Audio too short ({len(content)} bytes)")
        tmp.write(content)
        tmp_path = tmp.name

    try:
        use_vad = (str(vad).lower() in ("1", "true", "yes"))
        lang = None if (language and language.lower() == "auto") else language
        segments, info = m.transcribe(
            tmp_path,
            language=lang,
            vad_filter=use_vad,
            vad_parameters={"min_silence_duration_ms": 500} if use_vad else None,
            initial_prompt=prompt,
            beam_size=5,
            condition_on_previous_text=False,
        )
        segs = []
        full_parts = []
        for s in segments:
            full_parts.append(s.text)
            segs.append({"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()})
        text = "".join(full_parts).strip()
        return JSONResponse({
            "text": text,
            "language": info.language,
            "language_probability": round(info.language_probability, 3),
            "duration": round(info.duration, 2),
            "model": selected,
            "segments": segs,
        })
    except Exception as e:
        log.exception("Transcribe failed")
        raise HTTPException(status_code=500, detail=f"Transcribe failed: {e}")
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

if __name__ == "__main__":
    log.info("Starting whisper on port %d, default model=%s", PORT, MODEL_NAME)
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
