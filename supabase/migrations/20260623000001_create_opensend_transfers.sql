-- OpenSend v0.1.2
-- Creates opensend_transfers table inside existing shared Supabase project.
-- All tables use opensend_ prefix to avoid collision with OpenSprout tables.
-- This migration is safe to run alongside existing OpenSprout tables.

-- ── Status enum ──────────────────────────────────────────────────
-- Represents the full lifecycle of a file transfer.
do $$ begin
  create type public.opensend_transfer_status as enum (
    'uploading',
    'scanning',
    'available',
    'expired',
    'blocked',
    'deleted'
  );
exception
  when duplicate_object then null;
end $$;

-- ── Transfers table ──────────────────────────────────────────────
create table if not exists public.opensend_transfers (
  id              uuid        default gen_random_uuid() primary key,
  user_id         uuid        references auth.users(id) on delete set null,
  file_name       text        not null,
  file_size       bigint      not null check (file_size > 0 and file_size <= 52428800), -- 50 MB max
  mime_type       text        not null default 'application/octet-stream',
  storage_path    text        not null,
  claim_code      text        not null,
  share_token_hash text       not null,
  password_hash   text,           -- bcrypt; null = no password
  virus_scan_status text      not null default 'pending' check (virus_scan_status in ('pending', 'scanning', 'clean', 'infected', 'error')),
  download_count  integer     not null default 0 check (download_count >= 0),
  download_limit  integer,        -- null = unlimited
  last_downloaded_at  timestamptz,
  status          public.opensend_transfer_status not null default 'uploading',
  expires_at      timestamptz not null default (now() + interval '24 hours'),
  sender_ip_hash  text,           -- SHA-256 of sender IP, for abuse tracking (not PII)
  sender_ua_hash  text,           -- SHA-256 of User-Agent
  reported_at     timestamptz,    -- abuse report timestamp
  blocked_at      timestamptz,    -- admin block
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────────
create index if not exists idx_opensend_transfers_user
  on public.opensend_transfers(user_id)
  where deleted_at is null;

create index if not exists idx_opensend_transfers_claim_code
  on public.opensend_transfers(claim_code);

create index if not exists idx_opensend_transfers_status
  on public.opensend_transfers(status);

create index if not exists idx_opensend_transfers_expires
  on public.opensend_transfers(expires_at)
  where status in ('uploading', 'scanning', 'available');

-- For the cleanup cron: expired available transfers
create index if not exists idx_opensend_transfers_expired_cleanup
  on public.opensend_transfers(expires_at)
  where status = 'available' and expires_at < now();

-- ── Triggers ─────────────────────────────────────────────────────
create or replace function public.opensend_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_opensend_transfers_updated_at
  before update on public.opensend_transfers
  for each row
  execute function public.opensend_touch_updated_at();

-- ── Row Level Security ───────────────────────────────────────────
alter table public.opensend_transfers enable row level security;

-- Owner sees all their own transfers (including expired/deleted)
create policy "opensend_users_view_own_transfers"
  on public.opensend_transfers for select
  using (auth.uid() = user_id);

-- Anyone with a claim code can view an available transfer
create policy "opensend_claim_code_download"
  on public.opensend_transfers for select
  using (
    status = 'available'
    and deleted_at is null
    and expires_at > now()
  );

-- Authenticated users can create transfers
create policy "opensend_users_create_transfers"
  on public.opensend_transfers for insert
  with check (auth.uid() = user_id);

-- Owners can update their own transfers (soft-delete, change status)
create policy "opensend_users_update_own_transfers"
  on public.opensend_transfers for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Helper function: increment download count ────────────────────
-- Called server-side (service role) during download.
create or replace function public.opensend_increment_download(target_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.opensend_transfers
  set
    download_count = download_count + 1,
    last_downloaded_at = now()
  where id = target_id
    and status = 'available'
    and deleted_at is null
    and expires_at > now()
    and (download_limit is null or download_count < download_limit);
end;
$$;
