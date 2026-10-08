-- Live sync (lib/dashboard-sync-service.ts subscribeRemoteChanges): publishes
-- changes to each user's synced rows over Supabase Realtime, so a Pro user's
-- other PCs pull a change within a second instead of on their next poll.
-- Run after 20261005160000_user_bookmarks_and_settings.sql.
--
-- Nothing new is exposed: Realtime checks the existing "Users can view own
-- ..." select policies, so each user only hears about their own rows.
--
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to run again.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_dashboards'
  ) then
    alter publication supabase_realtime add table public.user_dashboards;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_bookmarks'
  ) then
    alter publication supabase_realtime add table public.user_bookmarks;
  end if;
end;
$$;
