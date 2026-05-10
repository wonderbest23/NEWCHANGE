-- =============================================================================
-- 곁 커뮤니티 — 시니어 인증 게시판
-- =============================================================================
-- 한국 블라인드 시스템 참고:
--  - 본인인증 (PASS/NICE) 통과한 사용자만 글/댓글 가능
--  - 프로필에 "정확한 나이 + 시/군/구" 표시 (비식별 닉네임은 별도)
--  - 카테고리: 자유 / 구인구직 / 법률자문 / 복지혜택 / 새로운소식 / 대행업체
--  - 신고/숨김/차단/모더레이션 포함
-- =============================================================================

-- 0. 확장
create extension if not exists pgcrypto;

-- 1. 본인인증 결과 (PASS/NICE 콜백 결과 저장)
--    실제 주민번호/CI/DI는 저장 금지. 해시(ci_hash)만 보관, 중복 가입 방지용.
create table if not exists public.identity_verifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  provider        text not null check (provider in ('pass','nice','manual')),
  ci_hash         text not null,                       -- SHA-256(ci) — 식별자 해시
  birth_year      int  not null check (birth_year between 1900 and 2100),
  birth_month     int  not null check (birth_month between 1 and 12),
  birth_day       int  not null check (birth_day  between 1 and 31),
  gender          text check (gender in ('M','F','U')) default 'U',
  carrier         text,                                -- 통신사 (선택)
  verified_at     timestamptz not null default now(),
  expires_at      timestamptz,                         -- 재인증 만료
  raw_meta        jsonb,                               -- 콜백 메타 (PII 제외)
  unique (provider, ci_hash)
);

create index if not exists idx_identity_user on public.identity_verifications(user_id);

-- 2. 커뮤니티 프로필 (auth.users 와 1:1, 표시용)
create table if not exists public.community_profiles (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  handle          text unique not null,                -- 닉네임 (중복불가)
  age             int  not null check (age between 0 and 150),  -- 표시용 만 나이
  region_sido     text not null,                        -- 시/도 (예: 서울특별시)
  region_sigungu  text not null,                        -- 시/군/구 (예: 강남구)
  is_verified     boolean not null default false,       -- 본인인증 통과 여부
  verified_at     timestamptz,
  reputation      int  not null default 0,              -- 신뢰점수 (좋아요/신고 가중)
  is_blocked      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_profile_region on public.community_profiles(region_sido, region_sigungu);
create index if not exists idx_profile_age    on public.community_profiles(age);

-- 자동 갱신 트리거
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_profile_touch on public.community_profiles;
create trigger trg_profile_touch
  before update on public.community_profiles
  for each row execute function public.touch_updated_at();

-- 3. 카테고리 (시드)
create table if not exists public.community_categories (
  slug        text primary key,
  name        text not null,
  description text,
  icon        text,                       -- lucide 아이콘 키
  sort_order  int  not null default 0,
  is_active   boolean not null default true
);

insert into public.community_categories (slug, name, description, icon, sort_order) values
  ('free',     '자유게시판',  '일상·취미·소소한 이야기',                'message-circle', 10),
  ('jobs',     '구인구직',    '시니어 일자리·단기 알바',                'briefcase',      20),
  ('legal',    '법률자문',    '전문가 답변, 법률 상담 후기',             'scale',          30),
  ('welfare',  '복지혜택',    '정부·지자체 지원, 신청 후기',             'heart-handshake',40),
  ('news',     '새로운소식',  '지역 뉴스·생활 정보',                    'newspaper',      50),
  ('agency',   '대행업체',    '신뢰할 만한 업체 추천·후기',              'building-2',     60)
on conflict (slug) do update
  set name=excluded.name, description=excluded.description,
      icon=excluded.icon, sort_order=excluded.sort_order;

-- 4. 게시글
create table if not exists public.community_posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references auth.users(id) on delete cascade,
  category_slug text not null references public.community_categories(slug),
  title         text not null check (char_length(title) between 2 and 120),
  body          text not null check (char_length(body)  between 1 and 10000),
  region_sido   text,                          -- 작성 시점 지역 스냅샷
  region_sigungu text,
  view_count    int  not null default 0,
  like_count    int  not null default 0,
  comment_count int  not null default 0,
  report_count  int  not null default 0,
  is_hidden     boolean not null default false,  -- 모더레이션 숨김
  is_pinned     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_post_cat_time  on public.community_posts(category_slug, created_at desc);
create index if not exists idx_post_region    on public.community_posts(region_sido, region_sigungu);
create index if not exists idx_post_author    on public.community_posts(author_id);

drop trigger if exists trg_post_touch on public.community_posts;
create trigger trg_post_touch
  before update on public.community_posts
  for each row execute function public.touch_updated_at();

-- 5. 댓글 (1뎁스 대댓글)
create table if not exists public.community_comments (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.community_posts(id) on delete cascade,
  parent_id    uuid references public.community_comments(id) on delete cascade,
  author_id    uuid not null references auth.users(id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 2000),
  like_count   int  not null default 0,
  is_hidden    boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists idx_comment_post on public.community_comments(post_id, created_at);

-- 6. 좋아요 (게시글/댓글 다형)
create table if not exists public.community_likes (
  user_id     uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment')),
  target_id   uuid not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

-- 7. 신고
create table if not exists public.community_reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references auth.users(id) on delete cascade,
  target_type  text not null check (target_type in ('post','comment','user')),
  target_id    uuid not null,
  reason       text not null check (reason in ('spam','abuse','adult','fraud','privacy','other')),
  detail       text,
  status       text not null default 'pending' check (status in ('pending','reviewing','resolved','rejected')),
  created_at   timestamptz not null default now()
);
create index if not exists idx_report_status on public.community_reports(status, created_at desc);

-- 8. 차단
create table if not exists public.community_blocks (
  blocker_id  uuid not null references auth.users(id) on delete cascade,
  blocked_id  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- =============================================================================
-- RLS (Row-Level Security)
-- =============================================================================
alter table public.identity_verifications enable row level security;
alter table public.community_profiles    enable row level security;
alter table public.community_posts       enable row level security;
alter table public.community_comments    enable row level security;
alter table public.community_likes       enable row level security;
alter table public.community_reports     enable row level security;
alter table public.community_blocks      enable row level security;

-- helper: 인증된 시니어인지 (security definer)
create or replace function public.is_verified_member(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_profiles
    where user_id = _uid and is_verified = true and is_blocked = false
  );
$$;

-- identity_verifications: 본인만 조회/삽입
drop policy if exists iv_self_select on public.identity_verifications;
create policy iv_self_select on public.identity_verifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists iv_self_insert on public.identity_verifications;
create policy iv_self_insert on public.identity_verifications
  for insert to authenticated with check (user_id = auth.uid());

-- community_profiles
drop policy if exists cp_public_read on public.community_profiles;
create policy cp_public_read on public.community_profiles
  for select using (true);          -- 닉네임/나이/지역은 공개
drop policy if exists cp_self_upsert on public.community_profiles;
create policy cp_self_upsert on public.community_profiles
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists cp_self_update on public.community_profiles;
create policy cp_self_update on public.community_profiles
  for update to authenticated using (user_id = auth.uid());

-- posts: 모두 조회 가능, 인증 회원만 작성/본인만 수정삭제
drop policy if exists post_read on public.community_posts;
create policy post_read on public.community_posts
  for select using (is_hidden = false);
drop policy if exists post_insert on public.community_posts;
create policy post_insert on public.community_posts
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_verified_member(auth.uid()));
drop policy if exists post_update on public.community_posts;
create policy post_update on public.community_posts
  for update to authenticated using (author_id = auth.uid());
drop policy if exists post_delete on public.community_posts;
create policy post_delete on public.community_posts
  for delete to authenticated using (author_id = auth.uid());

-- comments: 동일
drop policy if exists comment_read on public.community_comments;
create policy comment_read on public.community_comments
  for select using (is_hidden = false);
drop policy if exists comment_insert on public.community_comments;
create policy comment_insert on public.community_comments
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_verified_member(auth.uid()));
drop policy if exists comment_update on public.community_comments;
create policy comment_update on public.community_comments
  for update to authenticated using (author_id = auth.uid());

-- likes: 본인 것만
drop policy if exists like_read on public.community_likes;
create policy like_read on public.community_likes for select using (true);
drop policy if exists like_write on public.community_likes;
create policy like_write on public.community_likes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- reports: 본인이 만든 신고만 조회
drop policy if exists report_self on public.community_reports;
create policy report_self on public.community_reports
  for select to authenticated using (reporter_id = auth.uid());
drop policy if exists report_insert on public.community_reports;
create policy report_insert on public.community_reports
  for insert to authenticated with check (reporter_id = auth.uid());

-- blocks: 본인 차단 목록만
drop policy if exists block_self on public.community_blocks;
create policy block_self on public.community_blocks
  for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
