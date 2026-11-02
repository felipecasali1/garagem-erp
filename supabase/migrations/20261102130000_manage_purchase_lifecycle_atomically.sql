create table public.purchase_command_requests (
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key uuid not null,
  request_payload jsonb not null,
  purchase_id bigint references public.purchases (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (auth_user_id, idempotency_key)
);

alter table public.purchase_command_requests enable row level security;
revoke all on table public.purchase_command_requests from public, anon, authenticated, service_role;
revoke insert, update, delete on public.purchases from public, anon, authenticated;
alter table public.purchases
  add column vehicle_status_before_purchase public.vehicle_status not null default 'evaluating';

create function public.assert_purchase_access()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null
    or not public.has_any_role(array['admin', 'manager', 'seller', 'financial']::public.user_access_role[])
  then
    raise exception using errcode = '42501', message = 'Seu usuário não tem permissão para esta operação de compra.';
  end if;
end;
$$;

create function public.complete_pending_purchase(p_purchase_id bigint)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_purchase public.purchases%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_transaction_id bigint;
  v_next_vehicle_status public.vehicle_status;
begin
  select * into v_purchase
    from public.purchases
    where id = p_purchase_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'Compra não encontrada.';
  end if;
  if v_purchase.status <> 'pending' then
    raise exception using
      errcode = '23505',
      message = 'PURCHASE_NOT_PENDING: somente compras pendentes podem ser concluídas.';
  end if;

  select * into v_vehicle
    from public.vehicles
    where id = v_purchase.vehicle_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'Veículo da compra não encontrado.';
  end if;
  if v_vehicle.status <> 'evaluating' then
    raise exception using
      errcode = '23505',
      message = 'PURCHASE_VEHICLE_CHANGED: o veículo não está mais em avaliação. Atualize os dados antes de concluir a compra.';
  end if;

  if v_purchase.financial_transaction_id is not null
    or exists (
      select 1
        from public.financial_transactions
        where purchase_id = v_purchase.id
          and category = 'vehicle_purchase'
    )
  then
    raise exception using
      errcode = '23505',
      message = 'PURCHASE_HAS_FINANCIAL_EFFECTS: esta compra já possui efeito financeiro e precisa ser revisada antes da conclusão.';
  end if;

  v_next_vehicle_status := case
    when exists (
      select 1
        from public.vehicle_checklist_items
        where vehicle_id = v_vehicle.id
          and status not in ('completed', 'cancelled')
    ) then 'in_repair'::public.vehicle_status
    else 'available'::public.vehicle_status
  end;

  insert into public.financial_transactions (
    type, category, status, amount, transaction_date, paid_at,
    description, related, purchase_id
  ) values (
    'expense',
    'vehicle_purchase',
    'paid',
    v_purchase.total_value,
    v_purchase.purchase_date,
    now(),
    format('Compra #%s - %s %s', v_purchase.id, v_vehicle.brand, v_vehicle.model),
    v_vehicle.plate,
    v_purchase.id
  ) returning id into v_transaction_id;

  update public.vehicles
    set cost_price = v_purchase.total_value,
        status = v_next_vehicle_status,
        published = false
    where id = v_vehicle.id;

  update public.purchases
    set status = 'completed',
        financial_transaction_id = v_transaction_id
    where id = v_purchase.id;

  return v_purchase.id;
end;
$$;

revoke all on function public.assert_purchase_access() from public, anon, authenticated, service_role;
revoke all on function public.complete_pending_purchase(bigint) from public, anon, authenticated, service_role;

create function public.create_purchase_atomically(
  p_idempotency_key uuid,
  p_supplier_id bigint,
  p_vehicle_id bigint,
  p_expected_vehicle_updated_at timestamptz,
  p_total_value numeric,
  p_purchase_date date,
  p_status public.purchase_status,
  p_notes text
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
  v_existing_purchase_id bigint;
  v_request_rows_inserted integer;
  v_vehicle public.vehicles%rowtype;
  v_supplier_active boolean;
  v_latest_sale_status public.sale_status;
  v_purchase_id bigint;
begin
  perform public.assert_purchase_access();

  if p_idempotency_key is null
    or p_supplier_id is null
    or p_vehicle_id is null
    or p_expected_vehicle_updated_at is null
    or p_total_value is null
    or p_purchase_date is null
    or p_status is null
    or p_total_value < 0
  then
    raise exception using errcode = '22023', message = 'Os dados da compra são inválidos.';
  end if;

  v_request_payload := jsonb_build_object(
    'command', 'create_purchase_atomically',
    'supplier_id', p_supplier_id,
    'vehicle_id', p_vehicle_id,
    'expected_vehicle_updated_at', p_expected_vehicle_updated_at,
    'total_value', p_total_value,
    'purchase_date', p_purchase_date,
    'status', p_status,
    'notes', nullif(btrim(p_notes), '')
  );

  insert into public.purchase_command_requests (
    auth_user_id, idempotency_key, request_payload
  ) values (
    v_auth_user_id, p_idempotency_key, v_request_payload
  ) on conflict (auth_user_id, idempotency_key) do nothing;
  get diagnostics v_request_rows_inserted = row_count;

  select request_payload, purchase_id
    into v_existing_payload, v_existing_purchase_id
    from public.purchase_command_requests
    where auth_user_id = v_auth_user_id
      and idempotency_key = p_idempotency_key
    for update;

  if v_request_rows_inserted = 0 then
    if v_existing_payload is distinct from v_request_payload then
      raise exception using
        errcode = '23505',
        message = 'Esta chave de idempotência já foi usada com outros dados de compra.';
    end if;
    if v_existing_purchase_id is null then
      raise exception using errcode = '23505', message = 'A tentativa de compra não possui um resultado disponível.';
    end if;
    return v_existing_purchase_id;
  end if;

  select * into v_vehicle
    from public.vehicles
    where id = p_vehicle_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'Veículo não encontrado para registrar compra.';
  end if;
  if v_vehicle.updated_at is distinct from p_expected_vehicle_updated_at then
    raise exception using
      errcode = '23505',
      message = 'STALE_RECORD: este veículo foi alterado por outra pessoa. Atualize os dados antes de registrar a compra.';
  end if;
  if v_vehicle.status not in ('evaluating', 'sold') then
    raise exception using
      errcode = '23505',
      message = 'O veículo não pode iniciar um novo ciclo de compra no estado atual.';
  end if;
  if v_vehicle.status = 'sold' then
    select status into v_latest_sale_status
      from public.sales
      where vehicle_id = p_vehicle_id
      order by created_at desc, id desc
      limit 1;
    if v_latest_sale_status is distinct from 'completed' then
      raise exception using
        errcode = '23505',
        message = 'O veículo vendido não possui uma venda concluída que permita iniciar outro ciclo de aquisição.';
    end if;
  end if;

  if exists (
    select 1 from public.purchases
      where vehicle_id = p_vehicle_id and status = 'pending'
  ) then
    raise exception using
      errcode = '23505',
      message = 'PURCHASE_ALREADY_PENDING: este veículo já possui uma compra pendente.';
  end if;

  select active into v_supplier_active
    from public.suppliers
    where id = p_supplier_id
    for share;
  if not found or not v_supplier_active then
    raise exception using errcode = '22023', message = 'Selecione um fornecedor ativo para registrar a compra.';
  end if;

  insert into public.purchases (
    supplier_id, vehicle_id, vehicle_status_before_purchase,
    total_value, purchase_date, status, notes
  ) values (
    p_supplier_id,
    p_vehicle_id,
    v_vehicle.status,
    p_total_value,
    p_purchase_date,
    case when p_status = 'completed' then 'pending'::public.purchase_status else p_status end,
    nullif(btrim(p_notes), '')
  ) returning id into v_purchase_id;

  if v_vehicle.status = 'sold' and p_status <> 'canceled' then
    update public.vehicles
      set status = 'evaluating', published = false
      where id = v_vehicle.id;
  end if;

  if p_status = 'completed' then
    perform public.complete_pending_purchase(v_purchase_id);
  end if;

  update public.purchase_command_requests
    set purchase_id = v_purchase_id
    where auth_user_id = v_auth_user_id
      and idempotency_key = p_idempotency_key;

  return v_purchase_id;
end;
$$;

create function public.update_purchase_with_version(
  p_idempotency_key uuid,
  p_purchase_id bigint,
  p_expected_updated_at timestamptz,
  p_supplier_id bigint,
  p_total_value numeric,
  p_purchase_date date,
  p_notes text
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
  v_existing_purchase_id bigint;
  v_request_rows_inserted integer;
  v_purchase public.purchases%rowtype;
  v_supplier_active boolean;
begin
  perform public.assert_purchase_access();

  if p_idempotency_key is null
    or p_purchase_id is null
    or p_expected_updated_at is null
    or p_supplier_id is null
    or p_total_value is null
    or p_purchase_date is null
    or p_total_value < 0
  then
    raise exception using errcode = '22023', message = 'Os dados da compra são inválidos.';
  end if;

  v_request_payload := jsonb_build_object(
    'command', 'update_purchase_with_version',
    'purchase_id', p_purchase_id,
    'expected_updated_at', p_expected_updated_at,
    'supplier_id', p_supplier_id,
    'total_value', p_total_value,
    'purchase_date', p_purchase_date,
    'notes', nullif(btrim(p_notes), '')
  );

  insert into public.purchase_command_requests (
    auth_user_id, idempotency_key, request_payload
  ) values (
    v_auth_user_id, p_idempotency_key, v_request_payload
  ) on conflict (auth_user_id, idempotency_key) do nothing;
  get diagnostics v_request_rows_inserted = row_count;

  select request_payload, purchase_id
    into v_existing_payload, v_existing_purchase_id
    from public.purchase_command_requests
    where auth_user_id = v_auth_user_id
      and idempotency_key = p_idempotency_key
    for update;

  if v_request_rows_inserted = 0 then
    if v_existing_payload is distinct from v_request_payload then
      raise exception using
        errcode = '23505',
        message = 'Esta chave de idempotência já foi usada com outros dados de compra.';
    end if;
    if v_existing_purchase_id is null then
      raise exception using errcode = '23505', message = 'A tentativa de compra não possui um resultado disponível.';
    end if;
    return v_existing_purchase_id;
  end if;

  select * into v_purchase
    from public.purchases
    where id = p_purchase_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'Compra não encontrada.';
  end if;
  if v_purchase.updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = '23505',
      message = 'STALE_RECORD: esta compra foi alterada por outra pessoa. Atualize os dados antes de salvar.';
  end if;
  if v_purchase.status <> 'pending' then
    raise exception using
      errcode = '23505',
      message = 'PURCHASE_NOT_PENDING: somente compras pendentes podem ser editadas.';
  end if;
  if v_purchase.financial_transaction_id is not null or exists (
    select 1 from public.financial_transactions
      where purchase_id = p_purchase_id and category = 'vehicle_purchase'
  ) then
    raise exception using
      errcode = '23505',
      message = 'PURCHASE_HAS_FINANCIAL_EFFECTS: esta compra já possui efeito financeiro e não pode ser editada.';
  end if;

  select active into v_supplier_active
    from public.suppliers
    where id = p_supplier_id
    for share;
  if not found or not v_supplier_active then
    raise exception using errcode = '22023', message = 'Selecione um fornecedor ativo para a compra.';
  end if;

  update public.purchases
    set supplier_id = p_supplier_id,
        total_value = p_total_value,
        purchase_date = p_purchase_date,
        notes = nullif(btrim(p_notes), '')
    where id = p_purchase_id;

  update public.purchase_command_requests
    set purchase_id = p_purchase_id
    where auth_user_id = v_auth_user_id
      and idempotency_key = p_idempotency_key;

  return p_purchase_id;
end;
$$;

create function public.transition_purchase(
  p_idempotency_key uuid,
  p_purchase_id bigint,
  p_action text,
  p_expected_updated_at timestamptz
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
  v_existing_purchase_id bigint;
  v_request_rows_inserted integer;
  v_purchase public.purchases%rowtype;
  v_vehicle public.vehicles%rowtype;
begin
  perform public.assert_purchase_access();

  if p_idempotency_key is null
    or p_purchase_id is null
    or p_action is null
    or p_action not in ('complete', 'cancel')
    or p_expected_updated_at is null
  then
    raise exception using errcode = '22023', message = 'Os dados da transição da compra são inválidos.';
  end if;

  v_request_payload := jsonb_build_object(
    'command', 'transition_purchase',
    'purchase_id', p_purchase_id,
    'action', p_action,
    'expected_updated_at', p_expected_updated_at
  );

  insert into public.purchase_command_requests (
    auth_user_id, idempotency_key, request_payload
  ) values (
    v_auth_user_id, p_idempotency_key, v_request_payload
  ) on conflict (auth_user_id, idempotency_key) do nothing;
  get diagnostics v_request_rows_inserted = row_count;

  select request_payload, purchase_id
    into v_existing_payload, v_existing_purchase_id
    from public.purchase_command_requests
    where auth_user_id = v_auth_user_id
      and idempotency_key = p_idempotency_key
    for update;

  if v_request_rows_inserted = 0 then
    if v_existing_payload is distinct from v_request_payload then
      raise exception using
        errcode = '23505',
        message = 'Esta chave de idempotência já foi usada com outra operação de compra.';
    end if;
    if v_existing_purchase_id is null then
      raise exception using errcode = '23505', message = 'A tentativa de compra não possui um resultado disponível.';
    end if;
    return v_existing_purchase_id;
  end if;

  select * into v_purchase
    from public.purchases
    where id = p_purchase_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'Compra não encontrada.';
  end if;
  if v_purchase.updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = '23505',
      message = 'STALE_RECORD: esta compra foi alterada por outra pessoa. Atualize os dados antes de tentar novamente.';
  end if;
  if v_purchase.status <> 'pending' then
    raise exception using
      errcode = '23505',
      message = 'PURCHASE_NOT_PENDING: outra ação já concluiu ou cancelou esta compra.';
  end if;

  select * into v_vehicle
    from public.vehicles
    where id = v_purchase.vehicle_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'Veículo da compra não encontrado.';
  end if;
  if v_vehicle.status <> 'evaluating'
    and not (p_action = 'cancel' and v_vehicle.status = 'archived')
  then
    raise exception using
      errcode = '23505',
      message = 'PURCHASE_VEHICLE_CHANGED: o veículo não está mais em avaliação. Atualize os dados antes de tentar novamente.';
  end if;

  if p_action = 'complete' then
    perform public.complete_pending_purchase(v_purchase.id);
  else
    update public.purchases
      set status = 'canceled'
      where id = v_purchase.id;
    update public.vehicles
      set status = v_purchase.vehicle_status_before_purchase,
          published = false
      where id = v_vehicle.id;
  end if;

  update public.purchase_command_requests
    set purchase_id = v_purchase.id
    where auth_user_id = v_auth_user_id
      and idempotency_key = p_idempotency_key;

  return v_purchase.id;
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
  if exists (
    select 1
      from public.purchases
      where vehicle_id = p_vehicle_id
        and status = 'pending'
  ) then
    raise exception using
      errcode = '23505',
      message = 'VEHICLE_HAS_PENDING_PURCHASE: cancele ou conclua a compra pendente antes de arquivar o veículo.';
  end if;

  update public.vehicles
    set published = false, status = 'archived'
    where id = p_vehicle_id
    returning * into v_vehicle;
  return v_vehicle;
end;
$$;

revoke all on function public.create_purchase_atomically(
  uuid, bigint, bigint, timestamptz, numeric, date, public.purchase_status, text
) from public, anon, service_role;
grant execute on function public.create_purchase_atomically(
  uuid, bigint, bigint, timestamptz, numeric, date, public.purchase_status, text
) to authenticated;

revoke all on function public.update_purchase_with_version(
  uuid, bigint, timestamptz, bigint, numeric, date, text
) from public, anon, service_role;
grant execute on function public.update_purchase_with_version(
  uuid, bigint, timestamptz, bigint, numeric, date, text
) to authenticated;

revoke all on function public.transition_purchase(uuid, bigint, text, timestamptz)
  from public, anon, service_role;
grant execute on function public.transition_purchase(uuid, bigint, text, timestamptz)
  to authenticated;

notify pgrst, 'reload schema';
