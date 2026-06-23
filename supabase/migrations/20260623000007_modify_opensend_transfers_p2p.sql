-- OpenSend v0.2.0
-- Modify opensend_transfers to support P2P sessions and checksums.
-- All existing columns remain for cloud storage fallback.

-- Add session support columns
alter table public.opensend_transfers
  add column if not exists session_id uuid references public.opensend_transfer_sessions(id) on delete set null;

alter table public.opensend_transfers
  add column if not exists checksum text;

alter table public.opensend_transfers
  add column if not exists sender_device_id uuid references public.opensend_devices(id) on delete set null;

alter table public.opensend_transfers
  add column if not exists receiver_device_id uuid references public.opensend_devices(id) on delete set null;

-- Make storage_path nullable (P2P transfers don't upload to cloud)
alter table public.opensend_transfers
  alter column storage_path drop not null;

-- Make claim_code nullable (P2P doesn't need claim codes)
alter table public.opensend_transfers
  alter column share_token_hash drop not null;

-- Indexes for session-based queries
create index if not exists idx_opensend_transfers_session
  on public.opensend_transfers(session_id);

create index if not exists idx_opensend_transfers_sender_device
  on public.opensend_transfers(sender_device_id);

create index if not exists idx_opensend_transfers_receiver_device
  on public.opensend_transfers(receiver_device_id);
