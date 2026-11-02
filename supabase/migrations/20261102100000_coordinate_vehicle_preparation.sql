-- Keep vehicle availability and open preparation tasks serialized on the Vehicle row.

update public.vehicles as vehicle
set status = 'in_repair',
    published = false
where vehicle.status = 'available'
  and exists (
    select 1
    from public.vehicle_checklist_items as item
    where item.vehicle_id = vehicle.id
      and item.status not in ('completed', 'cancelled')
  );

create or replace function public.enforce_vehicle_has_no_open_preparation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'available'
    and (
      old.status is distinct from new.status
      or (new.published and not old.published)
    )
    and exists (
      select 1
      from public.vehicle_checklist_items as item
      where item.vehicle_id = new.id
        and item.status not in ('completed', 'cancelled')
    )
  then
    raise exception using
      errcode = '23505',
      message = 'VEHICLE_HAS_OPEN_PREPARATION: conclua ou cancele as tarefas antes de disponibilizar o veículo.';
  end if;

  return new;
end;
$$;

create trigger vehicles_reject_available_with_open_preparation
  before update on public.vehicles
  for each row execute function public.enforce_vehicle_has_no_open_preparation();

create or replace function public.synchronize_vehicle_preparation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vehicle_id bigint;
  v_vehicle_status public.vehicle_status;
begin
  if tg_op = 'UPDATE' and new.vehicle_id is distinct from old.vehicle_id then
    raise exception using
      errcode = '22023',
      message = 'O item do checklist não pode ser transferido para outro veículo.';
  end if;

  v_vehicle_id := case when tg_op = 'DELETE' then old.vehicle_id else new.vehicle_id end;

  select vehicle.status
    into v_vehicle_status
    from public.vehicles as vehicle
    where vehicle.id = v_vehicle_id
    for update;

  if not found then
    raise exception using errcode = '23503', message = 'Veículo do checklist não encontrado.';
  end if;

  if v_vehicle_status = 'sold' then
    raise exception using
      errcode = '22023',
      message = 'Checklist de veículo vendido fica bloqueado para preservar o histórico.';
  end if;

  if tg_op <> 'DELETE'
    and new.status not in ('completed', 'cancelled')
    and (
      tg_op = 'INSERT'
      or old.status in ('completed', 'cancelled')
    )
  then
    update public.vehicles
      set status = case when status = 'available' then 'in_repair' else status end,
          published = case when status = 'available' then false else published end
      where id = v_vehicle_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger checklist_items_lock_vehicle_and_synchronize
  before insert or update or delete on public.vehicle_checklist_items
  for each row execute function public.synchronize_vehicle_preparation();

create or replace function public.assert_vehicle_sales_access()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null
    or not public.has_any_role(array['admin', 'manager', 'seller']::public.user_access_role[])
  then
    raise exception using errcode = '42501', message = 'Seu usuário não tem permissão para esta operação de veículos ou checklist.';
  end if;
end;
$$;

create or replace function public.update_vehicle_with_version(
  p_vehicle_id bigint,
  p_expected_updated_at timestamptz,
  p_changes jsonb
)
returns public.vehicles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vehicle public.vehicles%rowtype;
  v_changes public.vehicles%rowtype;
begin
  perform public.assert_vehicle_sales_access();

  if p_changes is null or jsonb_typeof(p_changes) <> 'object'
    or (p_changes - array[
      'plate', 'chassis', 'vin', 'brand', 'model', 'version', 'color',
      'fuel_type', 'transmission', 'current_mileage', 'manufacture_year',
      'model_year', 'cost_price', 'sale_price', 'published', 'image', 'notes'
    ]) <> '{}'::jsonb
  then
    raise exception using errcode = '22023', message = 'Os campos enviados para o veículo são inválidos.';
  end if;

  select * into v_vehicle
    from public.vehicles
    where id = p_vehicle_id
    for update;

  if not found then
    raise exception using errcode = '22023', message = 'Veículo não encontrado.';
  end if;

  if v_vehicle.updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = '23505',
      message = 'STALE_RECORD: este veículo foi alterado por outra pessoa. Revise os dados atuais antes de salvar.';
  end if;

  if v_vehicle.status = 'sold' then
    raise exception using errcode = '22023', message = 'Veículo vendido não pode ter dados operacionais alterados.';
  end if;

  v_changes := jsonb_populate_record(v_vehicle, p_changes);

  update public.vehicles
    set plate = v_changes.plate,
        chassis = v_changes.chassis,
        vin = v_changes.vin,
        brand = v_changes.brand,
        model = v_changes.model,
        version = v_changes.version,
        color = v_changes.color,
        fuel_type = v_changes.fuel_type,
        transmission = v_changes.transmission,
        current_mileage = v_changes.current_mileage,
        manufacture_year = v_changes.manufacture_year,
        model_year = v_changes.model_year,
        cost_price = v_changes.cost_price,
        sale_price = v_changes.sale_price,
        published = case when v_vehicle.status = 'available' then v_changes.published else false end,
        image = v_changes.image,
        notes = v_changes.notes
    where id = p_vehicle_id
    returning * into v_vehicle;

  return v_vehicle;
end;
$$;

create or replace function public.set_vehicle_published_with_version(
  p_vehicle_id bigint,
  p_expected_updated_at timestamptz,
  p_published boolean
)
returns public.vehicles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vehicle public.vehicles%rowtype;
begin
  perform public.assert_vehicle_sales_access();

  select * into v_vehicle
    from public.vehicles
    where id = p_vehicle_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'Veículo não encontrado.';
  end if;
  if v_vehicle.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '23505', message = 'STALE_RECORD: o veículo mudou. Atualize os dados antes de tentar novamente.';
  end if;
  if p_published and v_vehicle.status <> 'available' then
    raise exception using errcode = '22023', message = 'Apenas veículos disponíveis podem ser publicados.';
  end if;

  update public.vehicles
    set published = p_published
    where id = p_vehicle_id
    returning * into v_vehicle;
  return v_vehicle;
end;
$$;

create or replace function public.archive_vehicle_with_version(
  p_vehicle_id bigint,
  p_expected_updated_at timestamptz
)
returns public.vehicles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vehicle public.vehicles%rowtype;
begin
  perform public.assert_vehicle_sales_access();

  select * into v_vehicle
    from public.vehicles
    where id = p_vehicle_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'Veículo não encontrado.';
  end if;
  if v_vehicle.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '23505', message = 'STALE_RECORD: o veículo mudou. Revise os dados antes de arquivar.';
  end if;
  if v_vehicle.status in ('reserved', 'sold') then
    raise exception using errcode = '22023', message = 'Veículos reservados ou vendidos não devem ser arquivados manualmente.';
  end if;

  update public.vehicles
    set published = false, status = 'archived'
    where id = p_vehicle_id
    returning * into v_vehicle;
  return v_vehicle;
end;
$$;

create or replace function public.finish_vehicle_preparation(
  p_vehicle_id bigint,
  p_expected_updated_at timestamptz
)
returns public.vehicles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vehicle public.vehicles%rowtype;
begin
  perform public.assert_vehicle_sales_access();

  select * into v_vehicle
    from public.vehicles
    where id = p_vehicle_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'Veículo não encontrado.';
  end if;
  if v_vehicle.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '23505', message = 'STALE_RECORD: o veículo mudou. Atualize os dados antes de finalizar.';
  end if;
  if v_vehicle.status <> 'in_repair' then
    raise exception using errcode = '22023', message = 'Apenas veículos em preparação podem ser finalizados.';
  end if;
  if exists (
    select 1
    from public.vehicle_checklist_items as item
    where item.vehicle_id = p_vehicle_id
      and item.status not in ('completed', 'cancelled')
  ) then
    raise exception using
      errcode = '23505',
      message = 'VEHICLE_HAS_OPEN_PREPARATION: conclua ou cancele as tarefas antes de finalizar a preparação.';
  end if;

  update public.vehicles
    set status = 'available', published = false
    where id = p_vehicle_id
    returning * into v_vehicle;
  return v_vehicle;
end;
$$;

create or replace function public.create_vehicle_checklist_item(
  p_vehicle_id bigint,
  p_item jsonb
)
returns public.vehicle_checklist_items
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_input public.vehicle_checklist_items%rowtype;
  v_item public.vehicle_checklist_items%rowtype;
begin
  perform public.assert_vehicle_sales_access();
  if p_item is null or jsonb_typeof(p_item) <> 'object'
    or (p_item - array[
      'vehicle_id', 'title', 'description', 'category', 'status', 'priority',
      'estimated_cost', 'actual_cost', 'due_date', 'completion_date',
      'responsible_employee_id', 'notes', 'attachments'
    ]) <> '{}'::jsonb
  then
    raise exception using errcode = '22023', message = 'Os campos enviados para o checklist são inválidos.';
  end if;

  v_input := jsonb_populate_record(null::public.vehicle_checklist_items, p_item);
  if v_input.vehicle_id is not null and v_input.vehicle_id <> p_vehicle_id then
    raise exception using errcode = '22023', message = 'O veículo do item não corresponde ao veículo informado.';
  end if;

  insert into public.vehicle_checklist_items (
    vehicle_id, title, description, category, status, priority,
    estimated_cost, actual_cost, due_date, completion_date,
    responsible_employee_id, notes, attachments
  ) values (
    p_vehicle_id, v_input.title, v_input.description, v_input.category,
    coalesce(v_input.status, 'pending'), coalesce(v_input.priority, 'medium'),
    coalesce(v_input.estimated_cost, 0), coalesce(v_input.actual_cost, 0),
    v_input.due_date, v_input.completion_date, v_input.responsible_employee_id,
    v_input.notes, coalesce(v_input.attachments, '[]'::jsonb)
  ) returning * into v_item;

  return v_item;
end;
$$;

create or replace function public.update_vehicle_checklist_item(
  p_item_id uuid,
  p_expected_updated_at timestamptz,
  p_changes jsonb
)
returns public.vehicle_checklist_items
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vehicle_id bigint;
  v_vehicle_status public.vehicle_status;
  v_item public.vehicle_checklist_items%rowtype;
  v_changes public.vehicle_checklist_items%rowtype;
begin
  perform public.assert_vehicle_sales_access();
  if p_changes is null or jsonb_typeof(p_changes) <> 'object'
    or (p_changes - array[
      'title', 'description', 'category', 'status', 'priority', 'estimated_cost',
      'actual_cost', 'due_date', 'completion_date', 'responsible_employee_id',
      'notes', 'attachments'
    ]) <> '{}'::jsonb
  then
    raise exception using errcode = '22023', message = 'Os campos enviados para o checklist são inválidos.';
  end if;

  select vehicle_id into v_vehicle_id
    from public.vehicle_checklist_items
    where id = p_item_id;
  if not found then
    raise exception using errcode = '22023', message = 'Item de checklist não encontrado.';
  end if;

  select vehicle.status into v_vehicle_status
    from public.vehicles as vehicle
    where vehicle.id = v_vehicle_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'Veículo do checklist não encontrado.';
  end if;

  select * into v_item
    from public.vehicle_checklist_items
    where id = p_item_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'Item de checklist não encontrado.';
  end if;
  if v_item.updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = '23505',
      message = 'STALE_RECORD: este item foi alterado por outra pessoa. Revise os dados atuais antes de salvar.';
  end if;
  if v_vehicle_status = 'sold' then
    raise exception using
      errcode = '22023',
      message = 'Checklist de veículo vendido fica bloqueado para preservar o histórico.';
  end if;

  v_changes := jsonb_populate_record(v_item, p_changes);
  update public.vehicle_checklist_items
    set title = v_changes.title,
        description = v_changes.description,
        category = v_changes.category,
        status = v_changes.status,
        priority = v_changes.priority,
        estimated_cost = v_changes.estimated_cost,
        actual_cost = v_changes.actual_cost,
        due_date = v_changes.due_date,
        completion_date = v_changes.completion_date,
        responsible_employee_id = v_changes.responsible_employee_id,
        notes = v_changes.notes,
        attachments = v_changes.attachments
    where id = p_item_id
    returning * into v_item;

  return v_item;
end;
$$;

revoke update on public.vehicles from authenticated;
revoke update, delete on public.vehicle_checklist_items from authenticated;

revoke all on function public.update_vehicle_with_version(bigint, timestamptz, jsonb) from public, anon, service_role;
revoke all on function public.assert_vehicle_sales_access() from public, anon, authenticated, service_role;
revoke all on function public.set_vehicle_published_with_version(bigint, timestamptz, boolean) from public, anon, service_role;
revoke all on function public.archive_vehicle_with_version(bigint, timestamptz) from public, anon, service_role;
revoke all on function public.finish_vehicle_preparation(bigint, timestamptz) from public, anon, service_role;
revoke all on function public.create_vehicle_checklist_item(bigint, jsonb) from public, anon, service_role;
revoke all on function public.update_vehicle_checklist_item(uuid, timestamptz, jsonb) from public, anon, service_role;

grant execute on function public.update_vehicle_with_version(bigint, timestamptz, jsonb) to authenticated;
grant execute on function public.set_vehicle_published_with_version(bigint, timestamptz, boolean) to authenticated;
grant execute on function public.archive_vehicle_with_version(bigint, timestamptz) to authenticated;
grant execute on function public.finish_vehicle_preparation(bigint, timestamptz) to authenticated;
grant execute on function public.create_vehicle_checklist_item(bigint, jsonb) to authenticated;
grant execute on function public.update_vehicle_checklist_item(uuid, timestamptz, jsonb) to authenticated;
