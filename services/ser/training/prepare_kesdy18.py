"""
KESDy18 데이터셋 준비.

ETRI KESDy18 다운로드·압축 해제 후:

  python prepare_kesdy18.py \\
    --kesdy-root /path/to/KESDy18 \\
    --output-dir ./data/kesdy18_hf

출력: HuggingFace datasets 형식 (audio + label)
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import soundfile as sf


KESDY4 = {
    "angry": 0,
    "neutral": 1,
    "sad": 2,
    "happy": 3,
}


def find_wavs(root: Path) -> list[Path]:
    return sorted(root.rglob("*.wav"))


def infer_label_from_path(path: Path) -> str | None:
    name = path.stem.lower()
    for lab in KESDY4:
        if lab in name:
            return lab
    parts = [p.lower() for p in path.parts]
    for lab in KESDY4:
        if lab in parts:
            return lab
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kesdy-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("data/kesdy18_hf"))
    args = parser.parse_args()

    rows: list[dict] = []
    skipped = 0
    for wav in find_wavs(args.kesdy_root):
        label = infer_label_from_path(wav)
        if not label:
            skipped += 1
            continue
        info = sf.info(str(wav))
        rows.append(
            {
                "path": str(wav.resolve()),
                "label": label,
                "label_id": KESDY4[label],
                "duration_sec": round(info.duration, 3),
                "sample_rate": info.samplerate,
            }
        )

    args.output_dir.mkdir(parents=True, exist_ok=True)
    manifest = args.output_dir / "manifest.jsonl"
    with manifest.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    meta = {
        "total": len(rows),
        "skipped": skipped,
        "labels": KESDY4,
    }
    (args.output_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Wrote {len(rows)} rows → {manifest} (skipped {skipped})")


if __name__ == "__main__":
    main()
