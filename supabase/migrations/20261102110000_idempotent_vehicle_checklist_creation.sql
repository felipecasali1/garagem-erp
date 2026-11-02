create table public.vehicle_checklist_creation_requests (
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key uuid not null,
  request_digest text not null,
  checklist_item_id uuid references public.vehicle_checklist_items (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (auth_user_id, idempotency_key)
);

alter table public.vehicle_checklist_creation_requests enable row level security;
revoke all on table public.vehicle_checklist_creation_requests from public, anon, authenticated, service_role;

drop function public.create_vehicle_checklist_item(bigint, jsonb);

create function public.create_vehicle_checklist_item(
  p_idempotency_key uuid,
  p_vehicle_id bigint,
  p_item jsonb
)
returns public.vehicle_checklist_items
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_payload jsonb;
  v_request_digest text;
  v_existing_request_digest text;
  v_existing_item_id uuid;
  v_request_rows_inserted integer;
  v_input public.vehicle_checklist_items%rowtype;
  v_item public.vehicle_checklist_items%rowtype;
begin
  perform public.assert_vehicle_sales_access();
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'A chave de idempotência é obrigatória.';
  end if;
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

  v_payload := jsonb_build_object('vehicle_id', p_vehicle_id, 'item', p_item);
  v_request_digest := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');
  insert into public.vehicle_checklist_creation_requests (
    auth_user_id, idempotency_key, request_digest
  ) values (
    v_auth_user_id, p_idempotency_key, v_request_digest
  )
  on conflict (auth_user_id, idempotency_key) do nothing;
  get diagnostics v_request_rows_inserted = row_count;

  select request_digest, checklist_item_id
    into v_existing_request_digest, v_existing_item_id
    from public.vehicle_checklist_creation_requests
    where auth_user_id = v_auth_user_id
      and idempotency_key = p_idempotency_key
    for update;

  if v_request_rows_inserted = 0 then
    if v_existing_request_digest is distinct from v_request_digest then
      raise exception using
        errcode = '23505',
        message = 'Esta chave de idempotência já foi usada com outra tarefa.';
    end if;
    if v_existing_item_id is null then
      raise exception using
        errcode = '23505',
        message = 'Esta criação já foi processada, mas a tarefa não está mais disponível.';
    end if;

    select * into v_item
      from public.vehicle_checklist_items
      where id = v_existing_item_id;
    if not found then
      raise exception using
        errcode = '23505',
        message = 'Esta criação já foi processada, mas a tarefa não está mais disponível.';
    end if;
    return v_item;
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

  update public.vehicle_checklist_creation_requests
    set checklist_item_id = v_item.id
    where auth_user_id = v_auth_user_id
      and idempotency_key = p_idempotency_key;

  return v_item;
end;
$$;

revoke all on function public.create_vehicle_checklist_item(uuid, bigint, jsonb) from public, anon, service_role;
grant execute on function public.create_vehicle_checklist_item(uuid, bigint, jsonb) to authenticated;
