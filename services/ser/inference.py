"""emotion2vec+ inference + 결과 파싱."""

from __future__ import annotations

import os
import tempfile
from typing import Any

from audio_utils import to_wav_16k_mono

# emotion2vec+ 9-class (FunASR iic/emotion2vec_plus_*)
EMOTION2VEC_LABELS = (
    "angry",
    "disgusted",
    "fearful",
    "happy",
    "neutral",
    "other",
    "sad",
    "surprised",
    "unknown",
)

# 앱 6키 매핑
LABEL_TO_APP = {
    "happy": "joyful",
    "neutral": "calm",
    "sad": "sad",
    "angry": "alert",
    "fearful": "anxious",
    "surprised": "anxious",
    "disgusted": "alert",
    "other": "calm",
    "unknown": "calm",
}

# VAD 근사 (논문·IEMOCAP 계열 valence-arousal 축)
LABEL_VAD = {
    "happy": (0.8, 0.6),
    "neutral": (0.2, 0.1),
    "sad": (-0.7, -0.3),
    "angry": (-0.6, 0.85),
    "fearful": (-0.75, 0.75),
    "surprised": (0.1, 0.8),
    "disgusted": (-0.65, 0.55),
    "other": (0.0, 0.0),
    "unknown": (0.0, 0.0),
}


def _normalize_scores(raw: dict[str, float]) -> dict[str, float]:
    total = sum(max(v, 0.0) for v in raw.values()) or 1.0
    return {k: max(v, 0.0) / total for k, v in raw.items()}


def parse_funasr_result(result: Any) -> dict[str, Any]:
    """FunASR emotion2vec generate() 출력 → 표준 JSON."""
    item = result[0] if isinstance(result, list) and result else result
    if not isinstance(item, dict):
        return {
            "label": "unknown",
            "confidence": 0.0,
            "label_scores": {k: 0.0 for k in EMOTION2VEC_LABELS},
            "app_emotion_key": "calm",
        }

    labels = item.get("labels") or item.get("label")
    scores = item.get("scores") or item.get("score")

    label_scores: dict[str, float] = {}
    if isinstance(labels, list) and isinstance(scores, list):
        for lab, sc in zip(labels, scores):
            label_scores[str(lab).lower()] = float(sc)
    elif isinstance(labels, str):
        label_scores[labels.lower()] = float(scores) if scores is not None else 1.0

    if not label_scores:
        label_scores = {"unknown": 1.0}

    label_scores = _normalize_scores(label_scores)
    top_label = max(label_scores, key=label_scores.get)
    confidence = label_scores[top_label]
    valence, arousal = LABEL_VAD.get(top_label, (0.0, 0.0))

    return {
        "label": top_label,
        "confidence": round(confidence, 4),
        "label_scores": {k: round(label_scores.get(k, 0.0), 4) for k in EMOTION2VEC_LABELS},
        "app_emotion_key": LABEL_TO_APP.get(top_label, "calm"),
        "vad": {"valence": valence, "arousal": arousal},
    }


class SerEngine:
    def __init__(self, model_id: str | None = None) -> None:
        engine = os.environ.get("SER_ENGINE", "funasr").lower()
        mid = model_id or os.environ.get("SER_MODEL_ID", "iic/emotion2vec_plus_large")
        self.model_id = mid
        self.engine = engine

        if engine == "wav2vec2":
            import torch
            from transformers import AutoModelForAudioClassification, Wav2Vec2Processor

            self.processor = Wav2Vec2Processor.from_pretrained(mid)
            self.torch_model = AutoModelForAudioClassification.from_pretrained(mid)
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            self.torch_model.to(self.device)
            self.torch_model.eval()
            self.model = None
        else:
            from funasr import AutoModel

            hub = os.environ.get("SER_MODEL_HUB", "hf")
            self.model = AutoModel(model=mid, hub=hub)
            self.torch_model = None

    def _analyze_wav2vec2(self, wav_bytes: bytes) -> dict[str, Any]:
        import io
        import torch
        import torchaudio

        audio, sr = torchaudio.load(io.BytesIO(wav_bytes))
        if audio.shape[0] > 1:
            audio = audio.mean(dim=0, keepdim=True)
        if sr != 16000:
            audio = torchaudio.functional.resample(audio, sr, 16000)
        inputs = self.processor(
            audio.squeeze(0).numpy(),
            sampling_rate=16000,
            return_tensors="pt",
            padding=True,
        )
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        with torch.no_grad():
            logits = self.torch_model(**inputs).logits
            probs = torch.softmax(logits, dim=-1).squeeze(0).cpu().numpy()

        id2label = self.torch_model.config.id2label
        label_scores = {str(id2label[i]).lower(): float(probs[i]) for i in range(len(probs))}
        top_label = max(label_scores, key=label_scores.get)
        confidence = label_scores[top_label]
        valence, arousal = LABEL_VAD.get(top_label, (0.0, 0.0))
        method = (
            "emotion2vec_plus_kesdy_v1"
            if os.environ.get("SER_KESDY", "").lower() in ("1", "true", "yes")
            else "emotion2vec_plus_v1"
        )
        return {
            "label": top_label,
            "confidence": round(confidence, 4),
            "label_scores": label_scores,
            "app_emotion_key": LABEL_TO_APP.get(top_label, "calm"),
            "vad": {"valence": valence, "arousal": arousal},
            "model_id": self.model_id,
            "method": method,
        }

    def analyze_bytes(self, audio_bytes: bytes, mime: str = "audio/webm") -> dict[str, Any]:
        wav = to_wav_16k_mono(audio_bytes, mime)
        if self.engine == "wav2vec2":
            parsed = self._analyze_wav2vec2(wav)
            return parsed

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(wav)
            path = f.name
        try:
            result = self.model.generate(path, granularity="utterance", extract_embedding=False)
            parsed = parse_funasr_result(result)
            parsed["model_id"] = self.model_id
            parsed["method"] = "emotion2vec_plus_v1"
            return parsed
        finally:
            if os.path.exists(path):
                os.unlink(path)

    def analyze_session(self, turns: list[dict[str, Any]]) -> dict[str, Any]:
        turn_results: list[dict[str, Any]] = []
        agg_scores: dict[str, float] = {k: 0.0 for k in EMOTION2VEC_LABELS}
        weight_sum = 0.0

        for turn in turns:
            import base64

            raw = base64.b64decode(turn["audio_base64"])
            mime = turn.get("mime_type") or "audio/webm"
            parsed = self.analyze_bytes(raw, mime)
            parsed["step_id"] = turn.get("step_id")
            parsed["transcript"] = turn.get("transcript") or ""
            turn_results.append(parsed)

            w = max(parsed["confidence"], 0.05)
            weight_sum += w
            for lab, sc in parsed["label_scores"].items():
                agg_scores[lab] = agg_scores.get(lab, 0.0) + sc * w

        if weight_sum > 0:
            agg_scores = {k: v / weight_sum for k, v in agg_scores.items()}
        else:
            agg_scores = {k: (1.0 if k == "unknown" else 0.0) for k in EMOTION2VEC_LABELS}

        top_label = max(agg_scores, key=agg_scores.get)
        confidence = agg_scores[top_label]
        valence, arousal = LABEL_VAD.get(top_label, (0.0, 0.0))

        return {
            "method": turn_results[0].get("method", "emotion2vec_plus_v1") if turn_results else "emotion2vec_plus_v1",
            "model_id": self.model_id,
            "turn_count": len(turn_results),
            "label": top_label,
            "confidence": round(confidence, 4),
            "label_scores": {k: round(agg_scores.get(k, 0.0), 4) for k in EMOTION2VEC_LABELS},
            "app_emotion_key": LABEL_TO_APP.get(top_label, "calm"),
            "vad": {"valence": valence, "arousal": arousal},
            "turns": turn_results,
        }
