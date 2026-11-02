create table public.sale_command_requests (
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key uuid not null,
  sale_id bigint not null references public.sales (id) on delete restrict,
  request_payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (auth_user_id, idempotency_key)
);

alter table public.sale_command_requests enable row level security;
revoke all on table public.sale_command_requests from public, anon, authenticated, service_role;

revoke insert, update, delete on public.sales, public.sale_payments from public, anon, authenticated;

create function public.transition_sale(
  p_idempotency_key uuid,
  p_sale_id bigint,
  p_action text,
  p_expected_sale_updated_at timestamptz,
  p_expected_payment_updated_at timestamptz
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
  v_existing_sale_id bigint;
  v_request_rows_inserted integer;
  v_sale public.sales%rowtype;
  v_payment public.sale_payments%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_employee public.employees%rowtype;
  v_payment_status public.payment_status;
  v_down_payment numeric(14, 2);
  v_remaining_amount numeric(14, 2);
  v_payment_date date;
  v_commission_amount numeric(14, 2);
  v_commission_id bigint;
begin
  perform public.assert_vehicle_sales_access();

  if p_idempotency_key is null
    or p_sale_id is null
    or p_action is null
    or p_action not in ('complete', 'cancel')
    or p_expected_sale_updated_at is null
    or p_expected_payment_updated_at is null
  then
    raise exception using errcode = '22023', message = 'Os dados da transição da venda são inválidos.';
  end if;

  v_request_payload := jsonb_build_object(
    'command', 'transition_sale',
    'sale_id', p_sale_id,
    'action', p_action,
    'expected_sale_updated_at', p_expected_sale_updated_at,
    'expected_payment_updated_at', p_expected_payment_updated_at
  );

  insert into public.sale_command_requests (
    auth_user_id, idempotency_key, sale_id, request_payload
  ) values (
    v_auth_user_id, p_idempotency_key, p_sale_id, v_request_payload
  ) on conflict (auth_user_id, idempotency_key) do nothing;
  get diagnostics v_request_rows_inserted = row_count;

  select request_payload, sale_id
    into v_existing_payload, v_existing_sale_id
    from public.sale_command_requests
    where auth_user_id = v_auth_user_id
      and idempotency_key = p_idempotency_key
    for update;

  if v_request_rows_inserted = 0 then
    if v_existing_payload is distinct from v_request_payload then
      raise exception using
        errcode = '23505',
        message = 'Esta chave de idempotência já foi usada com outra operação de venda.';
    end if;
    return v_existing_sale_id;
  end if;

  select * into v_sale
    from public.sales
    where id = p_sale_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'Venda não encontrada.';
  end if;

  select * into v_payment
    from public.sale_payments
    where sale_id = p_sale_id
    order by id
    limit 1
    for update;
  if not found then
    raise exception using errcode = '23505', message = 'O pagamento da venda não foi encontrado; atualize os dados antes de continuar.';
  end if;

  if v_sale.updated_at is distinct from p_expected_sale_updated_at
    or v_payment.updated_at is distinct from p_expected_payment_updated_at
  then
    raise exception using
      errcode = '23505',
      message = 'STALE_RECORD: esta venda ou pagamento mudou. Atualize os dados antes de tentar novamente.';
  end if;

  if v_sale.status <> 'pending' then
    raise exception using
      errcode = '23505',
      message = 'SALE_NOT_PENDING: outra ação já concluiu ou cancelou esta venda.';
  end if;

  select * into v_vehicle
    from public.vehicles
    where id = v_sale.vehicle_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'Veículo da venda não encontrado.';
  end if;
  if v_vehicle.status <> 'reserved' then
    raise exception using
      errcode = '23505',
      message = 'O veículo não está mais reservado por esta venda. Atualize o estado antes de continuar.';
  end if;

  if exists (
    select 1
      from public.commissions
      where sale_id = p_sale_id
  ) or exists (
    select 1
      from public.financial_transactions
      where sale_id = p_sale_id
        and category in ('vehicle_sale', 'commission')
  ) then
    raise exception using
      errcode = '23505',
      message = 'SALE_HAS_FINANCIAL_EFFECTS: esta venda já possui lançamentos financeiros e precisa ser revisada antes da transição.';
  end if;

  if p_action = 'complete' then
    if exists (
      select 1
        from public.vehicle_checklist_items
        where vehicle_id = v_sale.vehicle_id
          and status not in ('completed', 'cancelled')
    ) then
      raise exception using
        errcode = '23505',
        message = 'VEHICLE_HAS_OPEN_PREPARATION: conclua ou cancele as tarefas de preparação antes de concluir a venda.';
    end if;

    if v_payment.payment_method = 'trade_in' then
      raise exception using
        errcode = '22023',
        message = 'Troca como forma de pagamento ainda depende do fluxo de veículo recebido.';
    end if;

    select * into v_employee
      from public.employees
      where id = v_sale.employee_id
      for key share;
    if not found then
      raise exception using errcode = '22023', message = 'Vendedor da venda não encontrado.';
    end if;

    if v_payment.payment_method = 'financing' then
      v_down_payment := round(v_payment.down_payment, 2);
      if v_down_payment > v_sale.total_value then
        raise exception using
          errcode = '22023',
          message = 'A entrada não pode ser maior que o valor final da venda.';
      end if;
      v_remaining_amount := greatest(0, v_sale.total_value - v_down_payment);
      v_payment_status := case
        when v_down_payment >= v_sale.total_value then 'paid'::public.payment_status
        when v_down_payment > 0 then 'partial'::public.payment_status
        else 'pending'::public.payment_status
      end;
    else
      v_down_payment := v_sale.total_value;
      v_remaining_amount := 0;
      v_payment_status := 'paid';
    end if;

    v_payment_date := coalesce(v_payment.payment_date, v_sale.sale_date);

    update public.sale_payments
      set payment_status = v_payment_status,
          down_payment = v_down_payment,
          remaining_amount = v_remaining_amount,
          payment_date = v_payment_date
      where id = v_payment.id;

    update public.vehicles
      set status = 'sold', published = false
      where id = v_vehicle.id;

    if v_payment.payment_method = 'financing' then
      if v_down_payment > 0 then
        insert into public.financial_transactions (
          type, category, status, amount, transaction_date, paid_at, description, related, sale_id
        ) values (
          'income',
          'vehicle_sale',
          'paid',
          v_down_payment,
          v_sale.sale_date,
          now(),
          format('Entrada venda #%s - %s %s', v_sale.id, v_vehicle.brand, v_vehicle.model),
          v_vehicle.plate,
          v_sale.id
        );
      end if;

      if v_remaining_amount > 0 then
        insert into public.financial_transactions (
          type, category, status, amount, transaction_date, due_date, description, related, sale_id
        ) values (
          'income',
          'vehicle_sale',
          'pending',
          v_remaining_amount,
          v_sale.sale_date,
          v_payment_date,
          format('Repasse financiamento venda #%s - %s %s', v_sale.id, v_vehicle.brand, v_vehicle.model),
          v_vehicle.plate,
          v_sale.id
        );
      end if;
    else
      insert into public.financial_transactions (
        type, category, status, amount, transaction_date, paid_at, description, related, sale_id
      ) values (
        'income',
        'vehicle_sale',
        'paid',
        v_sale.total_value,
        v_sale.sale_date,
        now(),
        format('Venda #%s - %s %s', v_sale.id, v_vehicle.brand, v_vehicle.model),
        v_vehicle.plate,
        v_sale.id
      );
    end if;

    v_commission_amount := round(case
      when v_employee.commission_type = 'percentage'
        then v_sale.total_value * v_employee.commission_rate / 100
      else v_employee.commission_rate
    end, 2);

    if v_commission_amount > 0 then
      insert into public.commissions (
        sale_id, employee_id, vehicle_id, type, rate, amount, status, due_date
      ) values (
        v_sale.id,
        v_sale.employee_id,
        v_sale.vehicle_id,
        v_employee.commission_type,
        v_employee.commission_rate,
        v_commission_amount,
        'pending',
        v_sale.sale_date
      ) returning id into v_commission_id;

      insert into public.financial_transactions (
        type, category, status, amount, transaction_date, due_date, description,
        related, sale_id, employee_id, commission_id
      ) values (
        'expense',
        'commission',
        'pending',
        v_commission_amount,
        v_sale.sale_date,
        v_sale.sale_date,
        format('Comissão venda #%s - %s %s', v_sale.id, v_vehicle.brand, v_vehicle.model),
        v_vehicle.plate,
        v_sale.id,
        v_sale.employee_id,
        v_commission_id
      );
    end if;

    update public.sales
      set status = 'completed'
      where id = v_sale.id;
  else
    update public.sales
      set status = 'canceled'
      where id = v_sale.id;

    update public.vehicles
      set status = case
            when exists (
              select 1
                from public.vehicle_checklist_items
                where vehicle_id = v_vehicle.id
                  and status not in ('completed', 'cancelled')
            ) then 'in_repair'::public.vehicle_status
            else 'available'::public.vehicle_status
          end,
          published = false
      where id = v_vehicle.id;
  end if;

  return v_sale.id;
end;
$$;

create function public.update_sale_payment_with_version(
  p_idempotency_key uuid,
  p_sale_id bigint,
  p_expected_sale_updated_at timestamptz,
  p_expected_payment_updated_at timestamptz,
  p_sale_price numeric,
  p_discount numeric,
  p_notes text,
  p_payment_method public.payment_method,
  p_down_payment numeric,
  p_installments_count integer,
  p_payment_date date
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
  v_existing_sale_id bigint;
  v_request_rows_inserted integer;
  v_sale public.sales%rowtype;
  v_payment public.sale_payments%rowtype;
  v_total_value numeric(14, 2);
  v_down_payment numeric(14, 2);
  v_remaining_amount numeric(14, 2);
  v_payment_date date;
begin
  perform public.assert_vehicle_sales_access();

  if p_idempotency_key is null
    or p_sale_id is null
    or p_expected_sale_updated_at is null
    or p_expected_payment_updated_at is null
    or p_sale_price is null
    or p_discount is null
    or p_payment_method is null
    or p_down_payment is null
    or p_installments_count is null
    or p_sale_price <= 0
    or p_discount < 0
    or round(p_sale_price - p_discount, 2) <= 0
    or p_down_payment < 0
    or p_installments_count < 1
  then
    raise exception using errcode = '22023', message = 'Os dados da venda e do pagamento são inválidos.';
  end if;

  if p_payment_method = 'trade_in' then
    raise exception using
      errcode = '22023',
      message = 'Troca como forma de pagamento ainda depende do fluxo de veículo recebido.';
  end if;

  v_total_value := round(p_sale_price - p_discount, 2);
  if p_payment_method = 'financing' and p_down_payment > v_total_value then
    raise exception using
      errcode = '22023',
      message = 'A entrada não pode ser maior que o valor final da venda.';
  end if;

  v_request_payload := jsonb_build_object(
    'command', 'update_sale_payment_with_version',
    'sale_id', p_sale_id,
    'expected_sale_updated_at', p_expected_sale_updated_at,
    'expected_payment_updated_at', p_expected_payment_updated_at,
    'sale_price', p_sale_price,
    'discount', p_discount,
    'notes', nullif(btrim(p_notes), ''),
    'payment_method', p_payment_method,
    'down_payment', p_down_payment,
    'installments_count', p_installments_count,
    'payment_date', p_payment_date
  );

  insert into public.sale_command_requests (
    auth_user_id, idempotency_key, sale_id, request_payload
  ) values (
    v_auth_user_id, p_idempotency_key, p_sale_id, v_request_payload
  ) on conflict (auth_user_id, idempotency_key) do nothing;
  get diagnostics v_request_rows_inserted = row_count;

  select request_payload, sale_id
    into v_existing_payload, v_existing_sale_id
    from public.sale_command_requests
    where auth_user_id = v_auth_user_id
      and idempotency_key = p_idempotency_key
    for update;

  if v_request_rows_inserted = 0 then
    if v_existing_payload is distinct from v_request_payload then
      raise exception using
        errcode = '23505',
        message = 'Esta chave de idempotência já foi usada com outros dados de venda.';
    end if;
    return v_existing_sale_id;
  end if;

  select * into v_sale
    from public.sales
    where id = p_sale_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'Venda não encontrada.';
  end if;

  select * into v_payment
    from public.sale_payments
    where sale_id = p_sale_id
    order by id
    limit 1
    for update;
  if not found then
    raise exception using errcode = '23505', message = 'O pagamento da venda não foi encontrado.';
  end if;

  if v_sale.updated_at is distinct from p_expected_sale_updated_at
    or v_payment.updated_at is distinct from p_expected_payment_updated_at
  then
    raise exception using
      errcode = '23505',
      message = 'STALE_RECORD: esta venda ou pagamento mudou. Atualize os dados antes de tentar novamente.';
  end if;

  if v_sale.status <> 'pending' then
    raise exception using
      errcode = '23505',
      message = 'SALE_NOT_PENDING: somente vendas pendentes podem ter valores alterados.';
  end if;

  v_down_payment := case
    when p_payment_method = 'financing' then round(p_down_payment, 2)
    else 0
  end;
  v_remaining_amount := case
    when p_payment_method = 'financing' then v_total_value - v_down_payment
    else v_total_value
  end;
  v_payment_date := coalesce(p_payment_date, v_sale.sale_date);

  update public.sales
    set total_value = v_total_value,
        discount = p_discount,
        notes = nullif(btrim(p_notes), '')
    where id = v_sale.id;

  update public.sale_payments
    set payment_method = p_payment_method,
        payment_status = 'pending',
        down_payment = v_down_payment,
        installments_count = p_installments_count,
        payment_date = v_payment_date,
        remaining_amount = v_remaining_amount
    where id = v_payment.id;

  return v_sale.id;
end;
$$;

revoke all on function public.transition_sale(uuid, bigint, text, timestamptz, timestamptz)
  from public, anon, service_role;
grant execute on function public.transition_sale(uuid, bigint, text, timestamptz, timestamptz)
  to authenticated;

revoke all on function public.update_sale_payment_with_version(
  uuid, bigint, timestamptz, timestamptz, numeric, numeric, text,
  public.payment_method, numeric, integer, date
) from public, anon, service_role;
grant execute on function public.update_sale_payment_with_version(
  uuid, bigint, timestamptz, timestamptz, numeric, numeric, text,
  public.payment_method, numeric, integer, date
) to authenticated;

notify pgrst, 'reload schema';
