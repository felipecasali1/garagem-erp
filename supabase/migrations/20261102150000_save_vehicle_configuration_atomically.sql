create table public.vehicle_configuration_command_requests (
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key uuid not null,
  operation text not null check (operation in ('create', 'update')),
  vehicle_id bigint references public.vehicles (id) on delete restrict,
  request_payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (auth_user_id, idempotency_key)
);

alter table public.vehicle_configuration_command_requests enable row level security;
revoke all on table public.vehicle_configuration_command_requests
  from public, anon, authenticated, service_role;

revoke insert on public.vehicles from public, anon, authenticated;
revoke insert, update, delete on public.vehicle_accessories
  from public, anon, authenticated;

create function public.apply_vehicle_accessories(
  p_vehicle_id bigint,
  p_accessories jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_name text;
  v_accessory_id bigint;
begin
  if p_accessories is null or jsonb_typeof(p_accessories) <> 'array' then
    raise exception using errcode = '22023', message = 'A lista de acessórios é inválida.';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_accessories) as entry(value)
      where jsonb_typeof(entry.value) <> 'string'
        or nullif(btrim(entry.value #>> '{}'), '') is null
  ) then
    raise exception using errcode = '22023', message = 'Informe nomes válidos para os acessórios.';
  end if;

  update public.vehicle_accessories
    set active = false
    where vehicle_id = p_vehicle_id;

  for v_name in
    select min(btrim(entry.value #>> '{}'))
      from jsonb_array_elements(p_accessories) as entry(value)
      where nullif(btrim(entry.value #>> '{}'), '') is not null
      group by lower(btrim(entry.value #>> '{}'))
  loop
    insert into public.accessories (name)
      values (v_name)
      on conflict do nothing;

    select id into v_accessory_id
      from public.accessories
      where lower(name) = lower(v_name)
      limit 1;
    if v_accessory_id is null then
      raise exception using errcode = '23503', message = 'Não foi possível localizar o acessório informado.';
    end if;

    insert into public.vehicle_accessories (vehicle_id, accessory_id, active)
      values (p_vehicle_id, v_accessory_id, true)
      on conflict (vehicle_id, accessory_id)
      do update set active = true;
  end loop;
end;
$$;

create function public.update_vehicle_configuration(
  p_idempotency_key uuid,
  p_vehicle_id bigint,
  p_expected_updated_at timestamptz,
  p_changes jsonb,
  p_accessories jsonb
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_request_payload jsonb;
  v_existing_payload jsonb;
  v_existing_operation text;
  v_existing_vehicle_id bigint;
  v_request_rows_inserted integer;
begin
  perform public.assert_vehicle_sales_access();

  if p_idempotency_key is null
    or p_vehicle_id is null
    or p_expected_updated_at is null
    or p_changes is null
    or jsonb_typeof(p_changes) <> 'object'
    or p_accessories is null
    or jsonb_typeof(p_accessories) <> 'array'
  then
    raise exception using errcode = '22023', message = 'Os dados da edição do veículo são inválidos.';
  end if;

  v_request_payload := jsonb_build_object(
    'command', 'update_vehicle_configuration',
    'vehicle_id', p_vehicle_id,
    'expected_updated_at', p_expected_updated_at,
    'changes', p_changes,
    'accessories', p_accessories
  );

  insert into public.vehicle_configuration_command_requests (
    auth_user_id, idempotency_key, operation, vehicle_id, request_payload
  ) values (
    v_auth_user_id, p_idempotency_key, 'update', p_vehicle_id, v_request_payload
  ) on conflict (auth_user_id, idempotency_key) do nothing;
  get diagnostics v_request_rows_inserted = row_count;

  select request_payload, operation, vehicle_id
    into v_existing_payload, v_existing_operation, v_existing_vehicle_id
    from public.vehicle_configuration_command_requests
    where auth_user_id = v_auth_user_id
      and idempotency_key = p_idempotency_key
    for update;

  if v_request_rows_inserted = 0 then
    if v_existing_operation is distinct from 'update'
      or v_existing_payload is distinct from v_request_payload
    then
      raise exception using
        errcode = '23505',
        message = 'Esta chave de idempotência já foi usada com outra edição de veículo.';
    end if;
    return v_existing_vehicle_id;
  end if;

  perform public.update_vehicle_with_version(
    p_vehicle_id, p_expected_updated_at, p_changes
  );
  perform public.apply_vehicle_accessories(p_vehicle_id, p_accessories);

  return p_vehicle_id;
end;
$$;

revoke all on function public.apply_vehicle_accessories(bigint, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.update_vehicle_configuration(uuid, bigint, timestamptz, jsonb, jsonb)
  from public, anon, service_role;
grant execute on function public.update_vehicle_configuration(uuid, bigint, timestamptz, jsonb, jsonb)
  to authenticated;

create function public.create_vehicle_configuration(
  p_idempotency_key uuid,
  p_vehicle jsonb,
  p_accessories jsonb,
  p_checklist_items jsonb
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_request_payload jsonb;
  v_existing_payload jsonb;
  v_existing_operation text;
  v_existing_vehicle_id bigint;
  v_request_rows_inserted integer;
  v_input public.vehicles%rowtype;
  v_vehicle_id bigint;
  v_item_json jsonb;
  v_item public.vehicle_checklist_items%rowtype;
begin
  perform public.assert_vehicle_sales_access();

  if p_idempotency_key is null
    or p_vehicle is null
    or jsonb_typeof(p_vehicle) <> 'object'
    or (p_vehicle - array[
      'plate', 'chassis', 'vin', 'brand', 'model', 'version', 'color',
      'fuel_type', 'transmission', 'current_mileage', 'manufacture_year',
      'model_year', 'cost_price', 'sale_price', 'image', 'notes'
    ]) <> '{}'::jsonb
    or p_accessories is null
    or jsonb_typeof(p_accessories) <> 'array'
    or p_checklist_items is null
    or jsonb_typeof(p_checklist_items) <> 'array'
  then
    raise exception using errcode = '22023', message = 'Os dados da configuração do veículo são inválidos.';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_checklist_items) as entry(value)
      where jsonb_typeof(entry.value) <> 'object'
        or (entry.value - array[
          'title', 'description', 'category', 'priority',
          'estimated_cost', 'due_date', 'notes'
        ]) <> '{}'::jsonb
  ) then
    raise exception using errcode = '22023', message = 'Os dados das tarefas iniciais são inválidos.';
  end if;

  v_request_payload := jsonb_build_object(
    'command', 'create_vehicle_configuration',
    'vehicle', p_vehicle,
    'accessories', p_accessories,
    'checklist_items', p_checklist_items
  );

  insert into public.vehicle_configuration_command_requests (
    auth_user_id, idempotency_key, operation, request_payload
  ) values (
    v_auth_user_id, p_idempotency_key, 'create', v_request_payload
  ) on conflict (auth_user_id, idempotency_key) do nothing;
  get diagnostics v_request_rows_inserted = row_count;

  select request_payload, operation, vehicle_id
    into v_existing_payload, v_existing_operation, v_existing_vehicle_id
    from public.vehicle_configuration_command_requests
    where auth_user_id = v_auth_user_id
      and idempotency_key = p_idempotency_key
    for update;

  if v_request_rows_inserted = 0 then
    if v_existing_operation is distinct from 'create'
      or v_existing_payload is distinct from v_request_payload
    then
      raise exception using
        errcode = '23505',
        message = 'Esta chave de idempotência já foi usada com outra configuração de veículo.';
    end if;
    if v_existing_vehicle_id is null then
      raise exception using errcode = '23505', message = 'A criação do veículo não possui resultado disponível.';
    end if;
    return v_existing_vehicle_id;
  end if;

  v_input := jsonb_populate_record(null::public.vehicles, p_vehicle);

  insert into public.vehicles (
    plate, chassis, vin, brand, model, version, color, fuel_type, transmission,
    current_mileage, manufacture_year, model_year, cost_price, sale_price,
    published, status, image, notes
  ) values (
    v_input.plate, v_input.chassis, v_input.vin, v_input.brand, v_input.model,
    v_input.version, v_input.color, v_input.fuel_type, v_input.transmission,
    coalesce(v_input.current_mileage, 0), v_input.manufacture_year, v_input.model_year,
    coalesce(v_input.cost_price, 0), coalesce(v_input.sale_price, 0), false,
    case when jsonb_array_length(p_checklist_items) > 0
      then 'in_repair'::public.vehicle_status
      else 'evaluating'::public.vehicle_status
    end,
    v_input.image, v_input.notes
  ) returning id into v_vehicle_id;

  perform public.apply_vehicle_accessories(v_vehicle_id, p_accessories);

  for v_item_json in select value from jsonb_array_elements(p_checklist_items)
  loop
    v_item := jsonb_populate_record(null::public.vehicle_checklist_items, v_item_json);
    if nullif(btrim(v_item.title), '') is null then
      raise exception using errcode = '22023', message = 'Informe o título de cada tarefa inicial.';
    end if;

    insert into public.vehicle_checklist_items (
      vehicle_id, title, description, category, status, priority,
      estimated_cost, actual_cost, due_date, completion_date,
      responsible_employee_id, notes, attachments
    ) values (
      v_vehicle_id, btrim(v_item.title), v_item.description, v_item.category,
      'pending', coalesce(v_item.priority, 'medium'),
      coalesce(v_item.estimated_cost, 0), 0, v_item.due_date, null,
      null, v_item.notes, '[]'::jsonb
    );
  end loop;

  update public.vehicle_configuration_command_requests
    set vehicle_id = v_vehicle_id
    where auth_user_id = v_auth_user_id
      and idempotency_key = p_idempotency_key;

  return v_vehicle_id;
end;
$$;

revoke all on function public.create_vehicle_configuration(uuid, jsonb, jsonb, jsonb)
  from public, anon, service_role;
grant execute on function public.create_vehicle_configuration(uuid, jsonb, jsonb, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
