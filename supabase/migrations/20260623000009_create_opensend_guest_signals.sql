-- OpenSend v0.2.4 — Guest signaling messages
-- HTTP polling-based signaling for guest transfers.
-- No Supabase Realtime, no WebSocket, no account required.
-- Messages are stored temporarily and auto-cleaned.

create table if not exists public.opensend_guest_signals (
  id          uuid        default gen_random_uuid() primary key,
  session_id  uuid        not null references public.opensend_guest_sessions(id) on delete cascade,
  sender_type text        not null check (sender_type in ('sender', 'receiver')),
  message_type text       not null,
  payload     jsonb       not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_opensend_guest_signals_session
  on public.opensend_guest_signals(session_id, created_at);

-- Auto-cleanup: delete signals older than 1 hour
create index if not exists idx_opensend_guest_signals_cleanup
  on public.opensend_guest_signals(created_at);

alter table public.opensend_guest_signals enable row level security;

-- Anyone can insert signals (guarded by session existence)
create policy "opensend_guest_signals_insert"
  on public.opensend_guest_signals for insert
  with check (true);

-- Anyone can read signals for a session (guarded by session secret elsewhere)
create policy "opensend_guest_signals_select"
  on public.opensend_guest_signals for select
  using (true);
