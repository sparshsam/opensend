-- OpenSend v0.1.2
-- Transfer events table for audit logging / abuse tracking.
-- Each event is an immutable log entry recording what happened, when,
-- and basic request metadata (no PII).

create table if not exists public.opensend_transfer_events (
  id              uuid        default gen_random_uuid() primary key,
  transfer_id     uuid        references public.opensend_transfers(id) on delete cascade,
  user_id         uuid,       -- nullable (anonymous downloads)
  event_type      text        not null check (event_type in (
    'upload_started', 'upload_completed', 'upload_failed',
    'scan_started', 'scan_completed', 'scan_failed',
    'download_started', 'download_completed',
    'expired', 'deleted', 'blocked', 'reported',
    'password_attempt', 'password_correct'
  )),
  metadata        jsonb,          -- flexible: error messages, file size, etc.
  ip_hash         text,           -- SHA-256 of IP (not raw IP)
  ua_hash         text,           -- SHA-256 of User-Agent
  created_at      timestamptz not null default now()
);

create index if not exists idx_opensend_events_transfer
  on public.opensend_transfer_events(transfer_id);

create index if not exists idx_opensend_events_type
  on public.opensend_transfer_events(event_type);

create index if not exists idx_opensend_events_created
  on public.opensend_transfer_events(created_at);

alter table public.opensend_transfer_events enable row level security;

-- Owners can view events for their transfers
create policy "opensend_users_view_own_events"
  on public.opensend_transfer_events for select
  using (auth.uid() = user_id);

-- Service role inserts events (app code, not direct user)
create policy "opensend_service_insert_events"
  on public.opensend_transfer_events for insert
  with check (true);
