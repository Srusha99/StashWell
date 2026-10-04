-- Messages from the Support dialog in the account menu
-- (components/auth/support-dialog.tsx): bug reports, feature requests and
-- general questions.
--
-- Only signed-in users can open that dialog, so unlike uninstall_feedback
-- the insert is limited to the authenticated role, and who sent a message is
-- never taken from the client: user_id and email default from the caller's
-- JWT, and the insert grant leaves both columns out, so a request can't claim
-- to come from someone else. Nobody can read, change or delete rows through
-- the API - read them in the Supabase dashboard (Table Editor ->
-- support_requests) or with the service role, and reply to the row's email.
--
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to run again.

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email text default (auth.jwt() ->> 'email'),
  -- Keep in sync with CATEGORIES in components/auth/support-dialog.tsx.
  category text not null check (category in ('bug', 'feature', 'question')),
  -- Keep the limit in sync with MAX_MESSAGE_LENGTH in the same file.
  message text not null check (char_length(message) <= 5000 and btrim(message) <> ''),
  -- Context for bug reports, filled in by the dialog rather than the user.
  extension_version text check (char_length(extension_version) <= 32),
  user_agent text check (char_length(user_agent) <= 512)
);

alter table public.support_requests enable row level security;

drop policy if exists "Users can send support requests" on public.support_requests;
create policy "Users can send support requests"
  on public.support_requests
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Insert only, and only the columns the dialog fills in: no select grant, so
-- the dialog inserts without asking for the row back.
revoke all on public.support_requests from anon, authenticated;
grant insert (category, message, extension_version, user_agent)
  on public.support_requests to authenticated;
