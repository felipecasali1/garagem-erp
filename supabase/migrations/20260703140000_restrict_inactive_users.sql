create or replace function public.is_authenticated()
returns boolean
language sql
stable
as $$
  select coalesce(
    (
      select true
      from public.users as u
      where u.auth_user_id = auth.uid()
        and u.active = true
      limit 1
    ),
    false
  );
$$;

drop policy if exists "users_select_self_or_management" on public.users;

create policy "users_select_self_or_management"
  on public.users
  for select
  using (
    (auth.uid() = auth_user_id and active = true)
    or public.has_any_role(array['admin', 'manager']::user_access_role[])
  );
