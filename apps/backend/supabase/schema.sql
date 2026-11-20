-- Verba backend schema for STORAGE=supabase.
-- Run once in the Supabase SQL editor. The backend connects with the service-role key,
-- which bypasses RLS; RLS is enabled with no public policies so anon/authenticated
-- clients can read nothing.

create table if not exists public.user_settings (
  user_id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.custom_assistants (
  id text primary key,
  user_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists custom_assistants_user_created_idx
  on public.custom_assistants (user_id, created_at);

create table if not exists public.history_items (
  id text primary key,
  user_id text not null,
  type text not null,
  favorite boolean not null default false,
  input text not null,
  output text not null,
  meta jsonb not null default '{}'::jsonb,
  client text not null check (client in ('web', 'extension')),
  created_at timestamptz not null default now()
);
create index if not exists history_items_user_created_idx
  on public.history_items (user_id, created_at desc);
create index if not exists history_items_user_favorite_idx
  on public.history_items (user_id, favorite);

create table if not exists public.provider_configs (
  user_id text not null,
  provider_id text not null,
  data jsonb not null,
  primary key (user_id, provider_id)
);

create table if not exists public.usage_stats (
  user_id text not null,
  provider_id text not null,
  data jsonb not null,
  primary key (user_id, provider_id)
);

create table if not exists public.activity_stats (
  user_id text primary key,
  data jsonb not null
);

create table if not exists public.extension_status (
  user_id text primary key,
  data jsonb not null
);

-- Email + password accounts (and Google-linked accounts). password_hash is an scrypt string, never the password.
-- google_sub is the Google "sub" claim once linked. Both are unique; NULLs do not collide in Postgres.
create table if not exists public.app_users (
  id text primary key,
  name text not null,
  email text unique not null,
  password_hash text null,
  google_sub text unique null,
  role text not null default 'user' check (role in ('admin', 'user')),
  plan text not null default 'free' check (plan in ('free', 'unlimited')),
  must_change_password boolean not null default false,
  disabled boolean not null default false,
  daily_limit int null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz null
);

-- Login sessions. token_hash is sha256 hex of the bearer token; the token itself is never stored.
create table if not exists public.app_sessions (
  id text primary key,
  user_id text not null references public.app_users (id) on delete cascade,
  token_hash text unique not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists app_sessions_user_id_idx on public.app_sessions (user_id);
create index if not exists app_sessions_expires_at_idx on public.app_sessions (expires_at);

-- Server-wide settings. Single row, always id = 'global'.
create table if not exists public.app_config (
  id text primary key default 'global' check (id = 'global'),
  default_daily_limit int null,
  provider_daily_quotas jsonb not null default '{}'::jsonb,
  signups_enabled boolean not null default true
);

-- Translation credits per user. daily: "YYYY-MM-DD" -> count (backend keeps the last 62 days).
create table if not exists public.credit_ledgers (
  user_id text primary key,
  daily jsonb not null default '{}'::jsonb,
  total int not null default 0
);

alter table public.user_settings enable row level security;
alter table public.custom_assistants enable row level security;
alter table public.history_items enable row level security;
alter table public.provider_configs enable row level security;
alter table public.usage_stats enable row level security;
alter table public.activity_stats enable row level security;
alter table public.extension_status enable row level security;
alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.app_config enable row level security;
alter table public.credit_ledgers enable row level security;

-- Product feedback from the extension. Not deleted with the account (no FK); read it in the Supabase table editor.
create table if not exists public.feedback (
  id text primary key,
  user_id text not null,
  category text not null check (category in ('idea', 'bug', 'other')),
  message text not null check (char_length(message) <= 2000),
  client text not null check (client in ('web', 'extension')),
  version text null,
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_idx on public.feedback (created_at desc);
alter table public.feedback enable row level security;
