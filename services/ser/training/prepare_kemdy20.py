"""
KEMDy20 v1.1 데이터셋 → SER 학습 manifest.

압축 해제 후 (annotation/, wav/ 가 루트에 있어야 함):

  python prepare_kemdy20.py \\
    --kemdy-root /Users/juhong/Documents/KEMDy20_v1_1 \\
    --output-dir ./data/kemdy20_hf

출력: manifest.jsonl (path, label, label_id) — finetune_kesdy18.py 와 동일 형식
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

import soundfile as sf

# finetune_kesdy18.py / 앱 매핑과 동일 4-class
KEMDY4 = {
    "angry": 0,
    "neutral": 1,
    "sad": 2,
    "happy": 3,
}

SESSION_RE = re.compile(r"^Sess(\d+)_", re.IGNORECASE)


def session_dir_from_segment(segment_id: str) -> str | None:
    m = SESSION_RE.match(segment_id.strip())
    if not m:
        return None
    return f"Session{int(m.group(1)):02d}"


def normalize_emotion(raw: str) -> str | None:
    """Total Evaluation Emotion → angry|neutral|sad|happy."""
    if not raw or not raw.strip():
        return None

    tokens = [t.strip().lower() for t in raw.split(";") if t.strip()]
    mapped: list[str] = []
    for t in tokens:
        if "angry" in t:
            mapped.append("angry")
        elif "sad" in t:
            mapped.append("sad")
        elif "happy" in t:
            mapped.append("happy")
        elif "neutral" in t:
            mapped.append("neutral")
        elif "surprise" in t:
            mapped.append("happy")
        elif "disqust" in t or "disgust" in t:
            mapped.append("angry")
        elif "fear" in t:
            mapped.append("angry")

    if not mapped:
        return None

    non_neutral = [m for m in mapped if m != "neutral"]
    return non_neutral[0] if non_neutral else "neutral"


def wav_path_for_segment(kemdy_root: Path, segment_id: str) -> Path | None:
    session = session_dir_from_segment(segment_id)
    if not session:
        return None
    path = kemdy_root / "wav" / session / f"{segment_id.strip()}.wav"
    return path if path.is_file() else None


def iter_eval_rows(kemdy_root: Path):
    ann_dir = kemdy_root / "annotation"
    if not ann_dir.is_dir():
        raise FileNotFoundError(f"annotation/ 없음: {ann_dir}")

    for csv_path in sorted(ann_dir.glob("Sess*_eval.csv")):
        with csv_path.open(encoding="utf-8-sig", newline="") as f:
            reader = csv.reader(f)
            next(reader, None)  # header row 1
            next(reader, None)  # sub-header row 2
            for row in reader:
                if len(row) < 5:
                    continue
                segment_id = row[3].strip()
                emotion_raw = row[4].strip()
                if not segment_id:
                    continue
                yield segment_id, emotion_raw, csv_path.name


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kemdy-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("data/kemdy20_hf"))
    parser.add_argument("--max-sec", type=float, default=30.0, help="너무 긴 클립 제외")
    args = parser.parse_args()

    kemdy_root = args.kemdy_root.resolve()
    rows: list[dict] = []
    skipped_no_wav = 0
    skipped_label = 0
    skipped_duration = 0
    seen_segments: set[str] = set()

    for segment_id, emotion_raw, source in iter_eval_rows(kemdy_root):
        if segment_id in seen_segments:
            continue
        seen_segments.add(segment_id)

        label = normalize_emotion(emotion_raw)
        if not label:
            skipped_label += 1
            continue

        wav = wav_path_for_segment(kemdy_root, segment_id)
        if not wav:
            skipped_no_wav += 1
            continue

        info = sf.info(str(wav))
        if info.duration > args.max_sec:
            skipped_duration += 1
            continue

        rows.append(
            {
                "path": str(wav),
                "label": label,
                "label_id": KEMDY4[label],
                "duration_sec": round(info.duration, 3),
                "sample_rate": info.samplerate,
                "segment_id": segment_id,
                "emotion_raw": emotion_raw,
                "source_csv": source,
            }
        )

    args.output_dir.mkdir(parents=True, exist_ok=True)
    manifest = args.output_dir / "manifest.jsonl"
    with manifest.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    label_counts: dict[str, int] = {k: 0 for k in KEMDY4}
    for row in rows:
        label_counts[row["label"]] += 1

    meta = {
        "dataset": "KEMDy20_v1_1",
        "total": len(rows),
        "skipped_no_wav": skipped_no_wav,
        "skipped_label": skipped_label,
        "skipped_duration": skipped_duration,
        "labels": KEMDY4,
        "label_counts": label_counts,
        "kemdy_root": str(kemdy_root),
    }
    (args.output_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps(meta, indent=2, ensure_ascii=False))
    print(f"Wrote {len(rows)} rows → {manifest}")


if __name__ == "__main__":
    main()
