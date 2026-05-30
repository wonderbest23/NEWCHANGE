#!/usr/bin/env bash
# Modal GPU에 SER API 배포 (프로덕션용)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SER_DIR="$ROOT/services/ser"

# pip user install 경로 (modal CLI)
export PATH="${PATH}:${HOME}/Library/Python/3.9/bin:${HOME}/.local/bin"

modal_cmd() {
  if command -v modal >/dev/null 2>&1; then
    modal "$@"
  else
    python3 -m modal "$@"
  fi
}

echo ""
echo "Modal GPU 배포를 시작합니다…"
echo ""

if ! modal_cmd --version >/dev/null 2>&1; then
  echo "Modal CLI 설치 중…"
  python3 -m pip install --user modal
  export PATH="${PATH}:${HOME}/Library/Python/3.9/bin"
fi

echo "Modal 버전: $(modal_cmd --version)"
echo ""
echo "Modal 로그인이 필요합니다 (브라우저가 열립니다)."
echo "이미 로그인했다면 Enter만 눌러도 됩니다."
modal_cmd token new || true

cd "$SER_DIR"
modal_cmd deploy modal_app.py

echo ""
echo "=========================================="
echo "  배포 완료!"
echo "=========================================="
echo ""
echo "Modal 대시보드에서 URL을 확인하세요:"
echo "  https://modal.com/apps"
echo ""
echo "URL 형식 예: https://YOUR-WORKSPACE--gyeot-voice-ser-ser-api.modal.run"
echo ""
echo "Cloudflare Workers(실서비스)에 등록:"
echo "  npx wrangler secret put SER_API_URL"
echo "  npx wrangler secret put SER_API_KEY"
echo ""
echo "로컬 .env의 SER_API_URL 도 같은 URL로 바꿔 주세요."
echo ""
