-- OpenSend v0.2.10 — Multi-file session support
-- Add columns to opensend_guest_sessions for batch transfer metadata

alter table public.opensend_guest_sessions
  add column if not exists file_count     integer not null default 1,
  add column if not exists total_size     bigint,
  add column if not exists transfer_type  text not null default 'single'
    check (transfer_type in ('single', 'batch'));
