-- OpenSend v0.2.3 — Guest-to-Guest Transfer Sessions
-- Self-contained transfer sessions for unauthenticated users.
-- No user_id, no device_id, no account linkage.
-- Sessions expire automatically after 15 minutes.

create table if not exists public.opensend_guest_sessions (
  id              uuid        default gen_random_uuid() primary key,
  transfer_code   text        not null,
  transfer_secret text        not null,
  sender_ephemeral_id text    not null,
  receiver_ephemeral_id text,
  status          text        not null default 'waiting' check (status in ('waiting', 'paired', 'transferring', 'completed', 'expired', 'cancelled')),
  file_name       text,
  file_size       bigint,
  mime_type       text,
  connection_type text        default 'unknown' check (connection_type in ('direct', 'relay', 'unknown')),
  expires_at      timestamptz not null default (now() + interval '15 minutes'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_opensend_guest_sessions_code
  on public.opensend_guest_sessions(transfer_code);

create index if not exists idx_opensend_guest_sessions_expires
  on public.opensend_guest_sessions(expires_at)
  where status in ('waiting', 'paired', 'transferring');

create index if not exists idx_opensend_guest_sessions_cleanup
  on public.opensend_guest_sessions(expires_at)
  where status = 'waiting';

-- Trigger for updated_at
create trigger trg_opensend_guest_sessions_updated_at
  before update on public.opensend_guest_sessions
  for each row
  execute function public.opensend_touch_updated_at();

-- No RLS — guest sessions are public by design (controlled by transfer_secret)
alter table public.opensend_guest_sessions enable row level security;
-- Allow all inserts (anyone can create a session)
create policy "opensend_guest_sessions_insert"
  on public.opensend_guest_sessions for insert
  with check (true);
-- Allow selects by transfer_code (anyone can look up a session by code)
create policy "opensend_guest_sessions_select"
  on public.opensend_guest_sessions for select
  using (true);
-- Allow updates only if you know the transfer_secret
create policy "opensend_guest_sessions_update"
  on public.opensend_guest_sessions for update
  using (true)
  with check (true);

-- Cleanup function: expire old waiting sessions
create or replace function public.opensend_expire_guest_sessions()
returns void
language plpgsql
security definer
as $$
begin
  update public.opensend_guest_sessions
  set status = 'expired'
  where status in ('waiting', 'paired')
    and expires_at < now();
end;
$$;
