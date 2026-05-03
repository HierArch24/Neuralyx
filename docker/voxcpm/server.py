#!/usr/bin/env python3
"""VoxCPM Voice Clone Server — XTTS-v2 zero-shot voice cloning."""
import os, io, json, base64, logging, tempfile, threading
from http.server import BaseHTTPRequestHandler, HTTPServer

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("voxcpm")

_model = None
_model_error = None
_loading = True

def load_model():
    global _model, _model_error, _loading
    try:
        import os as _os
        _os.environ["COQUI_TOS_AGREED"] = "1"  # non-commercial CPML
        _os.environ.setdefault("TTS_HOME", "/app/tts_models")
        from TTS.api import TTS
        log.info("Loading XTTS-v2 model (downloads ~1.8GB on first run)…")
        _model = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
        _model.to("cpu")
        log.info("VoxCPM (XTTS-v2) ready · device=cpu")
    except Exception as e:
        _model_error = str(e)
        log.error(f"Model load failed: {e}")
    finally:
        _loading = False

threading.Thread(target=load_model, daemon=True).start()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        log.info(fmt % args)

    def send_json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            status = "loading" if _loading else ("error" if _model_error else "ok")
            self.send_json(200, {
                "status": status,
                "model_loaded": _model is not None,
                "engine": "xtts-v2",
                "device": "cpu",
                "error": _model_error,
            })
        else:
            self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/synthesize":
            self.send_json(404, {"error": "Not found"})
            return

        if _loading:
            self.send_json(503, {"ok": False, "error": "model_loading", "retryAfter": 15})
            return
        if _model is None:
            self.send_json(503, {"ok": False, "error": _model_error or "Model unavailable"})
            return

        length = int(self.headers.get("Content-Length", 0))
        try:
            req = json.loads(self.rfile.read(length))
        except Exception:
            self.send_json(400, {"ok": False, "error": "Invalid JSON"})
            return

        text = req.get("text", "").strip()
        ref_b64 = req.get("reference_b64", "")
        ref_fmt = req.get("reference_format", "wav")

        if not text or not ref_b64:
            self.send_json(400, {"ok": False, "error": "Missing text or reference_b64"})
            return

        try:
            ref_bytes = base64.b64decode(ref_b64)
            with tempfile.NamedTemporaryFile(suffix=f".{ref_fmt}", delete=False) as f:
                f.write(ref_bytes)
                ref_path = f.name

            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as out:
                out_path = out.name

            _model.tts_to_file(
                text=text,
                speaker_wav=ref_path,
                language="en",
                file_path=out_path,
            )

            os.unlink(ref_path)

            with open(out_path, "rb") as f:
                audio_b64 = base64.b64encode(f.read()).decode()
            os.unlink(out_path)

            self.send_json(200, {"ok": True, "audio_b64": audio_b64, "format": "wav"})

        except Exception as e:
            log.error(f"Synthesis error: {e}")
            self.send_json(500, {"ok": False, "error": str(e)})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7861))
    server = HTTPServer(("0.0.0.0", port), Handler)
    log.info(f"VoxCPM server listening on :{port}")
    server.serve_forever()
