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

  insert into public.credit_ledger (user_id, amount_idr, kind, reason, created_by, metadata)
  select
    new.id,
    6000,
    'credit',
    'signup_free_credit',
    new.id,
    jsonb_build_object(
      'source', 'signup_bonus',
      'freeCredits', 3,
      'unitPriceIdr', 2000
    )
  where not exists (
      select 1
      from public.credit_ledger
      where user_id = new.id
        and reason = 'signup_free_credit'
    );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.credit_ledger (user_id, amount_idr, kind, reason, created_by, metadata)
select
  profiles.id,
  6000,
  'credit',
  'signup_free_credit',
  profiles.id,
  jsonb_build_object(
    'source', 'backfill_signup_bonus',
    'freeCredits', 3,
    'unitPriceIdr', 2000
  )
from public.profiles
where not exists (
    select 1
    from public.credit_ledger
    where credit_ledger.user_id = profiles.id
      and credit_ledger.reason = 'signup_free_credit'
  );
