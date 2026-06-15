create schema if not exists private;

grant usage on schema private to anon, authenticated, service_role;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
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

create or replace function private.is_superuser(target_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = target_user_id
      and role in ('superuser', 'superadmin')
      and is_active = true
      and deleted_at is null
  );
$$;

create or replace function public.credit_balance(target_user_id uuid)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(sum(amount_idr), 0)::integer
  from public.credit_ledger
  where user_id = target_user_id;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.is_superuser(uuid) from public;
grant execute on function private.is_superuser(uuid) to anon, authenticated, service_role;
revoke all on function public.credit_balance(uuid) from public, anon, authenticated;
grant execute on function public.credit_balance(uuid) to service_role;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (id = (select auth.uid()) or private.is_superuser((select auth.uid())));

drop policy if exists "profiles_update_admin_only" on public.profiles;
create policy "profiles_update_admin_only"
on public.profiles for update
to authenticated
using (private.is_superuser((select auth.uid())))
with check (private.is_superuser((select auth.uid())));

drop policy if exists "credit_select_own_or_admin" on public.credit_ledger;
create policy "credit_select_own_or_admin"
on public.credit_ledger for select
to authenticated
using (user_id = (select auth.uid()) or private.is_superuser((select auth.uid())));

drop policy if exists "jobs_select_own_or_admin" on public.jobs;
create policy "jobs_select_own_or_admin"
on public.jobs for select
to authenticated
using (user_id = (select auth.uid()) or private.is_superuser((select auth.uid())));

drop policy if exists "manual_payments_select_own_or_admin" on public.manual_payments;
create policy "manual_payments_select_own_or_admin"
on public.manual_payments for select
to authenticated
using (user_id = (select auth.uid()) or private.is_superuser((select auth.uid())));

drop policy if exists "manual_payments_insert_own" on public.manual_payments;
create policy "manual_payments_insert_own"
on public.manual_payments for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "pricing_rules_read" on public.pricing_rules;
create policy "pricing_rules_read"
on public.pricing_rules for select
to authenticated
using (active = true or private.is_superuser((select auth.uid())));

drop policy if exists "pricing_rules_admin_write" on public.pricing_rules;
drop policy if exists "pricing_rules_admin_insert" on public.pricing_rules;
drop policy if exists "pricing_rules_admin_update" on public.pricing_rules;
drop policy if exists "pricing_rules_admin_delete" on public.pricing_rules;
create policy "pricing_rules_admin_insert"
on public.pricing_rules for insert
to authenticated
with check (private.is_superuser((select auth.uid())));
create policy "pricing_rules_admin_update"
on public.pricing_rules for update
to authenticated
using (private.is_superuser((select auth.uid())))
with check (private.is_superuser((select auth.uid())));
create policy "pricing_rules_admin_delete"
on public.pricing_rules for delete
to authenticated
using (private.is_superuser((select auth.uid())));

drop policy if exists "app_settings_public_read" on public.app_settings;
create policy "app_settings_public_read"
on public.app_settings for select
to anon, authenticated
using (is_public = true or private.is_superuser((select auth.uid())));

drop policy if exists "app_settings_admin_write" on public.app_settings;
drop policy if exists "app_settings_admin_insert" on public.app_settings;
drop policy if exists "app_settings_admin_update" on public.app_settings;
drop policy if exists "app_settings_admin_delete" on public.app_settings;
create policy "app_settings_admin_insert"
on public.app_settings for insert
to authenticated
with check (private.is_superuser((select auth.uid())));
create policy "app_settings_admin_update"
on public.app_settings for update
to authenticated
using (private.is_superuser((select auth.uid())))
with check (private.is_superuser((select auth.uid())));
create policy "app_settings_admin_delete"
on public.app_settings for delete
to authenticated
using (private.is_superuser((select auth.uid())));

drop policy if exists "contact_messages_admin_read" on public.contact_messages;
create policy "contact_messages_admin_read"
on public.contact_messages for select
to authenticated
using (private.is_superuser((select auth.uid())));

drop policy if exists "contact_messages_admin_write" on public.contact_messages;
drop policy if exists "contact_messages_admin_insert" on public.contact_messages;
drop policy if exists "contact_messages_admin_update" on public.contact_messages;
drop policy if exists "contact_messages_admin_delete" on public.contact_messages;
create policy "contact_messages_admin_insert"
on public.contact_messages for insert
to authenticated
with check (private.is_superuser((select auth.uid())));
create policy "contact_messages_admin_update"
on public.contact_messages for update
to authenticated
using (private.is_superuser((select auth.uid())))
with check (private.is_superuser((select auth.uid())));
create policy "contact_messages_admin_delete"
on public.contact_messages for delete
to authenticated
using (private.is_superuser((select auth.uid())));

create index if not exists credit_ledger_created_by_idx on public.credit_ledger (created_by) where created_by is not null;
create unique index if not exists jobs_ai_ledger_id_unique_idx on public.jobs (ai_ledger_id) where ai_ledger_id is not null;
create index if not exists manual_payments_approved_by_idx on public.manual_payments (approved_by) where approved_by is not null;

drop function if exists public.handle_new_user();
drop function if exists public.is_superuser(uuid);
