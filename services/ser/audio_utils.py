"""오디오 → 16kHz mono WAV 변환 (SER 모델 입력)."""

from __future__ import annotations

import os
import subprocess
import tempfile


def mime_to_suffix(mime: str) -> str:
    m = (mime or "").lower()
    if "wav" in m:
        return ".wav"
    if "ogg" in m:
        return ".ogg"
    if "mp4" in m or "m4a" in m:
        return ".m4a"
    return ".webm"


def to_wav_16k_mono(audio_bytes: bytes, mime: str = "audio/webm") -> bytes:
    suffix = mime_to_suffix(mime)
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as inp:
        inp.write(audio_bytes)
        inp_path = inp.name

    out_path = f"{inp_path}.wav"
    try:
        proc = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                inp_path,
                "-ar",
                "16000",
                "-ac",
                "1",
                "-f",
                "wav",
                out_path,
            ],
            check=False,
            capture_output=True,
        )
        if proc.returncode != 0:
            err = proc.stderr.decode("utf-8", errors="replace")[:400]
            raise RuntimeError(f"ffmpeg failed: {err}")
        with open(out_path, "rb") as f:
            return f.read()
    finally:
        if os.path.exists(inp_path):
            os.unlink(inp_path)
        if os.path.exists(out_path):
            os.unlink(out_path)
