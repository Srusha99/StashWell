-- One row per user holding everything the dashboard syncs between devices
-- (lib/dashboard-sync-engine.ts): card layouts, saved tab sessions and the
-- kanban board. Replaces the saved_sessions and dashboard_layouts columns on
-- user_profiles, which nothing reads any more - they're left in place, not
-- dropped, so nothing is lost if this needs rolling back.
--
-- updated_at doubles as the row's version: a device saves only if the row is
-- still at the updated_at it read (see updateDashboard in
-- lib/dashboard-sync-service.ts), so two devices saving at once can't
-- silently overwrite each other. That's why the trigger uses
-- clock_timestamp() rather than now(), which is fixed per transaction.
--
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to run again.

create table if not exists public.user_dashboards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  -- { version, workspaces: { <workspace key>: { byCount, primaryCount } } } -
  -- folder titles are hashed, never stored (lib/dashboard-sync-layouts.ts).
  workspace_layout jsonb,
  -- Saved tab sessions, keyed by session id (lib/session-bundles.ts).
  session_bundles jsonb,
  -- The kanban board's cards, in board order (lib/kanban.ts).
  todos jsonb,
  updated_at timestamptz not null default clock_timestamp()
);

create or replace function public.set_user_dashboards_updated_at()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.user_dashboards;
create trigger set_updated_at
  before update on public.user_dashboards
  for each row
  execute function public.set_user_dashboards_updated_at();

alter table public.user_dashboards enable row level security;

drop policy if exists "Users can view own dashboard" on public.user_dashboards;
create policy "Users can view own dashboard"
  on public.user_dashboards
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own dashboard" on public.user_dashboards;
create policy "Users can insert own dashboard"
  on public.user_dashboards
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own dashboard" on public.user_dashboards;
create policy "Users can update own dashboard"
  on public.user_dashboards
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Signed-in users only, and no delete: clearing data on one device must never
-- be able to wipe what the others sync from.
revoke all on public.user_dashboards from anon, authenticated;
grant select, insert, update on public.user_dashboards to authenticated;

-- Carry over the sessions each user already synced. Layouts can't be: the old
-- column stored folder ids, which only mean something on the device that
-- saved them. Each device uploads its own arrangement on its first sync.
insert into public.user_dashboards (user_id, session_bundles)
select user_id, saved_sessions
from public.user_profiles
where saved_sessions is not null
on conflict (user_id) do nothing;
