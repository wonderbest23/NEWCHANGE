"""
Modal GPU 배포 — SER inference API

  pip install modal
  modal deploy modal_app.py

기본 (emotion2vec+):
  SER_MODEL_ID=iic/emotion2vec_plus_base

KEMDy20 파인튜닝 모델 (modal_train.py 학습 후):
  modal secret create gyeot-ser-env \\
    SER_ENGINE=wav2vec2 \\
    SER_MODEL_ID=yourname/kemdy20-ser-wav2vec2 \\
    SER_KESDY=true \\
    SER_API_KEY=your-key

배포 후 SER_API_URL=https://<workspace>--gyeot-voice-ser-ser-api.modal.run
"""

from __future__ import annotations

import modal

app = modal.App("gyeot-voice-ser")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install(
        "fastapi[standard]==0.115.6",
        "funasr>=1.1.6",
        "modelscope>=1.17.0",
        "transformers>=4.40.0",
        "torch>=2.2.0",
        "torchaudio>=2.2.0",
        "soundfile>=0.12.1",
        "numpy>=1.26.0",
    )
    .add_local_dir(".", remote_path="/root/ser")
)


@app.function(
    gpu="T4",
    image=image,
    timeout=180,
    scaledown_window=300,
)
@modal.asgi_app()
def ser_api():
    import sys

    sys.path.insert(0, "/root/ser")
    from local_app import app as fastapi_app

    return fastapi_app
