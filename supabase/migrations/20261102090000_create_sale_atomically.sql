create table public.sale_creation_requests (
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key uuid not null,
  request_payload jsonb not null,
  sale_id bigint references public.sales (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (auth_user_id, idempotency_key)
);

alter table public.sale_creation_requests enable row level security;
revoke all on table public.sale_creation_requests from anon, authenticated;

create or replace function public.create_sale_with_reservation(
  p_idempotency_key uuid,
  p_vehicle_id bigint,
  p_customer_id bigint,
  p_employee_id bigint,
  p_status public.sale_status,
  p_sale_date date,
  p_sale_price numeric,
  p_discount numeric,
  p_notes text,
  p_payment_method public.payment_method,
  p_payment_status public.payment_status,
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
  v_payload jsonb;
  v_existing_payload jsonb;
  v_sale_id bigint;
  v_request_rows_inserted integer;
  v_vehicle public.vehicles%rowtype;
  v_customer_active boolean;
  v_employee public.employees%rowtype;
  v_total_value numeric(14, 2);
  v_payment_status public.payment_status;
  v_down_payment numeric(14, 2);
  v_remaining_amount numeric(14, 2);
  v_payment_date date;
  v_commission_amount numeric;
  v_commission_id bigint;
begin
  if v_auth_user_id is null
    or not public.has_any_role(array['admin', 'manager', 'seller']::public.user_access_role[])
  then
    raise exception using
      errcode = '42501',
      message = 'Seu usuário não tem permissão para registrar vendas.';
  end if;

  if p_idempotency_key is null
    or p_vehicle_id is null
    or p_customer_id is null
    or p_employee_id is null
    or p_status is null
    or p_sale_date is null
    or p_sale_price is null
    or p_discount is null
    or p_payment_method is null
    or p_payment_status is null
    or p_down_payment is null
    or p_installments_count is null
  then
    raise exception using errcode = '22023', message = 'Preencha os dados obrigatórios da venda.';
  end if;

  if p_status not in ('pending', 'completed') then
    raise exception using
      errcode = '22023',
      message = 'Uma venda deve ser criada pendente ou concluída.';
  end if;

  if p_payment_method = 'trade_in' then
    raise exception using
      errcode = '22023',
      message = 'Troca como forma de pagamento ainda depende do fluxo de veículo recebido.';
  end if;

  if p_sale_price <= 0 or p_discount < 0 or p_down_payment < 0 or p_installments_count < 1 then
    raise exception using errcode = '22023', message = 'Os valores informados para a venda são inválidos.';
  end if;

  v_total_value := round(p_sale_price - p_discount, 2);
  if v_total_value <= 0 then
    raise exception using
      errcode = '22023',
      message = 'O valor final da venda deve ser maior que zero.';
  end if;

  if p_payment_method = 'financing' and p_down_payment > v_total_value then
    raise exception using
      errcode = '22023',
      message = 'A entrada não pode ser maior que o valor final da venda.';
  end if;

  v_payment_date := coalesce(p_payment_date, p_sale_date);
  v_payload := jsonb_build_object(
    'vehicle_id', p_vehicle_id,
    'customer_id', p_customer_id,
    'employee_id', p_employee_id,
    'status', p_status,
    'sale_date', p_sale_date,
    'sale_price', p_sale_price,
    'discount', p_discount,
    'notes', nullif(btrim(p_notes), ''),
    'payment_method', p_payment_method,
    'payment_status', p_payment_status,
    'down_payment', p_down_payment,
    'installments_count', p_installments_count,
    'payment_date', v_payment_date
  );

  insert into public.sale_creation_requests (auth_user_id, idempotency_key, request_payload)
  values (v_auth_user_id, p_idempotency_key, v_payload)
  on conflict (auth_user_id, idempotency_key) do nothing;
  get diagnostics v_request_rows_inserted = row_count;

  select request_payload, sale_id
    into v_existing_payload, v_sale_id
    from public.sale_creation_requests
    where auth_user_id = v_auth_user_id
      and idempotency_key = p_idempotency_key
    for update;

  if v_request_rows_inserted = 0 then
    if v_existing_payload is distinct from v_payload then
      raise exception using
        errcode = '23505',
        message = 'Esta chave de idempotência já foi usada com dados diferentes.';
    end if;

    if v_sale_id is null then
      raise exception using
        errcode = '23505',
        message = 'Esta operação ainda está sendo processada. Tente novamente.';
    end if;

    return v_sale_id;
  end if;

  select *
    into v_vehicle
    from public.vehicles
    where id = p_vehicle_id
    for update;

  if not found then
    raise exception using errcode = '22023', message = 'Veículo não encontrado.';
  end if;

  if v_vehicle.status <> 'available' then
    raise exception using
      errcode = '23505',
      message = 'Este veículo não está disponível para venda; atualize a lista e tente outro veículo.';
  end if;

  if exists (
    select 1
      from public.vehicle_checklist_items
      where vehicle_id = p_vehicle_id
        and status not in ('completed', 'cancelled')
  ) then
    raise exception using
      errcode = '23505',
      message = 'Este veículo possui uma preparação pendente e não pode ser vendido.';
  end if;

  select active
    into v_customer_active
    from public.customers
    where id = p_customer_id
    for key share;

  if coalesce(v_customer_active, false) is not true then
    raise exception using errcode = '22023', message = 'Cliente não encontrado ou arquivado.';
  end if;

  select *
    into v_employee
    from public.employees
    where id = p_employee_id
    for key share;

  if not found or not v_employee.active then
    raise exception using errcode = '22023', message = 'Vendedor não encontrado ou inativo.';
  end if;

  if p_payment_method = 'financing' then
    v_down_payment := round(p_down_payment, 2);
    v_remaining_amount := greatest(0, v_total_value - v_down_payment);
    v_payment_status := case
      when p_status = 'pending' then 'pending'::public.payment_status
      when v_down_payment >= v_total_value then 'paid'::public.payment_status
      when v_down_payment > 0 then 'partial'::public.payment_status
      else 'pending'::public.payment_status
    end;
  else
    v_payment_status := case
      when p_status = 'pending' then 'pending'::public.payment_status
      else 'paid'::public.payment_status
    end;
    v_down_payment := case when p_status = 'pending' then 0 else v_total_value end;
    v_remaining_amount := case when p_status = 'pending' then v_total_value else 0 end;
  end if;

  insert into public.sales (
    customer_id,
    vehicle_id,
    employee_id,
    total_value,
    discount,
    status,
    sale_date,
    notes
  )
  values (
    p_customer_id,
    p_vehicle_id,
    p_employee_id,
    v_total_value,
    p_discount,
    p_status,
    p_sale_date,
    nullif(btrim(p_notes), '')
  )
  returning id into v_sale_id;

  insert into public.sale_payments (
    sale_id,
    payment_method,
    payment_status,
    down_payment,
    installments_count,
    payment_date,
    remaining_amount
  )
  values (
    v_sale_id,
    p_payment_method,
    v_payment_status,
    v_down_payment,
    p_installments_count,
    v_payment_date,
    v_remaining_amount
  );

  update public.vehicles
    set status = case
          when p_status = 'completed' then 'sold'::public.vehicle_status
          else 'reserved'::public.vehicle_status
        end,
        published = false
    where id = p_vehicle_id;

  if p_status = 'completed' then
    if p_payment_method = 'financing' then
      if v_down_payment > 0 then
        insert into public.financial_transactions (
          type, category, status, amount, transaction_date, paid_at, description, related, sale_id
        )
        values (
          'income',
          'vehicle_sale',
          'paid',
          v_down_payment,
          p_sale_date,
          now(),
          format('Entrada venda #%s - %s %s', v_sale_id, v_vehicle.brand, v_vehicle.model),
          v_vehicle.plate,
          v_sale_id
        );
      end if;

      if v_remaining_amount > 0 then
        insert into public.financial_transactions (
          type, category, status, amount, transaction_date, due_date, description, related, sale_id
        )
        values (
          'income',
          'vehicle_sale',
          'pending',
          v_remaining_amount,
          p_sale_date,
          v_payment_date,
          format('Repasse financiamento venda #%s - %s %s', v_sale_id, v_vehicle.brand, v_vehicle.model),
          v_vehicle.plate,
          v_sale_id
        );
      end if;
    else
      insert into public.financial_transactions (
        type, category, status, amount, transaction_date, paid_at, description, related, sale_id
      )
      values (
        'income',
        'vehicle_sale',
        'paid',
        v_total_value,
        p_sale_date,
        now(),
        format('Venda #%s - %s %s', v_sale_id, v_vehicle.brand, v_vehicle.model),
        v_vehicle.plate,
        v_sale_id
      );
    end if;

    v_commission_amount := case
      when v_employee.commission_type = 'percentage'
        then v_total_value * v_employee.commission_rate / 100
      else v_employee.commission_rate
    end;

    if v_commission_amount > 0 then
      insert into public.commissions (
        sale_id, employee_id, vehicle_id, type, rate, amount, status, due_date
      )
      values (
        v_sale_id,
        p_employee_id,
        p_vehicle_id,
        v_employee.commission_type,
        v_employee.commission_rate,
        v_commission_amount,
        'pending',
        p_sale_date
      )
      returning id into v_commission_id;

      insert into public.financial_transactions (
        type,
        category,
        status,
        amount,
        transaction_date,
        due_date,
        description,
        related,
        sale_id,
        employee_id,
        commission_id
      )
      values (
        'expense',
        'commission',
        'pending',
        v_commission_amount,
        p_sale_date,
        p_sale_date,
        format('Comissão venda #%s - %s %s', v_sale_id, v_vehicle.brand, v_vehicle.model),
        v_vehicle.plate,
        v_sale_id,
        p_employee_id,
        v_commission_id
      );
    end if;
  end if;

  update public.sale_creation_requests
    set sale_id = v_sale_id
    where auth_user_id = v_auth_user_id
      and idempotency_key = p_idempotency_key;

  return v_sale_id;
end;
$$;

revoke all on function public.create_sale_with_reservation(
  uuid, bigint, bigint, bigint, public.sale_status, date, numeric, numeric, text,
  public.payment_method, public.payment_status, numeric, integer, date
) from public, anon, service_role;

grant execute on function public.create_sale_with_reservation(
  uuid, bigint, bigint, bigint, public.sale_status, date, numeric, numeric, text,
  public.payment_method, public.payment_status, numeric, integer, date
) to authenticated;
