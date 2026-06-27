-- OpenSend v0.9.1
-- Add is_favorite column to opensend_transfers for transfer favorites feature.
-- Used by the PATCH /api/transfers/favorite endpoint.

alter table public.opensend_transfers
  add column if not exists is_favorite boolean not null default false;

-- Index for querying favorites efficiently
create index if not exists idx_opensend_transfers_favorites
  on public.opensend_transfers(user_id, is_favorite)
  where is_favorite = true and deleted_at is null;
