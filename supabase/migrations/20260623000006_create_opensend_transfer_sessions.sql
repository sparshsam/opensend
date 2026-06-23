-- OpenSend v0.2.0
-- Transfer sessions for device-to-device transfer coordination.
-- A session tracks a pending file transfer between two devices.
-- Connection can be direct (WebRTC P2P) or relay (Supabase Storage fallback).

-- Add new statuses for P2P transfer lifecycle
do $$ begin
  alter type public.opensend_transfer_status add value 'pending' before 'uploading';
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter type public.opensend_transfer_status add value 'waiting' after 'pending';
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter type public.opensend_transfer_status add value 'transferring' after 'scanning';
exception
  when duplicate_object then null;
end $$;

-- Transfer session status
do $$ begin
  create type public.opensend_session_status as enum (
    'waiting',
    'pending_accept',
    'accepted',
    'declined',
    'relay',
    'transferring',
    'completed',
    'failed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

-- Connection type
do $$ begin
  create type public.opensend_connection_type as enum (
    'direct',
    'relay',
    'unknown'
  );
exception
  when duplicate_object then null;
end $$;

-- Transfer sessions coordinate P2P or relay transfers between devices
create table if not exists public.opensend_transfer_sessions (
  id              uuid        default gen_random_uuid() primary key,
  sender_id       uuid        references auth.users(id) on delete set null,
  receiver_id     uuid        references auth.users(id) on delete set null,
  sender_device_id    uuid    references public.opensend_devices(id) on delete set null,
  receiver_device_id  uuid    references public.opensend_devices(id) on delete set null,
  status          public.opensend_session_status not null default 'waiting',
  connection_type public.opensend_connection_type not null default 'unknown',
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_opensend_sessions_sender
  on public.opensend_transfer_sessions(sender_id);

create index if not exists idx_opensend_sessions_receiver
  on public.opensend_transfer_sessions(receiver_id);

create index if not exists idx_opensend_sessions_status
  on public.opensend_transfer_sessions(status);

create trigger trg_opensend_sessions_updated_at
  before update on public.opensend_transfer_sessions
  for each row
  execute function public.opensend_touch_updated_at();

alter table public.opensend_transfer_sessions enable row level security;

create policy "opensend_users_view_own_sessions"
  on public.opensend_transfer_sessions for select
  using (sender_id = auth.uid() or receiver_id = auth.uid());

create policy "opensend_users_insert_sessions"
  on public.opensend_transfer_sessions for insert
  with check (sender_id = auth.uid());

create policy "opensend_users_update_own_sessions"
  on public.opensend_transfer_sessions for update
  using (sender_id = auth.uid() or receiver_id = auth.uid())
  with check (sender_id = auth.uid() or receiver_id = auth.uid());
