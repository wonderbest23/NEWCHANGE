update public.care_recipients
set call_window_start = '08:00:00',
    call_window_end = '23:00:00',
    updated_at = now()
where id = 'b2e55e87-f0d7-4d50-b971-bae080407773';