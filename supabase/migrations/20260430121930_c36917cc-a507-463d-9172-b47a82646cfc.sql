do $$
begin
  if exists (select 1 from public.care_recipients where id = 'b2e55e87-f0d7-4d50-b971-bae080407773') then
    update public.care_recipients
    set phone_e164 = '+821086859866',
        call_window_start = '09:00:00',
        call_window_end = '20:00:00',
        do_not_disturb = false,
        status = 'active',
        timezone = 'Asia/Seoul',
        updated_at = now()
    where id = 'b2e55e87-f0d7-4d50-b971-bae080407773';

    insert into public.outbound_call_jobs (
      care_recipient_id, scheduled_at, window_start, window_end, status, reason
    ) values (
      'b2e55e87-f0d7-4d50-b971-bae080407773',
      now(),
      now(),
      now() + interval '30 minutes',
      'queued',
      'manual_internal_test'
    );
  end if;
end $$;