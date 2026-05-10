do $$
begin
  perform cron.unschedule('ingest-welfare-monthly');
exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('ingest-events-daily');
exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('ingest-rss-hourly');
exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('ingest-embeddings-daily');
exception when others then null;
end $$;