-- auth.users 생성 시 public.profiles 1행 자동 생성 (RLS·앱 누락 방지)
-- 001 / 002 적용 이후 실행. user_roles 는 삽입하지 않음(운영/관리자 전용).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, phone, birth_year)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      'User'
    ),
    null,
    null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

-- 트igger는 auth 스키마에서 supabase_migrations(또는 postgres) 권한으로 생성됨
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();

-- 기존 auth.users 중 아직 profile 이 없는 계정 (마이그레이션 이전 가입자)
insert into public.profiles (id, display_name, phone, birth_year)
select
  u.id,
  coalesce(
    nullif(btrim(u.raw_user_meta_data->>'display_name'), ''),
    nullif(split_part(u.email, '@', 1), ''),
    'User'
  ),
  null,
  null
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
