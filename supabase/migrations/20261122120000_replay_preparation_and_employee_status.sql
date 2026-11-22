create table public.status_command_requests (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  vehicle_id bigint references public.vehicles(id) on delete cascade,
  employee_id bigint references public.employees(id) on delete cascade,
  request_payload jsonb not null,
  result jsonb,
  primary key (auth_user_id, idempotency_key)
);
alter table public.status_command_requests enable row level security;
revoke all on public.status_command_requests from public, anon, authenticated, service_role;

create function public.finish_vehicle_preparation_idempotent(
  p_idempotency_key uuid, p_vehicle_id bigint, p_expected_updated_at timestamptz
) returns public.vehicles language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_payload jsonb;
  v_existing public.status_command_requests%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_inserted integer;
begin
  perform public.assert_vehicle_sales_access();
  if p_idempotency_key is null or p_vehicle_id is null or p_expected_updated_at is null then
    raise exception using errcode = '22023', message = 'Os dados da preparação são inválidos.';
  end if;
  v_payload := jsonb_build_object('command', 'finish_preparation', 'vehicle_id', p_vehicle_id, 'expected_updated_at', p_expected_updated_at);
  insert into public.status_command_requests(auth_user_id, idempotency_key, request_payload)
    values (auth.uid(), p_idempotency_key, v_payload) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_existing from public.status_command_requests
    where auth_user_id = auth.uid() and idempotency_key = p_idempotency_key for update;
  if v_inserted = 0 then
    if v_existing.request_payload is distinct from v_payload then
      raise exception using errcode = '23505', message = 'Esta chave de idempotência já foi usada para outra operação.';
    end if;
    return jsonb_populate_record(null::public.vehicles, v_existing.result);
  end if;
  v_vehicle := public.finish_vehicle_preparation(p_vehicle_id, p_expected_updated_at);
  update public.status_command_requests set vehicle_id = p_vehicle_id, result = to_jsonb(v_vehicle)
    where auth_user_id = auth.uid() and idempotency_key = p_idempotency_key;
  return v_vehicle;
end;
$$;

create function public.set_employee_active_status_idempotent(
  p_idempotency_key uuid, p_employee_id bigint, p_active boolean, p_expected_updated_at timestamptz
) returns public.employees language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_payload jsonb;
  v_existing public.status_command_requests%rowtype;
  v_employee public.employees%rowtype;
  v_inserted integer;
begin
  if auth.uid() is null or not public.has_any_role(array['admin', 'manager']::public.user_access_role[]) then
    raise exception using errcode = '42501', message = 'Permissão negada para alterar status de funcionário.';
  end if;
  if p_idempotency_key is null or p_employee_id is null or p_active is null or p_expected_updated_at is null then
    raise exception using errcode = '22023', message = 'Os dados do funcionário são inválidos.';
  end if;
  v_payload := jsonb_build_object('command', 'employee_status', 'employee_id', p_employee_id,
    'active', p_active, 'expected_updated_at', p_expected_updated_at);
  insert into public.status_command_requests(auth_user_id, idempotency_key, request_payload)
    values (auth.uid(), p_idempotency_key, v_payload) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_existing from public.status_command_requests
    where auth_user_id = auth.uid() and idempotency_key = p_idempotency_key for update;
  if v_inserted = 0 then
    if v_existing.request_payload is distinct from v_payload then
      raise exception using errcode = '23505', message = 'Esta chave de idempotência já foi usada para outra operação.';
    end if;
    return jsonb_populate_record(null::public.employees, v_existing.result);
  end if;
  perform public.set_employee_active_status(p_employee_id, p_active, p_expected_updated_at);
  select * into v_employee from public.employees where id = p_employee_id;
  update public.status_command_requests set employee_id = p_employee_id, result = to_jsonb(v_employee)
    where auth_user_id = auth.uid() and idempotency_key = p_idempotency_key;
  return v_employee;
end;
$$;

revoke all on function public.finish_vehicle_preparation_idempotent(uuid, bigint, timestamptz) from public, anon, service_role;
revoke all on function public.set_employee_active_status_idempotent(uuid, bigint, boolean, timestamptz) from public, anon, service_role;
grant execute on function public.finish_vehicle_preparation_idempotent(uuid, bigint, timestamptz) to authenticated;
grant execute on function public.set_employee_active_status_idempotent(uuid, bigint, boolean, timestamptz) to authenticated;
revoke execute on function public.finish_vehicle_preparation(bigint, timestamptz) from authenticated;
revoke execute on function public.set_employee_active_status(bigint, boolean, timestamptz) from authenticated;
