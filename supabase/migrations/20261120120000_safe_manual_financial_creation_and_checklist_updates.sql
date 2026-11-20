create table public.manual_financial_creation_requests (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  request_payload jsonb not null,
  transaction_id bigint references public.financial_transactions(id) on delete cascade,
  primary key (auth_user_id, idempotency_key)
);
alter table public.manual_financial_creation_requests enable row level security;
revoke all on public.manual_financial_creation_requests from public, anon, authenticated, service_role;

create function public.create_manual_financial_transaction(p_idempotency_key uuid, p_transaction jsonb)
returns bigint language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_input public.financial_transactions%rowtype;
  v_request public.manual_financial_creation_requests%rowtype;
  v_inserted integer;
  v_id bigint;
begin
  perform public.assert_financial_access();
  if p_idempotency_key is null or p_transaction is null or jsonb_typeof(p_transaction) <> 'object'
    or (p_transaction - array['type', 'category', 'status', 'amount', 'transaction_date', 'due_date', 'description', 'related', 'employee_id']) <> '{}'::jsonb
  then
    raise exception using errcode = '22023', message = 'Dados do lançamento financeiro inválidos.';
  end if;
  v_input := jsonb_populate_record(null::public.financial_transactions, p_transaction);
  if v_input.type is null or v_input.type not in ('income', 'expense')
    or v_input.category is null or v_input.category not in ('salary', 'commission', 'fixed_cost', 'other')
    or v_input.status is null or v_input.status not in ('pending', 'paid')
    or v_input.amount is null or v_input.amount <= 0 or v_input.transaction_date is null
    or nullif(trim(v_input.description), '') is null then
    raise exception using errcode = '22023', message = 'Dados do lançamento financeiro inválidos.';
  end if;
  insert into public.manual_financial_creation_requests(auth_user_id, idempotency_key, request_payload)
    values (auth.uid(), p_idempotency_key, p_transaction) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_request from public.manual_financial_creation_requests
    where auth_user_id = auth.uid() and idempotency_key = p_idempotency_key for update;
  if v_inserted = 0 then
    if v_request.request_payload is distinct from p_transaction then
      raise exception using errcode = '23505', message = 'Esta chave de idempotência já foi usada com outros dados financeiros.';
    end if;
    return v_request.transaction_id;
  end if;
  insert into public.financial_transactions(type, category, status, amount, transaction_date, due_date, paid_at, description, related, employee_id)
    values (v_input.type, v_input.category, v_input.status, v_input.amount, v_input.transaction_date,
      v_input.due_date, case when v_input.status = 'paid' then now() else null end,
      trim(v_input.description), nullif(trim(v_input.related), ''), v_input.employee_id)
    returning id into v_id;
  update public.manual_financial_creation_requests set transaction_id = v_id
    where auth_user_id = auth.uid() and idempotency_key = p_idempotency_key;
  return v_id;
end;
$$;
revoke all on function public.create_manual_financial_transaction(uuid, jsonb) from public, anon, service_role;
grant execute on function public.create_manual_financial_transaction(uuid, jsonb) to authenticated;

create table public.checklist_update_requests (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  item_id uuid references public.vehicle_checklist_items(id) on delete cascade,
  request_payload jsonb not null,
  result jsonb,
  primary key (auth_user_id, idempotency_key)
);
alter table public.checklist_update_requests enable row level security;
revoke all on public.checklist_update_requests from public, anon, authenticated, service_role;

create function public.update_vehicle_checklist_item_idempotent(
  p_idempotency_key uuid, p_item_id uuid, p_expected_updated_at timestamptz, p_changes jsonb
) returns public.vehicle_checklist_items
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_payload jsonb;
  v_request public.checklist_update_requests%rowtype;
  v_item public.vehicle_checklist_items%rowtype;
  v_inserted integer;
begin
  perform public.assert_vehicle_sales_access();
  if p_idempotency_key is null or p_item_id is null or p_expected_updated_at is null or p_changes is null then
    raise exception using errcode = '22023', message = 'Dados do checklist inválidos.';
  end if;
  v_payload := jsonb_build_object('item_id', p_item_id, 'expected_updated_at', p_expected_updated_at, 'changes', p_changes);
  insert into public.checklist_update_requests(auth_user_id, idempotency_key, request_payload)
    values (auth.uid(), p_idempotency_key, v_payload) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_request from public.checklist_update_requests
    where auth_user_id = auth.uid() and idempotency_key = p_idempotency_key for update;
  if v_inserted = 0 then
    if v_request.request_payload is distinct from v_payload then
      raise exception using errcode = '23505', message = 'Esta chave de idempotência já foi usada com outra alteração de checklist.';
    end if;
    return jsonb_populate_record(null::public.vehicle_checklist_items, v_request.result);
  end if;
  v_item := public.update_vehicle_checklist_item(p_item_id, p_expected_updated_at, p_changes);
  update public.checklist_update_requests set item_id = p_item_id, result = to_jsonb(v_item)
    where auth_user_id = auth.uid() and idempotency_key = p_idempotency_key;
  return v_item;
end;
$$;
revoke all on function public.update_vehicle_checklist_item_idempotent(uuid, uuid, timestamptz, jsonb) from public, anon, service_role;
grant execute on function public.update_vehicle_checklist_item_idempotent(uuid, uuid, timestamptz, jsonb) to authenticated;
revoke execute on function public.update_vehicle_checklist_item(uuid, timestamptz, jsonb) from authenticated;
