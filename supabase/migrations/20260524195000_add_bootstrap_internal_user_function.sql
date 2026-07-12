create or replace function public.bootstrap_internal_user(
  p_auth_email text,
  p_name text,
  p_position text default 'Administrador',
  p_access_role user_access_role default 'admin',
  p_is_admin boolean default true,
  p_person_type person_type default 'individual',
  p_phone text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid;
  v_person_id bigint;
  v_employee_id bigint;
  v_user_id bigint;
begin
  select au.id
  into v_auth_user_id
  from auth.users as au
  where lower(au.email) = lower(p_auth_email)
  limit 1;

  if v_auth_user_id is null then
    raise exception 'No auth.users record found for email %.', p_auth_email;
  end if;

  if exists (
    select 1
    from public.users as u
    where u.auth_user_id = v_auth_user_id
  ) then
    raise exception 'A public.users record already exists for email %.', p_auth_email;
  end if;

  insert into public.people (
    name,
    type,
    phone,
    email,
    notes
  )
  values (
    p_name,
    p_person_type,
    p_phone,
    p_auth_email,
    'Bootstrap internal user'
  )
  returning id into v_person_id;

  insert into public.employees (
    person_id,
    position,
    salary,
    commission_rate,
    commission_type,
    active,
    hired_at,
    notes
  )
  values (
    v_person_id,
    p_position,
    0,
    0,
    'percentage',
    true,
    current_date,
    'Bootstrap internal employee'
  )
  returning id into v_employee_id;

  insert into public.users (
    auth_user_id,
    person_id,
    employee_id,
    access_role,
    is_admin,
    active,
    email_verified_at,
    invited_at
  )
  select
    v_auth_user_id,
    v_person_id,
    v_employee_id,
    p_access_role,
    p_is_admin,
    true,
    au.email_confirmed_at,
    timezone('utc', now())
  from auth.users as au
  where au.id = v_auth_user_id
  returning id into v_user_id;

  return v_user_id;
end;
$$;

revoke all on function public.bootstrap_internal_user(
  text,
  text,
  text,
  user_access_role,
  boolean,
  person_type,
  text
) from public;
