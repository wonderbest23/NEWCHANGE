"""
KESDy18 LoRA 파인튜닝 (emotion2vec+ base 위 한국어 4-class).

사전 준비:
  1. prepare_kesdy18.py 로 manifest 생성
  2. pip install -r requirements-training.txt

학습:
  python finetune_kesdy18.py \\
    --manifest data/kesdy18_hf/manifest.jsonl \\
    --output-dir checkpoints/kesdy-emotion2vec-lora \\
    --epochs 5

배포:
  SER_MODEL_ID=/path/to/checkpoints/kesdy-emotion2vec-lora
  SER_MODEL_HUB=hf
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from torch.utils.data import DataLoader, Dataset


KESDY_LABELS = ["angry", "neutral", "sad", "happy"]


class KesdyManifestDataset(Dataset):
    def __init__(self, rows: list[dict], max_sec: float = 8.0) -> None:
        self.rows = rows
        self.max_samples = int(16000 * max_sec)

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int) -> dict:
        row = self.rows[idx]
        audio, sr = sf.read(row["path"], dtype="float32")
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        if sr != 16000:
            import torchaudio

            audio = torchaudio.functional.resample(
                torch.from_numpy(audio).unsqueeze(0), sr, 16000
            ).squeeze(0).numpy()
        if len(audio) > self.max_samples:
            start = random.randint(0, len(audio) - self.max_samples)
            audio = audio[start : start + self.max_samples]
        return {
            "audio": audio,
            "label_id": int(row["label_id"]),
            "label": row["label"],
        }


def load_manifest(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            rows.append(json.loads(line))
    return rows


def collate_batch(batch: list[dict]) -> dict:
    max_len = max(len(b["audio"]) for b in batch)
    padded = np.zeros((len(batch), max_len), dtype=np.float32)
    for i, b in enumerate(batch):
        padded[i, : len(b["audio"])] = b["audio"]
    return {
        "input_values": torch.from_numpy(padded),
        "labels": torch.tensor([b["label_id"] for b in batch], dtype=torch.long),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("checkpoints/kesdy-emotion2vec-lora"))
    parser.add_argument("--base-model", default="facebook/wav2vec2-large-xlsr-53")
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--lr", type=float, default=3e-5)
    parser.add_argument("--val-ratio", type=float, default=0.15)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--method",
        default="emotion2vec_plus_kemdy_v1",
        help="체크포인트 meta method (KEMDy20: emotion2vec_plus_kemdy_v1)",
    )
    args = parser.parse_args()

    random.seed(args.seed)
    torch.manual_seed(args.seed)

    rows = load_manifest(args.manifest)
    random.shuffle(rows)
    split = int(len(rows) * (1 - args.val_ratio))
    train_rows, val_rows = rows[:split], rows[split:]

    from transformers import AutoConfig, AutoModelForAudioClassification, Wav2Vec2Processor

    processor = Wav2Vec2Processor.from_pretrained(args.base_model)
    config = AutoConfig.from_pretrained(
        args.base_model,
        num_labels=len(KESDY_LABELS),
        label2id={k: i for i, k in enumerate(KESDY_LABELS)},
        id2label={i: k for i, k in enumerate(KESDY_LABELS)},
    )
    model = AutoModelForAudioClassification.from_pretrained(args.base_model, config=config)

    # frozen CNN feature extractor (논문·실무 robust fine-tune 패턴)
    model.freeze_feature_encoder()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)

    train_loader = DataLoader(
        KesdyManifestDataset(train_rows),
        batch_size=args.batch_size,
        shuffle=True,
        collate_fn=collate_batch,
    )
    val_loader = DataLoader(
        KesdyManifestDataset(val_rows),
        batch_size=args.batch_size,
        shuffle=False,
        collate_fn=collate_batch,
    )

    optim = torch.optim.AdamW(model.parameters(), lr=args.lr)
    best_acc = 0.0
    args.output_dir.mkdir(parents=True, exist_ok=True)

    for epoch in range(args.epochs):
        model.train()
        train_loss = 0.0
        for batch in train_loader:
            inputs = processor(
                batch["input_values"].numpy(),
                sampling_rate=16000,
                return_tensors="pt",
                padding=True,
            )
            inputs = {k: v.to(device) for k, v in inputs.items()}
            labels = batch["labels"].to(device)
            out = model(**inputs, labels=labels)
            loss = out.loss
            optim.zero_grad()
            loss.backward()
            optim.step()
            train_loss += float(loss.item())

        model.eval()
        correct = total = 0
        with torch.no_grad():
            for batch in val_loader:
                inputs = processor(
                    batch["input_values"].numpy(),
                    sampling_rate=16000,
                    return_tensors="pt",
                    padding=True,
                )
                inputs = {k: v.to(device) for k, v in inputs.items()}
                logits = model(**inputs).logits
                preds = logits.argmax(dim=-1)
                correct += (preds.cpu() == batch["labels"]).sum().item()
                total += batch["labels"].numel()

        acc = correct / max(total, 1)
        print(f"epoch {epoch + 1}/{args.epochs} loss={train_loss / max(len(train_loader), 1):.4f} val_acc={acc:.4f}")

        if acc >= best_acc:
            best_acc = acc
            model.save_pretrained(args.output_dir)
            processor.save_pretrained(args.output_dir)
            (args.output_dir / "kesdy_meta.json").write_text(
                json.dumps(
                    {
                        "method": args.method,
                        "base_model": args.base_model,
                        "labels": KESDY_LABELS,
                        "val_accuracy": acc,
                        "train_size": len(train_rows),
                        "val_size": len(val_rows),
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )

    print(f"Best val_acc={best_acc:.4f} saved to {args.output_dir}")


if __name__ == "__main__":
    main()
