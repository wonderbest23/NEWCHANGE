"""
KEMDy20 파인튜닝 — Modal GPU (Mac 꺼도 학습 계속)

사전 준비 (최초 1회):
  pip install modal
  modal setup
  modal volume create gyeot-kemdy20

  # 데이터 업로드 (~2GB, 10~30분)
  modal volume put gyeot-kemdy20 \\
    /Users/juhong/Documents/KEMDy20_v1_1 \\
    KEMDy20_v1_1

  # Hugging Face 업로드용 (선택)
  modal secret create huggingface HF_TOKEN=hf_xxxx

실행:
  cd services/ser/training
  modal run modal_train.py              # manifest + 학습
  modal run modal_train.py --prepare-only
  modal run modal_train.py --train-only
  modal run --detach modal_train.py

  # Hugging Face 업로드 (학습 완료 후, HF secret 필요)
  modal secret create huggingface HF_TOKEN=hf_xxxx
  modal run modal_push_hf.py --repo-id yourname/kemdy20-ser-wav2vec2

학습 후 SER API 배포 (../modal_app.py):
  modal secret create gyeot-ser-env \\
    SER_ENGINE=wav2vec2 \\
    SER_MODEL_ID=yourname/kemdy20-ser-wav2vec2 \\
    SER_KESDY=true \\
    SER_API_KEY=기존키

  cd ../ && modal deploy modal_app.py
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import modal

VOLUME_NAME = "gyeot-kemdy20"
DATA_MOUNT = "/vol/kemdy20"
KEMDY_ROOT = f"{DATA_MOUNT}/KEMDy20_v1_1"
MANIFEST_DIR = f"{DATA_MOUNT}/manifest"
CHECKPOINT_DIR = f"{DATA_MOUNT}/checkpoints/kemdy20-wav2vec-lora"

app = modal.App("gyeot-kemdy20-train")
volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)

training_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install(
        "torch>=2.2.0",
        "torchaudio>=2.2.0",
        "transformers>=4.40.0",
        "soundfile>=0.12.1",
        "numpy>=1.26.0",
        "accelerate>=0.30.0",
        "huggingface_hub>=0.23.0",
    )
    .add_local_file(
        Path(__file__).parent / "prepare_kemdy20.py",
        "/root/training/prepare_kemdy20.py",
    )
    .add_local_file(
        Path(__file__).parent / "finetune_kesdy18.py",
        "/root/training/finetune_kesdy18.py",
    )
)

# status 전용 — torch 없이 즉시 실행 (첫 modal run 대기 시간 단축)
light_image = modal.Image.debian_slim(python_version="3.11")


def _run(cmd: list[str]) -> None:
    print("$", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)


@app.function(
    image=training_image,
    volumes={DATA_MOUNT: volume},
    timeout=60 * 30,
)
def prepare_manifest() -> dict:
    """Volume에 올린 KEMDy20 → manifest.jsonl 생성."""
    kemdy = Path(KEMDY_ROOT)
    if not (kemdy / "wav").is_dir():
        raise FileNotFoundError(
            f"{KEMDY_ROOT}/wav 없음. 먼저:\n"
            f"  modal volume put {VOLUME_NAME} /Users/juhong/Documents/KEMDy20_v1_1 KEMDy20_v1_1"
        )

    out = Path(MANIFEST_DIR)
    out.mkdir(parents=True, exist_ok=True)

    _run(
        [
            sys.executable,
            "/root/training/prepare_kemdy20.py",
            "--kemdy-root",
            str(kemdy),
            "--output-dir",
            str(out),
        ]
    )

    meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))
    volume.commit()
    return meta


@app.function(
    image=training_image,
    gpu="T4",
    volumes={DATA_MOUNT: volume},
    timeout=60 * 60 * 6,
)
def train_model(
    epochs: int = 5,
    batch_size: int = 8,
    lr: float = 3e-5,
) -> dict:
    """manifest → wav2vec2 4-class 파인튜닝."""
    manifest = Path(MANIFEST_DIR) / "manifest.jsonl"
    if not manifest.is_file():
        raise FileNotFoundError(
            f"{manifest} 없음. 먼저: modal run modal_train.py --prepare-only"
        )

    out = Path(CHECKPOINT_DIR)
    out.mkdir(parents=True, exist_ok=True)

    _run(
        [
            sys.executable,
            "/root/training/finetune_kesdy18.py",
            "--manifest",
            str(manifest),
            "--output-dir",
            str(out),
            "--method",
            "emotion2vec_plus_kemdy_v1",
            "--epochs",
            str(epochs),
            "--batch-size",
            str(batch_size),
            "--lr",
            str(lr),
        ]
    )

    meta_path = out / "kesdy_meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.is_file() else {}
    volume.commit()
    return {
        "checkpoint_dir": str(out),
        "val_accuracy": meta.get("val_accuracy"),
        "train_size": meta.get("train_size"),
        "val_size": meta.get("val_size"),
    }


@app.function(
    image=light_image,
    volumes={DATA_MOUNT: volume},
    timeout=60 * 5,
)
def status() -> dict:
    """Volume 상태 확인."""
    kemdy = Path(KEMDY_ROOT)
    manifest = Path(MANIFEST_DIR) / "manifest.jsonl"
    ckpt = Path(CHECKPOINT_DIR)

    wav_count = len(list((kemdy / "wav").rglob("*.wav"))) if (kemdy / "wav").is_dir() else 0
    manifest_lines = 0
    if manifest.is_file():
        manifest_lines = sum(1 for _ in manifest.open(encoding="utf-8"))

    return {
        "kemdy_root_exists": kemdy.is_dir(),
        "wav_files": wav_count,
        "manifest_rows": manifest_lines,
        "checkpoint_exists": (ckpt / "config.json").is_file(),
        "checkpoint_dir": str(ckpt),
    }


@app.local_entrypoint()
def main(
    prepare_only: bool = False,
    train_only: bool = False,
    epochs: int = 5,
    batch_size: int = 8,
):
    if not train_only:
        print("=== 1/3 manifest 준비 ===")
        meta = prepare_manifest.remote()
        print(json.dumps(meta, indent=2, ensure_ascii=False))

    if prepare_only:
        print("prepare-only 완료.")
        return

    print("=== 2/3 GPU 학습 (Mac 꺼도 됨 — Modal 대시보드에서 진행률 확인) ===")
    result = train_model.remote(epochs=epochs, batch_size=batch_size)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print(
        "\n학습 완료. HF 업로드:\n"
        "  modal secret create huggingface HF_TOKEN=hf_xxxx\n"
        "  modal run modal_push_hf.py --repo-id yourname/kemdy20-ser-wav2vec2"
    )
