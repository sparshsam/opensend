-- OpenSend v0.1.2
-- MCP access tokens for AI agent integration (e.g., Hermes Agent).
-- Prefixed to live alongside OpenSprout's own mcp_tokens table.

create table if not exists public.opensend_mcp_tokens (
  id            uuid        default gen_random_uuid() primary key,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  name          text        not null,
  token_hash    text        not null,
  token_prefix  text        not null,
  last_used_at  timestamptz,
  created_at    timestamptz default now(),
  revoked_at    timestamptz
);

create index if not exists idx_opensend_mcp_tokens_user
  on public.opensend_mcp_tokens(user_id);

alter table public.opensend_mcp_tokens enable row level security;

create policy "opensend_users_manage_own_tokens"
  on public.opensend_mcp_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
