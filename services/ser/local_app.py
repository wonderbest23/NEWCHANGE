"""
로컬 SER API (개발·스테이징).

  pip install -r requirements.txt
  SER_MODEL_ID=iic/emotion2vec_plus_base uvicorn local_app:app --host 0.0.0.0 --port 8090

환경변수:
  SER_API_KEY       — Bearer 토큰 (선택)
  SER_MODEL_ID      — 기본 iic/emotion2vec_plus_large
  SER_MODEL_HUB     — hf | ms
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from inference import SerEngine

app = FastAPI(title="Gyeot Voice SER", version="1.0.0")
_engine: Optional[SerEngine] = None


class TurnInput(BaseModel):
    step_id: Optional[str] = None
    transcript: str = ""
    audio_base64: str
    mime_type: str = "audio/webm"


class SessionInput(BaseModel):
    turns: List[TurnInput] = Field(min_length=1, max_length=12)


def _auth(authorization: Optional[str]) -> None:
    key = os.environ.get("SER_API_KEY")
    if not key:
        return
    if not authorization or authorization != f"Bearer {key}":
        raise HTTPException(status_code=401, detail="Unauthorized")


def get_engine() -> SerEngine:
    global _engine
    if _engine is None:
        _engine = SerEngine(model_id=os.environ.get("SER_MODEL_ID"))
    return _engine


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "model": os.environ.get("SER_MODEL_ID", "iic/emotion2vec_plus_large")}


@app.post("/v1/analyze-turn")
def analyze_turn(body: TurnInput, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    _auth(authorization)
    import base64

    raw = base64.b64decode(body.audio_base64)
    return get_engine().analyze_bytes(raw, body.mime_type)


@app.post("/v1/analyze-session")
def analyze_session(body: SessionInput, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    _auth(authorization)
    turns = [t.model_dump() for t in body.turns]
    return get_engine().analyze_session(turns)
