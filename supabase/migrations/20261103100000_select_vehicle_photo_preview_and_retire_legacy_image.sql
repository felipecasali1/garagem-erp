-- Acquire the Vehicle lock before photo DDL when the runner wraps this file in a transaction.
do $$ begin
  lock table public.vehicles in access exclusive mode;
end; $$;

-- Preserve every non-empty legacy reference before retiring vehicles.image.
create table public.vehicle_legacy_photo_imports (
  id uuid primary key default gen_random_uuid(),
  vehicle_id bigint not null unique references public.vehicles (id) on delete restrict,
  original_value text not null,
  source_kind text not null check (source_kind in ('url', 'data', 'unsupported')),
  status text not null default 'pending' check (status in ('pending', 'imported', 'recovery_required')),
  photo_id uuid references public.vehicle_photos (id) on delete set null,
  last_error text,
  captured_at timestamptz not null default now(),
  imported_at timestamptz
);

alter table public.vehicle_legacy_photo_imports enable row level security;
revoke all on public.vehicle_legacy_photo_imports from public, anon, authenticated;
grant select on public.vehicle_legacy_photo_imports to authenticated;
grant all on public.vehicle_legacy_photo_imports to service_role;
create policy vehicle_legacy_photo_imports_read_vehicle_roles
  on public.vehicle_legacy_photo_imports for select to authenticated
  using (public.has_any_role(array['admin', 'manager', 'seller']::public.user_access_role[]));

alter table public.vehicle_photos
  add column is_preview boolean not null default false,
  add constraint vehicle_photos_preview_not_deleting check (not (is_preview and deletion_pending));
create unique index vehicle_photos_single_preview_idx
  on public.vehicle_photos (vehicle_id) where is_preview;

create function public.set_vehicle_photo_preview(p_vehicle_id bigint, p_photo_id uuid)
returns public.vehicle_photos language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_photo public.vehicle_photos%rowtype;
begin
  perform public.assert_vehicle_photo_access();
  perform 1 from public.vehicles where id = p_vehicle_id for update;
  select * into v_photo from public.vehicle_photos
    where id = p_photo_id and vehicle_id = p_vehicle_id for update;
  if not found or v_photo.deletion_pending then
    raise exception using errcode = '23505', message = 'A foto foi removida ou está em remoção. Atualize a galeria antes de escolher a principal.';
  end if;
  update public.vehicle_photos set is_preview = false
    where vehicle_id = p_vehicle_id and is_preview and id <> p_photo_id;
  update public.vehicle_photos set is_preview = true where id = p_photo_id returning * into v_photo;
  return v_photo;
end;
$$;

create or replace function public.begin_vehicle_photo_removal(
  p_vehicle_id bigint, p_photo_id uuid, p_expected_storage_path text
)
returns public.vehicle_photos language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_photo public.vehicle_photos%rowtype;
begin
  perform public.assert_vehicle_photo_access();
  perform 1 from public.vehicles where id = p_vehicle_id for update;
  select * into v_photo from public.vehicle_photos
    where id = p_photo_id and vehicle_id = p_vehicle_id for update;
  if not found then return null; end if;
  if p_expected_storage_path is null or v_photo.storage_path <> p_expected_storage_path then
    raise exception using errcode = '23505', message = 'STALE_PHOTO: esta foto mudou em outra sessão. Atualize a galeria antes de remover.';
  end if;
  update public.vehicle_photos set deletion_pending = true, is_preview = false
    where id = p_photo_id returning * into v_photo;
  return v_photo;
end;
$$;

create function public.record_vehicle_legacy_photo_import(
  p_import_id uuid, p_photo_id uuid default null, p_error text default null
)
returns public.vehicle_legacy_photo_imports language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_import public.vehicle_legacy_photo_imports%rowtype;
begin
  perform public.assert_vehicle_photo_access();
  select * into v_import from public.vehicle_legacy_photo_imports where id = p_import_id;
  if not found then raise exception using errcode = '22023', message = 'Referência antiga não encontrada.'; end if;
  perform 1 from public.vehicles where id = v_import.vehicle_id for update;
  select * into v_import from public.vehicle_legacy_photo_imports where id = p_import_id for update;
  if v_import.status = 'imported' then return v_import; end if;
  if p_photo_id is not null then
    if p_photo_id <> v_import.id or not exists (
      select 1 from public.vehicle_photos where id = p_photo_id
        and vehicle_id = v_import.vehicle_id and not deletion_pending
    ) then
      raise exception using errcode = '23505', message = 'A foto importada ainda não foi confirmada na galeria.';
    end if;
    update public.vehicle_legacy_photo_imports
      set status = 'imported', photo_id = p_photo_id, last_error = null, imported_at = now()
      where id = p_import_id returning * into v_import;
  else
    update public.vehicle_legacy_photo_imports
      set status = 'recovery_required', last_error = left(coalesce(nullif(btrim(p_error), ''), 'A referência foi preservada. Tente importar novamente ou selecione o arquivo para recuperação.'), 1000)
      where id = p_import_id returning * into v_import;
  end if;
  return v_import;
end;
$$;

revoke all on function public.set_vehicle_photo_preview(bigint, uuid) from public, anon, service_role;
grant execute on function public.set_vehicle_photo_preview(bigint, uuid) to authenticated;
revoke all on function public.record_vehicle_legacy_photo_import(uuid, uuid, text) from public, anon, service_role;
grant execute on function public.record_vehicle_legacy_photo_import(uuid, uuid, text) to authenticated;

-- Keep the existing transactional Vehicle commands, removing only the retired image field.
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
      'model_year', 'cost_price', 'sale_price', 'published', 'notes'
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
        notes = v_changes.notes
    where id = p_vehicle_id
    returning * into v_vehicle;

  return v_vehicle;
end;
$$;

create or replace function public.create_vehicle_configuration(
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
      'model_year', 'cost_price', 'sale_price', 'notes'
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
    published, status, notes
  ) values (
    v_input.plate, v_input.chassis, v_input.vin, v_input.brand, v_input.model,
    v_input.version, v_input.color, v_input.fuel_type, v_input.transmission,
    coalesce(v_input.current_mileage, 0), v_input.manufacture_year, v_input.model_year,
    coalesce(v_input.cost_price, 0), coalesce(v_input.sale_price, 0), false,
    case when jsonb_array_length(p_checklist_items) > 0
      then 'in_repair'::public.vehicle_status
      else 'evaluating'::public.vehicle_status
    end,
    v_input.notes
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

-- Capture and retirement share one statement/transaction, including in the SQL Editor.
do $$
declare v_total bigint; v_preserved bigint;
begin
  lock table public.vehicles in access exclusive mode;
insert into public.vehicle_legacy_photo_imports (vehicle_id, original_value, source_kind, status, last_error)
select id, image,
  case when btrim(image) ~* '^https?://' then 'url'
       when btrim(image) ~* '^data:image/' then 'data' else 'unsupported' end,
  case when btrim(image) ~* '^(https?://|data:image/)' then 'pending' else 'recovery_required' end,
  case when btrim(image) !~* '^(https?://|data:image/)'
    then 'A referência antiga não é um link de imagem suportado. Selecione o arquivo para recuperá-la.' end
from public.vehicles where nullif(btrim(image), '') is not null;
  select count(*) into v_total from public.vehicles;
  select count(*) into v_preserved from public.vehicle_legacy_photo_imports;
  raise notice 'Inspeção de vehicles.image: % veículos, % referências preservadas, % valores vazios.', v_total, v_preserved, v_total - v_preserved;
  alter table public.vehicles drop column image;
end;
$$;
notify pgrst, 'reload schema';
