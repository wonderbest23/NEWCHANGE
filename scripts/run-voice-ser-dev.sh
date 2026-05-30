#!/usr/bin/env bash
# SER 서버 로컬 실행
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SER_DIR="$ROOT/services/ser"
VENV="$SER_DIR/.venv"

if [[ ! -d "$VENV" ]]; then
  echo "가상환경이 없습니다. 먼저 실행: npm run ser:setup"
  exit 1
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"

# .env에서 SER_* 읽기
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

export SER_MODEL_ID="${SER_MODEL_ID:-iic/emotion2vec_plus_base}"
export SER_MODEL_HUB="${SER_MODEL_HUB:-hf}"

echo ""
echo "SER API 시작 → http://localhost:8090"
echo "모델: $SER_MODEL_ID"
echo "헬스체크: curl http://localhost:8090/health"
echo "(종료: Ctrl+C)"
echo ""

cd "$SER_DIR"
exec uvicorn local_app:app --host 0.0.0.0 --port 8090
