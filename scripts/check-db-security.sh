#!/usr/bin/env bash
# DB 보안 사전 점검 스크립트
#
# 검사 항목
#   1) public 스키마의 SECURITY DEFINER 함수 중 anon/authenticated/PUBLIC 에
#      EXECUTE 권한이 부여된 함수 (의도된 RPC 화이트리스트만 허용)
#   2) RLS 가 활성화되어 있으나 정책이 하나도 없는 테이블
#      (정책이 0개면 deny-all 처럼 보이지만, 명시적 deny 정책 없이 두면
#       향후 정책 추가 시 의도치 않게 열릴 위험이 있어 경고)
#   3) public 스키마인데 RLS 가 비활성화된 테이블
#
# 사용 방법
#   bash scripts/check-db-security.sh
#
# 환경 변수
#   PGHOST/PGUSER/PGPASSWORD/PGDATABASE 또는 SUPABASE_DB_URL 중 하나가 필요합니다.
#
# 종료 코드
#   0  : 모든 검사 통과
#   1  : 하나 이상 위반 사항 발견 (배포를 중단해야 함)
#   2  : DB 연결 실패 / 환경 변수 누락

set -uo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# 의도적으로 authenticated 가 RPC 로 호출하도록 허용된 함수 화이트리스트.
# 이 목록에 없는데 anon/authenticated EXECUTE 권한이 있으면 위반으로 간주합니다.
# 함수가 추가되면 이 배열을 갱신하세요.
# ──────────────────────────────────────────────────────────────────────────────
ALLOWED_DEFINER_FUNCTIONS=(
  "accept_family_invite"
)

# ──────────────────────────────────────────────────────────────────────────────
# 연결 확인
# ──────────────────────────────────────────────────────────────────────────────
PSQL_CMD=(psql -X -A -t -v ON_ERROR_STOP=1)

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  PSQL_CMD+=("${SUPABASE_DB_URL}")
elif [[ -n "${PGHOST:-}" ]]; then
  : # PG* 환경 변수로 자동 사용됨
else
  echo "❌ DB 연결 정보를 찾을 수 없습니다. SUPABASE_DB_URL 또는 PGHOST 등을 설정하세요." >&2
  exit 2
fi

if ! "${PSQL_CMD[@]}" -c "select 1" >/dev/null 2>&1; then
  echo "❌ DB 연결에 실패했습니다." >&2
  exit 2
fi

VIOLATIONS=0
declare -a REPORT

run_sql() {
  "${PSQL_CMD[@]}" -c "$1"
}

# ──────────────────────────────────────────────────────────────────────────────
# 1) SECURITY DEFINER 함수 중 anon/authenticated/PUBLIC EXECUTE 권한이 있는 항목
# ──────────────────────────────────────────────────────────────────────────────
allowed_csv=$(IFS=,; printf "'%s'," "${ALLOWED_DEFINER_FUNCTIONS[@]}")
allowed_csv="${allowed_csv%,}"

definer_sql=$(cat <<SQL
with definer_fns as (
  select
    p.proname  as function_name,
    pg_get_function_identity_arguments(p.oid) as args,
    p.oid      as oid,
    coalesce(p.proacl, acldefault('f', p.proowner)) as acl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef = true
),
exploded as (
  select
    f.function_name,
    f.args,
    case when (a).grantee = 0 then 'PUBLIC'
         else (select rolname from pg_roles where oid = (a).grantee)
    end as grantee_name,
    (a).privilege_type as priv
  from definer_fns f,
       lateral aclexplode(f.acl) as a
)
select
  function_name || '(' || args || ')' as fn,
  string_agg(distinct grantee_name, ',' order by grantee_name) as grantees
from exploded
where priv = 'EXECUTE'
  and grantee_name in ('anon','authenticated','PUBLIC')
  and function_name not in (${allowed_csv:-NULL})
group by function_name, args
order by 1;
SQL
)

definer_out=$(run_sql "$definer_sql")
if [[ -n "$definer_out" ]]; then
  VIOLATIONS=$((VIOLATIONS+1))
  REPORT+=("❌ [SECURITY DEFINER EXECUTE] anon/authenticated/PUBLIC 에 노출된 함수가 있습니다:")
  while IFS='|' read -r fn grantees; do
    [[ -z "$fn" ]] && continue
    REPORT+=("   • ${fn// /}  (grantees: ${grantees// /})")
  done <<< "$definer_out"
  REPORT+=("   → REVOKE EXECUTE … FROM PUBLIC, anon, authenticated; 후 필요한 경우 authenticated 만 GRANT")
  REPORT+=("   → 의도된 RPC 라면 scripts/check-db-security.sh 의 ALLOWED_DEFINER_FUNCTIONS 에 추가")
else
  REPORT+=("✅ SECURITY DEFINER EXECUTE 권한 점검 통과")
fi

# ──────────────────────────────────────────────────────────────────────────────
# 2) RLS 활성화되었지만 정책이 0개인 테이블
# ──────────────────────────────────────────────────────────────────────────────
no_policy_sql=$(cat <<'SQL'
select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = true
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  )
order by 1;
SQL
)

no_policy_out=$(run_sql "$no_policy_sql" || true)
if [[ -n "$no_policy_out" ]]; then
  VIOLATIONS=$((VIOLATIONS+1))
  REPORT+=("❌ [RLS Enabled No Policy] RLS 가 켜져 있으나 정책이 하나도 없는 테이블:")
  while IFS= read -r tbl; do
    [[ -z "$tbl" ]] && continue
    REPORT+=("   • public.$tbl")
  done <<< "$no_policy_out"
  REPORT+=("   → 의도가 '클라이언트 차단'이라면 USING (false) WITH CHECK (false) 정책을 명시적으로 추가")
else
  REPORT+=("✅ RLS Enabled No Policy 점검 통과")
fi

# ──────────────────────────────────────────────────────────────────────────────
# 3) public 스키마의 RLS 미활성 테이블
# ──────────────────────────────────────────────────────────────────────────────
rls_off_sql=$(cat <<'SQL'
select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
order by 1;
SQL
)

rls_off_out=$(run_sql "$rls_off_sql" || true)
if [[ -n "$rls_off_out" ]]; then
  VIOLATIONS=$((VIOLATIONS+1))
  REPORT+=("❌ [RLS Disabled] public 스키마에 RLS 가 꺼진 테이블이 있습니다:")
  while IFS= read -r tbl; do
    [[ -z "$tbl" ]] && continue
    REPORT+=("   • public.$tbl")
  done <<< "$rls_off_out"
  REPORT+=("   → ALTER TABLE public.<tbl> ENABLE ROW LEVEL SECURITY; 후 필요한 정책 추가")
else
  REPORT+=("✅ RLS 활성화 점검 통과")
fi

# ──────────────────────────────────────────────────────────────────────────────
# 결과 출력
# ──────────────────────────────────────────────────────────────────────────────
echo "────────────────────────────────────────────────────────"
echo " DB 보안 사전 점검 결과"
echo "────────────────────────────────────────────────────────"
for line in "${REPORT[@]}"; do
  echo "$line"
done
echo "────────────────────────────────────────────────────────"

if (( VIOLATIONS > 0 )); then
  echo "⛔ 위반 항목 ${VIOLATIONS}건 — 배포를 중단하고 위 항목을 먼저 해결하세요."
  exit 1
fi

echo "✅ 모든 보안 점검 통과 — 배포 진행 가능"
exit 0
