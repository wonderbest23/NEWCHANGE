-- Web Push 구독 저장. VAPID 기반 push 발송 시 endpoint+키를 lookup.
create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- 본인 구독만 조회/추가/삭제.
create policy "push_subs_select_own" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push_subs_insert_own" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push_subs_delete_own" on public.push_subscriptions
  for delete using (auth.uid() = user_id);
