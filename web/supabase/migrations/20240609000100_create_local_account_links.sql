create table if not exists public.local_account_links (
  local_profile_id text primary key,
  auth_user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  username text not null,
  password_ciphertext text not null,
  app_metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists local_account_links_username_key
  on public.local_account_links (username);

create unique index if not exists local_account_links_auth_user_id_key
  on public.local_account_links (auth_user_id);
