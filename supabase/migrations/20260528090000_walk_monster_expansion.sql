-- ─────────────────────────────────────────────────────────────────────────────
-- 산책 몬스터 게임 확장:
--   1) game_profiles.radar_extender_until — 레이더 확장기 버프 만료 시각
--   2) 기존 game_inventory.item_key check constraint 를 확장해
--      lucky_charm / xp_doubler / radar_extender / revive_heart 허용
--   3) 리더보드용 game_leaderboard_v 뷰 (총 포획 기준 정렬, 본인 rank 빠르게 조회)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.game_profiles
  add column if not exists radar_extender_until timestamptz;

comment on column public.game_profiles.radar_extender_until is
  '레이더 확장기 버프 만료. NULL이면 비활성. 활성 상태면 포획 반경 +20m.';

-- item_key check 가 있다면 drop 후 새 set 으로 교체.
-- (없다면 첫 추가)
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.game_inventory'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%item_key%';
  if cname is not null then
    execute format('alter table public.game_inventory drop constraint %I', cname);
  end if;
end$$;

alter table public.game_inventory
  add constraint game_inventory_item_key_check
  check (item_key in (
    'capture_orb',
    'step_booster',
    'lucky_charm',
    'xp_doubler',
    'radar_extender',
    'revive_heart'
  ));

-- 리더보드 뷰. 전체 행을 매번 정렬하는 비용은 작은 베타 규모에선 OK.
-- 사용자 수가 늘면 materialized view 로 전환 검토.
create or replace view public.game_leaderboard_v as
  select
    user_id,
    total_catches,
    level,
    xp,
    rank() over (order by total_catches desc, xp desc) as rank
  from public.game_profiles
  where total_catches > 0;

comment on view public.game_leaderboard_v is
  '산책 몬스터 리더보드. total_catches DESC, xp DESC 순으로 rank 부여.';

grant select on public.game_leaderboard_v to anon, authenticated;
