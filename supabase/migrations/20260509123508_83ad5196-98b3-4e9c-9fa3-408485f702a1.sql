insert into storage.buckets (id, name, public) values ('tip-covers', 'tip-covers', true) on conflict (id) do nothing;
create policy "Tip covers public read" on storage.objects for select using (bucket_id = 'tip-covers');
create policy "Admins write tip covers" on storage.objects for insert with check (bucket_id = 'tip-covers' and has_role(auth.uid(), 'admin'::app_role));
create policy "Admins update tip covers" on storage.objects for update using (bucket_id = 'tip-covers' and has_role(auth.uid(), 'admin'::app_role));