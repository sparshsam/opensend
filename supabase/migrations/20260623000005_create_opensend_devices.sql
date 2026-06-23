-- OpenSend v0.2.0
-- Device system for direct device-to-device transfers.
-- Each registered device is owned by a user and has platform metadata.

create table if not exists public.opensend_devices (
  id              uuid        default gen_random_uuid() primary key,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  name            text        not null default 'Unknown Device',
  platform        text        not null check (platform in ('windows', 'android', 'ios', 'macos', 'linux', 'web')),
  browser         text,
  os              text,
  device_type     text        not null default 'desktop' check (device_type in ('desktop', 'mobile', 'tablet')),
  fingerprint     text,           -- unique device identifier (SHA-256 of UA + screen + platform)
  is_current      boolean     not null default false,
  last_seen_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(user_id, fingerprint)
);

create index if not exists idx_opensend_devices_user
  on public.opensend_devices(user_id);

create index if not exists idx_opensend_devices_current
  on public.opensend_devices(user_id, is_current) where is_current = true;

-- Trigger for updated_at
create trigger trg_opensend_devices_updated_at
  before update on public.opensend_devices
  for each row
  execute function public.opensend_touch_updated_at();

alter table public.opensend_devices enable row level security;

create policy "opensend_users_manage_own_devices"
  on public.opensend_devices
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
