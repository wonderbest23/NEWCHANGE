-- site_config: 사이트 전역 설정 (푸터 등) 저장 테이블
create table if not exists public.site_config (
  id          text primary key default 'default',
  footer      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- 기본 푸터 데이터 삽입
insert into public.site_config (id, footer) values (
  'default',
  '{
    "tagline": "가족이 함께 만드는 따뜻한 돌봄. 곁이 일상의 안부를 잇습니다.",
    "email": "support@gyeot.kr",
    "phone": "1588-0000",
    "hours": "평일 09:00 – 18:00 (점심 12:00 – 13:00)",
    "companyName": "㈜곁 (Gyeot Inc.)",
    "ceo": "홍길동",
    "bizNumber": "000-00-00000",
    "mailOrderNumber": "제 0000-서울강남-00000호",
    "privacyOfficer": "김보호",
    "address": "서울특별시 강남구 테헤란로 123, 10층 (06234)",
    "bizRegistrationUrl": "https://www.ftc.go.kr/bizCommPop.do?wrkr_no=0000000000"
  }'::jsonb
) on conflict (id) do nothing;

-- RLS: 누구나 읽기 가능, admin만 쓰기
alter table public.site_config enable row level security;

create policy "site_config_public_read"
  on public.site_config for select
  using (true);

create policy "site_config_admin_write"
  on public.site_config for all
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role = 'admin'
    )
  );
