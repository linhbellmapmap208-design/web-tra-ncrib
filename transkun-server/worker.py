"""Transkun V2 worker driven by the Next.js app over stdin/stdout (one JSON object per line)."""

import json
import os
import subprocess
import sys
import time
from importlib import resources

protocol = sys.stdout
sys.stdout = sys.stderr


def send(message):
    protocol.write(json.dumps(message) + "\n")
    protocol.flush()


try:
    import imageio_ffmpeg
    import moduleconf
    import numpy as np
    import torch
    from transkun.Data import writeMidi

    MAX_DURATION_SECONDS = float(os.environ.get("MAX_DURATION_SECONDS", "900"))
    DEVICE = os.environ.get("TRANSKUN_DEVICE") or ("cuda" if torch.cuda.is_available() else "cpu")

    torch.set_grad_enabled(False)
    if DEVICE == "cpu":
        torch.set_num_threads(max(1, os.cpu_count() or 1))

    pretrained = resources.files("transkun") / "pretrained"
    conf_manager = moduleconf.parseFromFile(str(pretrained / "2.0.conf"))
    checkpoint = torch.load(str(pretrained / "2.0.pt"), map_location=DEVICE)
    MODEL = conf_manager["Model"].module.TransKun(conf=conf_manager["Model"].config).to(DEVICE)
    MODEL.load_state_dict(checkpoint.get("best_state_dict", checkpoint.get("state_dict")), strict=False)
    MODEL.eval()
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception as exc:  # noqa: BLE001
    send({"type": "fatal", "error": f"Không nạp được Transkun: {exc}"})
    sys.exit(1)


def decode_audio(path):
    result = subprocess.run(
        [FFMPEG, "-nostdin", "-v", "error", "-i", path, "-t", str(MAX_DURATION_SECONDS),
         "-f", "f32le", "-acodec", "pcm_f32le", "-ac", "2", "-ar", str(MODEL.fs), "pipe:1"],
        capture_output=True,
        check=False,
    )
    if result.returncode != 0 or not result.stdout:
        raise ValueError("Không thể giải mã file âm thanh.")
    return np.frombuffer(result.stdout, dtype=np.float32).reshape(-1, 2).copy()


send({"type": "ready", "model": "transkun-2.0", "device": DEVICE})

for line in sys.stdin:
    if not line.strip():
        continue
    job = json.loads(line)
    try:
        audio = decode_audio(job["input"])
        started = time.perf_counter()
        notes = MODEL.transcribe(torch.from_numpy(audio).to(DEVICE), discardSecondHalf=False)
        writeMidi(notes).write(job["output"])
        send({"type": "result", "id": job["id"], "seconds": time.perf_counter() - started})
    except Exception as exc:  # noqa: BLE001
        send({"type": "result", "id": job["id"], "error": str(exc)})
