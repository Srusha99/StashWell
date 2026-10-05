-- Bookmark sync and appearance-settings sync (lib/bookmark-sync.ts,
-- lib/settings-sync.ts). Run after 20261005120000_user_dashboards.sql.
--
--  - user_dashboards.settings: the Appearance panel's settings, field by field.
--    Uploaded backgrounds stay on the device they were added on.
--  - user_bookmarks: one row per user holding the bookmarks the dashboard
--    shows - the Bookmarks Bar and the "StashWell Workspaces" folder - as a
--    plain tree of titles and URLs (Chrome's ids differ per device, so none
--    are stored). updated_at is the row's version, exactly as on
--    user_dashboards, so two devices saving at once can't overwrite each other.
--
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to run again.

alter table public.user_dashboards add column if not exists settings jsonb;

create table if not exists public.user_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  -- { version, bar: [...], workspaces: [...] }, each node { title, url } or
  -- { title, children }.
  bookmark_tree jsonb,
  updated_at timestamptz not null default clock_timestamp()
);

create or replace function public.set_row_updated_at()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.user_bookmarks;
create trigger set_updated_at
  before update on public.user_bookmarks
  for each row
  execute function public.set_row_updated_at();

alter table public.user_bookmarks enable row level security;

drop policy if exists "Users can view own bookmarks" on public.user_bookmarks;
create policy "Users can view own bookmarks"
  on public.user_bookmarks
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own bookmarks" on public.user_bookmarks;
create policy "Users can insert own bookmarks"
  on public.user_bookmarks
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own bookmarks" on public.user_bookmarks;
create policy "Users can update own bookmarks"
  on public.user_bookmarks
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Signed-in users only, and no delete - same reasoning as user_dashboards.
revoke all on public.user_bookmarks from anon, authenticated;
grant select, insert, update on public.user_bookmarks to authenticated;
