-- RLS policies + helpers (care core)
-- 001_create_care_core_schema.sql 이 적용된 뒤 실행
-- service_role(대시보드/백엔드 전용)은 RLS를 우회할 수 있음: 앱(anon) 클라이언트는 anon 정책이 없으므로 전부 거부
-- SQL 실행/적용은 직접 수행하지 말고, 리뷰 후 Supabase/CLI로 적용

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER, search_path 고정 — RLS 재귀·user_roles 조회용)
-- ---------------------------------------------------------------------------
create or replace function public.has_role(_user_id uuid, _role text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  );
$$;

create or replace function public.is_family_member(_group_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.family_members
    where family_group_id = _group_id
      and profile_id = _user_id
  );
$$;

create or replace function public.is_guardian_in_group(_group_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.family_members
    where family_group_id = _group_id
      and profile_id = _user_id
      and member_role = 'guardian'
  );
$$;

create or replace function public.can_access_care_recipient(_recipient_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.has_role(_user_id, 'admin')
    or exists (
      select 1
      from public.care_recipients cr
      where cr.id = _recipient_id
        and cr.profile_id = _user_id
    )
    or exists (
      select 1
      from public.care_recipients cr
      where cr.id = _recipient_id
        and cr.primary_guardian_id = _user_id
    )
    or exists (
      select 1
      from public.care_recipients cr
      join public.family_members fm
        on fm.family_group_id = cr.family_group_id
      where cr.id = _recipient_id
        and fm.profile_id = _user_id
        and fm.member_role = 'guardian'
    );
$$;

-- 파트너: 배정된 care_tasks 행에 한함 (care_recipient 직접 열람 X)
create or replace function public.is_assigned_partner(_task_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.care_tasks t
    where t.id = _task_id
      and t.assigned_partner_id is not null
      and t.assigned_partner_id = _user_id
  );
$$;

-- family 내 다른 프로필(보호자가 부모님 profile 조회 등)
create or replace function public.is_same_family_group_profiles(_a uuid, _b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.family_members m1
    join public.family_members m2
      on m1.family_group_id = m2.family_group_id
    where m1.profile_id = _a
      and m2.profile_id = _b
  );
$$;

-- 위치: 동의 스냅샷이 수신자와 맞고, 응답 true 인 경우(구조 맞음)
create or replace function public.has_valid_location_consent_snapshot(
  _recipient_id uuid,
  _consent_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.location_consents c
    where c.id = _consent_id
      and c.care_recipient_id = _recipient_id
      and c.is_granted = true
  );
$$;

revoke all on function public.has_role(uuid, text) from public;
revoke all on function public.is_family_member(uuid, uuid) from public;
revoke all on function public.is_guardian_in_group(uuid, uuid) from public;
revoke all on function public.can_access_care_recipient(uuid, uuid) from public;
revoke all on function public.is_assigned_partner(uuid, uuid) from public;
revoke all on function public.is_same_family_group_profiles(uuid, uuid) from public;
revoke all on function public.has_valid_location_consent_snapshot(uuid, uuid) from public;

grant execute on function public.has_role(uuid, text) to authenticated;
grant execute on function public.is_family_member(uuid, uuid) to authenticated;
grant execute on function public.is_guardian_in_group(uuid, uuid) to authenticated;
grant execute on function public.can_access_care_recipient(uuid, uuid) to authenticated;
grant execute on function public.is_assigned_partner(uuid, uuid) to authenticated;
grant execute on function public.is_same_family_group_profiles(uuid, uuid) to authenticated;
grant execute on function public.has_valid_location_consent_snapshot(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or public.has_role((select auth.uid()), 'admin')
  or public.is_same_family_group_profiles((select auth.uid()), id)
);

create policy profiles_insert
on public.profiles
for insert
to authenticated
with check (id = (select auth.uid()));

create policy profiles_update
on public.profiles
for update
to authenticated
using (
  id = (select auth.uid())
  or public.has_role((select auth.uid()), 'admin')
)
with check (
  id = (select auth.uid())
  or public.has_role((select auth.uid()), 'admin')
);

create policy profiles_delete
on public.profiles
for delete
to authenticated
using (public.has_role((select auth.uid()), 'admin'));

-- ---------------------------------------------------------------------------
-- user_roles (관리자가 관리, 본인은 읽기)
-- ---------------------------------------------------------------------------
create policy user_roles_select
on public.user_roles
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.has_role((select auth.uid()), 'admin')
);

create policy user_roles_insert
on public.user_roles
for insert
to authenticated
with check (public.has_role((select auth.uid()), 'admin'));

create policy user_roles_update
on public.user_roles
for update
to authenticated
using (public.has_role((select auth.uid()), 'admin'))
with check (public.has_role((select auth.uid()), 'admin'));

create policy user_roles_delete
on public.user_roles
for delete
to authenticated
using (public.has_role((select auth.uid()), 'admin'));

-- ---------------------------------------------------------------------------
-- family_groups
-- ---------------------------------------------------------------------------
create policy family_groups_select
on public.family_groups
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.is_family_member(id, (select auth.uid())::uuid)
  or created_by = (select auth.uid())
);

create policy family_groups_insert
on public.family_groups
for insert
to authenticated
with check (created_by = (select auth.uid()));

create policy family_groups_update
on public.family_groups
for update
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or (created_by = (select auth.uid())::uuid)
  or public.is_guardian_in_group(id, (select auth.uid())::uuid)
)
with check (
  public.has_role((select auth.uid()), 'admin')
  or (created_by = (select auth.uid())::uuid)
  or public.is_guardian_in_group(id, (select auth.uid())::uuid)
);

create policy family_groups_delete
on public.family_groups
for delete
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or (created_by = (select auth.uid())::uuid)
);

-- ---------------------------------------------------------------------------
-- family_members
-- ---------------------------------------------------------------------------
create policy family_members_select
on public.family_members
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.is_family_member(family_group_id, (select auth.uid())::uuid)
);

create policy family_members_insert
on public.family_members
for insert
to authenticated
with check (
  public.has_role((select auth.uid()), 'admin')
  or public.is_guardian_in_group(family_group_id, (select auth.uid())::uuid)
);

create policy family_members_update
on public.family_members
for update
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.is_guardian_in_group(family_group_id, (select auth.uid())::uuid)
)
with check (
  public.has_role((select auth.uid()), 'admin')
  or public.is_guardian_in_group(family_group_id, (select auth.uid())::uuid)
);

create policy family_members_delete
on public.family_members
for delete
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.is_guardian_in_group(family_group_id, (select auth.uid())::uuid)
);

-- ---------------------------------------------------------------------------
-- care_recipients
-- ---------------------------------------------------------------------------
create policy care_recipients_select
on public.care_recipients
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(id, (select auth.uid())::uuid)
);

create policy care_recipients_insert
on public.care_recipients
for insert
to authenticated
with check (
  public.has_role((select auth.uid()), 'admin')
  or public.is_guardian_in_group(family_group_id, (select auth.uid())::uuid)
);

create policy care_recipients_update
on public.care_recipients
for update
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.is_guardian_in_group(family_group_id, (select auth.uid())::uuid)
  or (profile_id = (select auth.uid())::uuid)
  or (primary_guardian_id = (select auth.uid())::uuid)
)
with check (
  public.has_role((select auth.uid()), 'admin')
  or public.is_guardian_in_group(family_group_id, (select auth.uid())::uuid)
  or (profile_id = (select auth.uid())::uuid)
  or (primary_guardian_id = (select auth.uid())::uuid)
);

create policy care_recipients_delete
on public.care_recipients
for delete
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.is_guardian_in_group(family_group_id, (select auth.uid())::uuid)
);

-- ---------------------------------------------------------------------------
-- check_ins, medications, medication_logs
-- ---------------------------------------------------------------------------
create policy check_ins_select
on public.check_ins
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
);

create policy check_ins_insert
on public.check_ins
for insert
to authenticated
with check (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
);

create policy check_ins_update
on public.check_ins
for update
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
)
with check (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
);

-- delete: admin 또는 해당 수신자 그룹의 보호자
create policy check_ins_delete
on public.check_ins
for delete
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or exists (
    select 1
    from public.care_recipients cr
    where cr.id = check_ins.care_recipient_id
      and public.is_guardian_in_group(cr.family_group_id, (select auth.uid())::uuid)
  )
);

-- medications
create policy medications_select
on public.medications
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
);

create policy medications_insert
on public.medications
for insert
to authenticated
with check (
  public.has_role((select auth.uid()), 'admin')
  or public.is_guardian_in_group(
    (select cr.family_group_id from public.care_recipients cr where cr.id = care_recipient_id),
    (select auth.uid())::uuid
  )
);

create policy medications_update
on public.medications
for update
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
)
with check (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
);

create policy medications_delete
on public.medications
for delete
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.is_guardian_in_group(
    (select cr.family_group_id from public.care_recipients cr where cr.id = medications.care_recipient_id),
    (select auth.uid())::uuid
  )
);

-- medication_logs
create policy medication_logs_select
on public.medication_logs
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
);

create policy medication_logs_insert
on public.medication_logs
for insert
to authenticated
with check (
  public.has_role((select auth.uid()), 'admin')
  or (
    public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
    and created_by = (select auth.uid())::uuid
  )
);

create policy medication_logs_update
on public.medication_logs
for update
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
)
with check (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
);

create policy medication_logs_delete
on public.medication_logs
for delete
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.is_guardian_in_group(
    (select cr.family_group_id from public.care_recipients cr where cr.id = medication_logs.care_recipient_id),
    (select auth.uid())::uuid
  )
);

-- location_consents
create policy location_consents_select
on public.location_consents
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
);

create policy location_consents_insert
on public.location_consents
for insert
to authenticated
with check (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
);

create policy location_consents_update
on public.location_consents
for update
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
)
with check (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
);

create policy location_consents_delete
on public.location_consents
for delete
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or exists (
    select 1
    from public.care_recipients cr
    where cr.id = location_consents.care_recipient_id
      and public.is_guardian_in_group(cr.family_group_id, (select auth.uid())::uuid)
  )
);

-- location_pings (동의 스냅샷 구조 검증 + can_access)
create policy location_pings_select
on public.location_pings
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
);

create policy location_pings_insert
on public.location_pings
for insert
to authenticated
with check (
  public.has_role((select auth.uid()), 'admin')
  or (
    public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
    and public.has_valid_location_consent_snapshot(care_recipient_id, consent_snapshot_id)
  )
);

create policy location_pings_update
on public.location_pings
for update
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
)
with check (
  public.has_role((select auth.uid()), 'admin')
  or (
    public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
    and public.has_valid_location_consent_snapshot(care_recipient_id, consent_snapshot_id)
  )
);

create policy location_pings_delete
on public.location_pings
for delete
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or exists (
    select 1
    from public.care_recipients cr
    where cr.id = location_pings.care_recipient_id
      and public.is_guardian_in_group(cr.family_group_id, (select auth.uid())::uuid)
  )
);

-- alerts
create policy alerts_select
on public.alerts
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
);

create policy alerts_insert
on public.alerts
for insert
to authenticated
with check (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
);

create policy alerts_update
on public.alerts
for update
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
)
with check (
  public.has_role((select auth.uid()), 'admin')
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
);

create policy alerts_delete
on public.alerts
for delete
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or exists (
    select 1
    from public.care_recipients cr
    where cr.id = alerts.care_recipient_id
      and public.is_guardian_in_group(cr.family_group_id, (select auth.uid())::uuid)
  )
);

-- care_tasks (파트너: 배정 행만)
create policy care_tasks_select
on public.care_tasks
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.is_assigned_partner(id, (select auth.uid())::uuid)
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
);

create policy care_tasks_insert
on public.care_tasks
for insert
to authenticated
with check (
  public.has_role((select auth.uid()), 'admin')
  or public.is_guardian_in_group(
    (select cr.family_group_id from public.care_recipients cr where cr.id = care_recipient_id),
    (select auth.uid())::uuid
  )
);

create policy care_tasks_update
on public.care_tasks
for update
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.is_assigned_partner(id, (select auth.uid())::uuid)
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
)
with check (
  public.has_role((select auth.uid()), 'admin')
  or public.is_assigned_partner(id, (select auth.uid())::uuid)
  or public.can_access_care_recipient(care_recipient_id, (select auth.uid())::uuid)
);

create policy care_tasks_delete
on public.care_tasks
for delete
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or exists (
    select 1
    from public.care_recipients cr
    where cr.id = care_tasks.care_recipient_id
      and public.is_guardian_in_group(cr.family_group_id, (select auth.uid())::uuid)
  )
);

-- subscriptions
create policy subscriptions_select
on public.subscriptions
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or guardian_id = (select auth.uid())::uuid
  or public.is_family_member(family_group_id, (select auth.uid())::uuid)
);

create policy subscriptions_insert
on public.subscriptions
for insert
to authenticated
with check (
  public.has_role((select auth.uid()), 'admin')
  or (
    guardian_id = (select auth.uid())::uuid
    and public.is_guardian_in_group(family_group_id, (select auth.uid())::uuid)
  )
);

create policy subscriptions_update
on public.subscriptions
for update
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or (
    guardian_id = (select auth.uid())::uuid
    and public.is_family_member(family_group_id, (select auth.uid())::uuid)
  )
)
with check (
  public.has_role((select auth.uid()), 'admin')
  or (
    guardian_id = (select auth.uid())::uuid
    and public.is_family_member(family_group_id, (select auth.uid())::uuid)
  )
);

create policy subscriptions_delete
on public.subscriptions
for delete
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or (guardian_id = (select auth.uid())::uuid)
);

-- audit_logs: select limited, insert as self, update/delete 정책 없음(거부)
create policy audit_logs_select
on public.audit_logs
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or actor_id = (select auth.uid())::uuid
);

create policy audit_logs_insert
on public.audit_logs
for insert
to authenticated
with check (
  public.has_role((select auth.uid()), 'admin')
  or actor_id = (select auth.uid())::uuid
);
-- audit_logs: update/delete 는 정책 미부여 = authenticated 거부. service_role(서버)는 RLS 우회 가능(백엔드 전용).