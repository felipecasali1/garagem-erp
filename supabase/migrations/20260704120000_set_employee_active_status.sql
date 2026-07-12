create or replace function public.set_employee_active_status(
  p_employee_id bigint,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_any_role(array['admin', 'manager']::user_access_role[]) then
    raise exception 'Permissao negada para alterar status de funcionario.';
  end if;

  update public.employees
  set active = p_active
  where id = p_employee_id;

  update public.users
  set active = p_active
  where employee_id = p_employee_id;
end;
$$;

revoke all on function public.set_employee_active_status(bigint, boolean) from public;
