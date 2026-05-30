"""
학습된 체크포인트 → Hugging Face Hub 업로드 (학습 완료 후 별도 실행).

  modal secret create huggingface HF_TOKEN=hf_xxxx
  modal run modal_push_hf.py --repo-id yourname/kemdy20-ser-wav2vec2
"""

from __future__ import annotations

from pathlib import Path

import modal

VOLUME_NAME = "gyeot-kemdy20"
DATA_MOUNT = "/vol/kemdy20"
CHECKPOINT_DIR = f"{DATA_MOUNT}/checkpoints/kemdy20-wav2vec-lora"

app = modal.App("gyeot-kemdy20-push-hf")
volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("huggingface_hub>=0.23.0")
)


@app.function(
    image=image,
    volumes={DATA_MOUNT: volume},
    secrets=[modal.Secret.from_name("huggingface")],
    timeout=60 * 60,
)
def push_to_huggingface(repo_id: str) -> str:
    import os

    from huggingface_hub import HfApi

    ckpt = Path(CHECKPOINT_DIR)
    if not (ckpt / "config.json").is_file():
        raise FileNotFoundError(
            f"체크포인트 없음: {ckpt}. 먼저 modal run --detach modal_train.py"
        )

    token = os.environ.get("HF_TOKEN")
    if not token:
        raise RuntimeError("HF_TOKEN 없음. modal secret create huggingface HF_TOKEN=hf_xxxx")

    api = HfApi(token=token)
    api.create_repo(repo_id, exist_ok=True, repo_type="model")
    api.upload_folder(
        folder_path=str(ckpt),
        repo_id=repo_id,
        repo_type="model",
        commit_message="KEMDy20 wav2vec2 fine-tune from gyeot modal_train",
    )
    url = f"https://huggingface.co/{repo_id}"
    print(f"Uploaded → {url}")
    return url


@app.local_entrypoint()
def main(repo_id: str):
    url = push_to_huggingface.remote(repo_id=repo_id)
    print(f"완료: {url}")
    print(
        "\n다음: SER API 배포\n"
        f"  modal secret create gyeot-ser-env SER_ENGINE=wav2vec2 "
        f"SER_MODEL_ID={repo_id} SER_KESDY=true SER_API_KEY=...\n"
        "  cd ../ && modal deploy modal_app.py"
    )
