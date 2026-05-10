do $$
begin
  if exists (select 1 from public.care_recipients where id = 'b2e55e87-f0d7-4d50-b971-bae080407773') then
    insert into public.outbound_call_jobs (
      care_recipient_id, scheduled_at, window_start, window_end, status, reason
    ) values (
      'b2e55e87-f0d7-4d50-b971-bae080407773',
      now(), now(), now() + interval '30 minutes',
      'queued', 'manual_internal_test_2'
    );
  end if;
end $$;