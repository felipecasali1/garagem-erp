drop function public.set_employee_active_status(bigint, boolean);

create function public.set_employee_active_status(
  p_employee_id bigint, p_active boolean, p_expected_updated_at timestamptz
) returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_employee public.employees%rowtype;
begin
  if not public.has_any_role(array['admin', 'manager']::public.user_access_role[]) then
    raise exception using errcode = '42501', message = 'Permissão negada para alterar status de funcionário.';
  end if;
  if p_employee_id is null or p_active is null or p_expected_updated_at is null then
    raise exception using errcode = '22023', message = 'Os dados do funcionário são inválidos.';
  end if;
  select * into v_employee from public.employees where id = p_employee_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'Funcionário não encontrado.';
  end if;
  if v_employee.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'PT409', message = 'STALE_RECORD: o funcionário mudou. Atualize os dados e escolha novamente.';
  end if;
  if v_employee.active is distinct from p_active then
    update public.employees set active = p_active where id = p_employee_id;
  end if;
end;
$$;
revoke all on function public.set_employee_active_status(bigint, boolean, timestamptz) from public;
grant execute on function public.set_employee_active_status(bigint, boolean, timestamptz) to authenticated;

create function public.guard_employee_active_update() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.active is distinct from old.active and current_user in ('authenticated', 'anon') then
    raise exception using errcode = '42501', message = 'Altere o status pelo comando de funcionário.';
  end if;
  return new;
end;
$$;
create trigger guard_employee_active_update before update on public.employees
for each row execute function public.guard_employee_active_update();
