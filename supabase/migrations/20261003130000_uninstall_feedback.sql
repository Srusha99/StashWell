-- Answers from the "We're sorry to see you go" page (website/uninstalled/),
-- which Chrome opens after StashWell is removed (see setUninstallURL in
-- public/background.js).
--
-- That page runs on stashwell.app, signed out, so it writes with the public
-- anon key. Row-level security therefore lets anyone add a row but nobody
-- read, change or delete one through the API - read responses in the Supabase
-- dashboard (Table Editor -> uninstall_feedback) or with the service role.
-- The check constraints are what stop the open insert being used to store
-- anything other than a short survey answer.
--
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to run again.

create table if not exists public.uninstall_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Keep in sync with REASONS in website/uninstalled/index.html.
  reason text not null
    check (reason in ('bug', 'too-complicated', 'missing-feature', 'switched-tool', 'cleanup', 'other')),
  -- The follow-up answer for missing-feature, switched-tool and other.
  detail text check (char_length(detail) <= 300),
  comments text check (char_length(comments) <= 2000),
  email text check (
    email is null
    or (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  ),
  -- From the uninstall URL's ?v=, so feedback can be tied to a release.
  extension_version text check (char_length(extension_version) <= 32)
);

alter table public.uninstall_feedback enable row level security;

drop policy if exists "Anyone can send uninstall feedback" on public.uninstall_feedback;
create policy "Anyone can send uninstall feedback"
  on public.uninstall_feedback
  for insert
  to anon, authenticated
  with check (true);

-- Insert only: no select grant, so the page posts with "Prefer: return=minimal"
-- and never gets rows back.
revoke all on public.uninstall_feedback from anon, authenticated;
grant insert on public.uninstall_feedback to anon, authenticated;
