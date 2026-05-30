#!/usr/bin/env bash
# 음성 감정(SER) API 초기 설정 — macOS 기준
# 사용: bash scripts/setup-voice-ser.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SER_DIR="$ROOT/services/ser"
VENV="$SER_DIR/.venv"
ENV_FILE="$ROOT/.env"

echo ""
echo "=========================================="
echo "  음성 감정(SER) API 설정을 시작합니다"
echo "=========================================="
echo ""

# 1) ffmpeg (오디오 변환 필수)
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "[1/5] ffmpeg 설치 중… (Homebrew 필요)"
  if ! command -v brew >/dev/null 2>&1; then
    echo "❌ Homebrew가 없습니다. https://brew.sh 에서 먼저 설치해 주세요."
    exit 1
  fi
  brew install ffmpeg
else
  echo "[1/5] ffmpeg ✓"
fi

# 2) Python 가상환경 (3.10+ 권장)
PYTHON=""
for candidate in python3.12 python3.11 python3.10 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PYTHON="$candidate"
    break
  fi
done
if [[ -z "$PYTHON" ]]; then
  echo "❌ python3가 없습니다."
  exit 1
fi
PY_VER="$("$PYTHON" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
echo "[2/5] Python $PY_VER 가상환경 생성…"
"$PYTHON" -m venv "$VENV"
# shellcheck disable=SC1091
source "$VENV/bin/activate"
pip install -q --upgrade pip
pip install -q -r "$SER_DIR/requirements.txt"
echo "     패키지 설치 완료 ✓"

# 3) SER API 키 생성
SER_KEY="$(openssl rand -hex 16 2>/dev/null || python3 -c 'import secrets; print(secrets.token_hex(16))')"
echo "[3/5] SER API 키 생성 ✓"

# 4) .env 에 SER 설정 추가
echo "[4/5] .env 업데이트…"
touch "$ENV_FILE"

append_env() {
  local key="$1"
  local val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    return
  fi
  echo "${key}=${val}" >> "$ENV_FILE"
}

append_env "SER_API_URL" "http://localhost:8090"
append_env "SER_API_KEY" "$SER_KEY"
append_env "SER_MODEL_ID" "iic/emotion2vec_plus_base"
append_env "SER_MODEL_HUB" "hf"
append_env "SER_API_TIMEOUT_MS" "45000"

echo "     SER_API_URL=http://localhost:8090 추가 ✓"

# 5) 완료 안내
echo "[5/5] 설정 완료!"
echo ""
echo "=========================================="
echo "  다음 단계 (복사해서 터미널에 붙여넣기)"
echo "=========================================="
echo ""
echo "▶ 1) SER 서버 켜기 (터미널 창 1)"
echo "   cd $ROOT && npm run ser:dev"
echo ""
echo "▶ 2) 앱 켜기 (터미널 창 2)"
echo "   cd $ROOT && npm run dev"
echo ""
echo "▶ 3) 브라우저에서 /home → 안부통화 테스트"
echo ""
echo "※ 첫 실행 시 AI 모델 다운로드로 2~5분 걸릴 수 있어요."
echo "※ 프로덕션(실서비스) 배포는: npm run ser:deploy-modal"
echo ""
