create table if not exists public.signup_bonus_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null default '',
  device_id_hash text,
  ip_hash text,
  country_code text,
  bonus_granted boolean not null default false,
  reason text not null default 'limit_reached',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists signup_bonus_claims_user_id_key on public.signup_bonus_claims (user_id);
create index if not exists signup_bonus_claims_device_hash_idx on public.signup_bonus_claims (device_id_hash) where device_id_hash is not null;
create index if not exists signup_bonus_claims_ip_hash_idx on public.signup_bonus_claims (ip_hash) where ip_hash is not null;
create index if not exists signup_bonus_claims_created_at_idx on public.signup_bonus_claims (created_at desc);

alter table public.signup_bonus_claims enable row level security;

drop policy if exists "signup_bonus_claims_select_own_or_admin" on public.signup_bonus_claims;
create policy "signup_bonus_claims_select_own_or_admin"
on public.signup_bonus_claims for select
to authenticated
using (user_id = (select auth.uid()) or private.is_superuser((select auth.uid())));

create or replace function public.handle_new_user()
returns trigger
set search_path = public
language plpgsql
security definer
as $$
declare
  user_email text := lower(coalesce(new.email, ''));
begin
  insert into public.profiles (id, email, full_name, role, is_unlimited, is_active, deleted_at)
  values (
    new.id,
    user_email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', user_email),
    case when user_email = 'jho.j80@gmail.com' then 'superuser' else 'user' end,
    user_email = 'jho.j80@gmail.com',
    true,
    null
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        role = case when excluded.email = 'jho.j80@gmail.com' then 'superuser' else public.profiles.role end,
        is_unlimited = case when excluded.email = 'jho.j80@gmail.com' then true else public.profiles.is_unlimited end,
        is_active = coalesce(public.profiles.is_active, true),
        deleted_at = case when excluded.email = 'jho.j80@gmail.com' then null else public.profiles.deleted_at end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
