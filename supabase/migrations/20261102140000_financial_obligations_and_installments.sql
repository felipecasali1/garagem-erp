do $$
begin
  if exists (
    select 1
      from public.installments
      where num_nonnulls(transaction_id, sale_payment_id) <> 1
  ) then
    raise exception 'Não foi possível garantir a origem única das parcelas: corrija parcelas sem origem ou com duas origens antes de aplicar esta migration.';
  end if;

  if exists (
    select 1
      from public.installments
      where transaction_id is not null
      group by transaction_id, number
      having count(*) > 1
  ) or exists (
    select 1
      from public.installments
      where sale_payment_id is not null
      group by sale_payment_id, number
      having count(*) > 1
  ) then
    raise exception 'Não foi possível garantir a numeração única das parcelas: corrija os números duplicados antes de aplicar esta migration.';
  end if;
end;
$$;

alter table public.installments
  drop constraint installments_owner_check,
  add constraint installments_owner_check
    check (num_nonnulls(transaction_id, sale_payment_id) = 1);

create unique index installments_transaction_number_unique_idx
  on public.installments (transaction_id, number)
  where transaction_id is not null;

create unique index installments_sale_payment_number_unique_idx
  on public.installments (sale_payment_id, number)
  where sale_payment_id is not null;

create table public.financial_transaction_command_requests (
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key uuid not null,
  transaction_id bigint not null references public.financial_transactions (id) on delete cascade,
  request_payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (auth_user_id, idempotency_key)
);

alter table public.financial_transaction_command_requests enable row level security;
revoke all on table public.financial_transaction_command_requests
  from public, anon, authenticated, service_role;

create table public.installment_command_requests (
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key uuid not null,
  installment_id bigint not null references public.installments (id) on delete cascade,
  request_payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (auth_user_id, idempotency_key)
);

alter table public.installment_command_requests enable row level security;
revoke all on table public.installment_command_requests
  from public, anon, authenticated, service_role;

revoke insert, update, delete on public.financial_transactions
  from public, anon, authenticated;
revoke insert, update, delete on public.commissions
  from public, anon, authenticated;
revoke insert, update, delete on public.installments
  from public, anon, authenticated;

create function public.assert_financial_access()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null
    or not public.has_any_role(array['admin', 'manager', 'financial']::public.user_access_role[])
  then
    raise exception using errcode = '42501', message = 'Seu usuário não tem permissão para esta operação financeira.';
  end if;
end;
$$;

revoke all on function public.assert_financial_access()
  from public, anon, authenticated, service_role;

create function public.transition_financial_transaction(
  p_idempotency_key uuid,
  p_transaction_id bigint,
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
  v_existing_transaction_id bigint;
  v_request_rows_inserted integer;
  v_transaction public.financial_transactions%rowtype;
  v_commission public.commissions%rowtype;
  v_paid_at timestamptz;
begin
  perform public.assert_financial_access();

  if p_idempotency_key is null
    or p_transaction_id is null
    or p_action is null
    or p_action not in ('settle', 'cancel')
    or p_expected_updated_at is null
  then
    raise exception using errcode = '22023', message = 'Os dados da transição financeira são inválidos.';
  end if;

  v_request_payload := jsonb_build_object(
    'command', 'transition_financial_transaction',
    'transaction_id', p_transaction_id,
    'action', p_action,
    'expected_updated_at', p_expected_updated_at
  );

  insert into public.financial_transaction_command_requests (
    auth_user_id, idempotency_key, transaction_id, request_payload
  ) values (
    v_auth_user_id, p_idempotency_key, p_transaction_id, v_request_payload
  ) on conflict (auth_user_id, idempotency_key) do nothing;
  get diagnostics v_request_rows_inserted = row_count;

  select request_payload, transaction_id
    into v_existing_payload, v_existing_transaction_id
    from public.financial_transaction_command_requests
    where auth_user_id = v_auth_user_id
      and idempotency_key = p_idempotency_key
    for update;

  if v_request_rows_inserted = 0 then
    if v_existing_payload is distinct from v_request_payload then
      raise exception using
        errcode = '23505',
        message = 'Esta chave de idempotência já foi usada com outra operação financeira.';
    end if;
    return v_existing_transaction_id;
  end if;

  select * into v_transaction
    from public.financial_transactions
    where id = p_transaction_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'Lançamento financeiro não encontrado.';
  end if;

  if v_transaction.updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = '23505',
      message = 'STALE_RECORD: este lançamento financeiro mudou. Atualize os dados antes de tentar novamente.';
  end if;

  if exists (
    select 1
      from public.installments
      where transaction_id = v_transaction.id
  ) or (
    v_transaction.sale_id is not null
    and exists (
      select 1
        from public.sale_payments as payment
        join public.installments as installment
          on installment.sale_payment_id = payment.id
        where payment.sale_id = v_transaction.sale_id
    )
  ) then
    raise exception using
      errcode = '23505',
      message = 'FINANCIAL_TRANSACTION_HAS_INSTALLMENTS: quite as parcelas individualmente para manter o saldo da obrigação consistente.';
  end if;

  if p_action = 'settle' then
    if v_transaction.status not in ('pending', 'overdue') then
      raise exception using
        errcode = '23505',
        message = 'FINANCIAL_TRANSACTION_NOT_SETTLEABLE: somente obrigações pendentes ou vencidas podem ser quitadas.';
    end if;

    v_paid_at := clock_timestamp();
    if v_transaction.commission_id is not null then
      select * into v_commission
        from public.commissions
        where id = v_transaction.commission_id
        for update;
      if not found then
        raise exception using
          errcode = '23505',
          message = 'COMMISSION_NOT_FOUND: a comissão vinculada não foi encontrada; revise o lançamento antes de quitá-lo.';
      end if;
      v_paid_at := coalesce(v_commission.paid_at, v_paid_at);

      update public.commissions
        set status = 'paid', paid_at = v_paid_at
        where id = v_commission.id;
    end if;

    update public.financial_transactions
      set status = 'paid', paid_at = v_paid_at
      where id = v_transaction.id;
  else
    if v_transaction.sale_id is not null
      or v_transaction.purchase_id is not null
      or v_transaction.commission_id is not null
    then
      raise exception using
        errcode = '23505',
        message = 'FINANCIAL_TRANSACTION_HAS_ORIGIN: ajuste lançamentos vinculados pela operação de origem.';
    end if;
    if v_transaction.status not in ('pending', 'overdue') then
      raise exception using
        errcode = '23505',
        message = 'FINANCIAL_TRANSACTION_NOT_CANCELLABLE: somente obrigações pendentes ou vencidas podem ser canceladas; pagamentos confirmados precisam de ajuste financeiro próprio.';
    end if;

    update public.financial_transactions
      set status = 'canceled', paid_at = null
      where id = v_transaction.id;
  end if;

  return v_transaction.id;
end;
$$;

create function public.update_manual_financial_transaction_with_version(
  p_idempotency_key uuid,
  p_transaction_id bigint,
  p_expected_updated_at timestamptz,
  p_amount numeric,
  p_transaction_date date,
  p_due_date date,
  p_description text,
  p_related text
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
  v_existing_transaction_id bigint;
  v_request_rows_inserted integer;
  v_transaction public.financial_transactions%rowtype;
begin
  perform public.assert_financial_access();

  if p_idempotency_key is null
    or p_transaction_id is null
    or p_expected_updated_at is null
    or p_amount is null
    or p_amount <= 0
    or p_transaction_date is null
    or nullif(btrim(p_description), '') is null
  then
    raise exception using errcode = '22023', message = 'Os dados do lançamento financeiro são inválidos.';
  end if;

  v_request_payload := jsonb_build_object(
    'command', 'update_manual_financial_transaction_with_version',
    'transaction_id', p_transaction_id,
    'expected_updated_at', p_expected_updated_at,
    'amount', p_amount,
    'transaction_date', p_transaction_date,
    'due_date', p_due_date,
    'description', btrim(p_description),
    'related', nullif(btrim(p_related), '')
  );

  insert into public.financial_transaction_command_requests (
    auth_user_id, idempotency_key, transaction_id, request_payload
  ) values (
    v_auth_user_id, p_idempotency_key, p_transaction_id, v_request_payload
  ) on conflict (auth_user_id, idempotency_key) do nothing;
  get diagnostics v_request_rows_inserted = row_count;

  select request_payload, transaction_id
    into v_existing_payload, v_existing_transaction_id
    from public.financial_transaction_command_requests
    where auth_user_id = v_auth_user_id
      and idempotency_key = p_idempotency_key
    for update;

  if v_request_rows_inserted = 0 then
    if v_existing_payload is distinct from v_request_payload then
      raise exception using
        errcode = '23505',
        message = 'Esta chave de idempotência já foi usada com outros dados financeiros.';
    end if;
    return v_existing_transaction_id;
  end if;

  select * into v_transaction
    from public.financial_transactions
    where id = p_transaction_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'Lançamento financeiro não encontrado.';
  end if;
  if v_transaction.updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = '23505',
      message = 'STALE_RECORD: este lançamento financeiro mudou. Seu rascunho foi preservado; atualize e escolha como continuar.';
  end if;
  if v_transaction.sale_id is not null
    or v_transaction.purchase_id is not null
    or v_transaction.commission_id is not null
  then
    raise exception using
      errcode = '23505',
      message = 'FINANCIAL_TRANSACTION_HAS_ORIGIN: edite lançamentos vinculados pela operação de origem.';
  end if;
  if v_transaction.status not in ('pending', 'overdue') then
    raise exception using
      errcode = '23505',
      message = 'FINANCIAL_TRANSACTION_NOT_EDITABLE: somente lançamentos pendentes ou vencidos podem ser editados.';
  end if;
  if exists (
    select 1
      from public.installments
      where transaction_id = p_transaction_id
  ) then
    raise exception using
      errcode = '23505',
      message = 'FINANCIAL_TRANSACTION_HAS_INSTALLMENTS: ajuste os dados das parcelas antes de alterar o lançamento.';
  end if;

  update public.financial_transactions
    set amount = p_amount,
        transaction_date = p_transaction_date,
        due_date = p_due_date,
        description = btrim(p_description),
        related = nullif(btrim(p_related), '')
    where id = p_transaction_id;

  return v_transaction.id;
end;
$$;

create function public.settle_installment(
  p_idempotency_key uuid,
  p_installment_id bigint,
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
  v_existing_installment_id bigint;
  v_request_rows_inserted integer;
  v_transaction_id bigint;
  v_sale_payment_id bigint;
  v_sale_id bigint;
  v_transaction public.financial_transactions%rowtype;
  v_sale public.sales%rowtype;
  v_sale_payment public.sale_payments%rowtype;
  v_sale_transaction public.financial_transactions%rowtype;
  v_commission public.commissions%rowtype;
  v_installment public.installments%rowtype;
  v_paid_at timestamptz := clock_timestamp();
  v_remaining_amount numeric(14, 2);
  v_has_paid_installment boolean;
begin
  perform public.assert_financial_access();

  if p_idempotency_key is null
    or p_installment_id is null
    or p_expected_updated_at is null
  then
    raise exception using errcode = '22023', message = 'Os dados da quitação da parcela são inválidos.';
  end if;

  v_request_payload := jsonb_build_object(
    'command', 'settle_installment',
    'installment_id', p_installment_id,
    'expected_updated_at', p_expected_updated_at
  );

  insert into public.installment_command_requests (
    auth_user_id, idempotency_key, installment_id, request_payload
  ) values (
    v_auth_user_id, p_idempotency_key, p_installment_id, v_request_payload
  ) on conflict (auth_user_id, idempotency_key) do nothing;
  get diagnostics v_request_rows_inserted = row_count;

  select request_payload, installment_id
    into v_existing_payload, v_existing_installment_id
    from public.installment_command_requests
    where auth_user_id = v_auth_user_id
      and idempotency_key = p_idempotency_key
    for update;

  if v_request_rows_inserted = 0 then
    if v_existing_payload is distinct from v_request_payload then
      raise exception using
        errcode = '23505',
        message = 'Esta chave de idempotência já foi usada para outra parcela.';
    end if;
    return v_existing_installment_id;
  end if;

  select transaction_id, sale_payment_id
    into v_transaction_id, v_sale_payment_id
    from public.installments
    where id = p_installment_id;
  if not found then
    raise exception using errcode = '22023', message = 'Parcela não encontrada.';
  end if;

  if v_transaction_id is not null then
    select * into v_transaction
      from public.financial_transactions
      where id = v_transaction_id
      for update;
    if not found then
      raise exception using errcode = '22023', message = 'Obrigação da parcela não encontrada.';
    end if;
    if v_transaction.status not in ('pending', 'overdue') then
      raise exception using
        errcode = '23505',
        message = 'INSTALLMENT_ORIGIN_NOT_SETTLEABLE: a obrigação de origem não está pendente ou vencida.';
    end if;
  else
    select sale_id into v_sale_id
      from public.sale_payments
      where id = v_sale_payment_id;
    if not found then
      raise exception using errcode = '22023', message = 'Pagamento da venda da parcela não encontrado.';
    end if;

    select * into v_sale
      from public.sales
      where id = v_sale_id
      for update;
    if not found then
      raise exception using errcode = '22023', message = 'Venda da parcela não encontrada.';
    end if;
    if v_sale.status <> 'completed' then
      raise exception using
        errcode = '23505',
        message = 'INSTALLMENT_SALE_NOT_COMPLETED: parcelas de venda só podem ser recebidas após concluir a venda.';
    end if;

    select * into v_sale_payment
      from public.sale_payments
      where id = v_sale_payment_id
      for update;
    if not found then
      raise exception using errcode = '22023', message = 'Pagamento da venda da parcela não encontrado.';
    end if;
    if v_sale_payment.payment_status = 'paid' then
      raise exception using
        errcode = '23505',
        message = 'INSTALLMENT_PAYMENT_ALREADY_SETTLED: o pagamento da venda já está quitado.';
    end if;
  end if;

  select * into v_installment
    from public.installments
    where id = p_installment_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'Parcela não encontrada.';
  end if;
  if v_installment.transaction_id is distinct from v_transaction_id
    or v_installment.sale_payment_id is distinct from v_sale_payment_id
  then
    raise exception using
      errcode = '23505',
      message = 'STALE_RECORD: a origem desta parcela mudou. Atualize os dados antes de tentar novamente.';
  end if;
  if v_installment.updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = '23505',
      message = 'STALE_RECORD: esta parcela mudou. Atualize os dados antes de tentar novamente.';
  end if;
  if v_installment.status not in ('pending', 'overdue') then
    raise exception using
      errcode = '23505',
      message = 'INSTALLMENT_NOT_SETTLEABLE: somente parcelas pendentes ou vencidas podem ser quitadas.';
  end if;

  update public.installments
    set status = 'paid', paid_at = v_paid_at
    where id = v_installment.id;

  if v_transaction_id is not null then
    select coalesce(sum(amount) filter (where status <> 'paid'), 0)
      into v_remaining_amount
      from public.installments
      where transaction_id = v_transaction_id;

    if v_remaining_amount = 0 then
      update public.financial_transactions
        set status = 'paid', paid_at = v_paid_at
        where id = v_transaction.id;

      if v_transaction.commission_id is not null then
        select * into v_commission
          from public.commissions
          where id = v_transaction.commission_id
          for update;
        if not found then
          raise exception using
            errcode = '23505',
            message = 'COMMISSION_NOT_FOUND: a comissão vinculada não foi encontrada; revise o lançamento antes de concluir as parcelas.';
        end if;

        update public.commissions
          set status = 'paid', paid_at = v_paid_at
          where id = v_commission.id;
      end if;
    end if;
  else
    select coalesce(sum(amount) filter (where status <> 'paid'), 0),
           coalesce(bool_or(status = 'paid'), false)
      into v_remaining_amount, v_has_paid_installment
      from public.installments
      where sale_payment_id = v_sale_payment_id;

    update public.sale_payments
      set payment_status = case
            when v_remaining_amount = 0 then 'paid'::public.payment_status
            when v_has_paid_installment then 'partial'::public.payment_status
            else 'pending'::public.payment_status
          end,
          remaining_amount = v_remaining_amount
      where id = v_sale_payment_id;

    if v_remaining_amount = 0 then
      select * into v_sale_transaction
        from public.financial_transactions
        where sale_id = v_sale_id
          and type = 'income'
          and category = 'vehicle_sale'
          and status in ('pending', 'overdue')
        order by id
        limit 1
        for update;

      if found then
        update public.financial_transactions
          set status = 'paid', paid_at = v_paid_at
          where id = v_sale_transaction.id;
      end if;
    end if;
  end if;

  return v_installment.id;
end;
$$;

revoke all on function public.transition_financial_transaction(uuid, bigint, text, timestamptz)
  from public, anon, service_role;
grant execute on function public.transition_financial_transaction(uuid, bigint, text, timestamptz)
  to authenticated;

revoke all on function public.update_manual_financial_transaction_with_version(
  uuid, bigint, timestamptz, numeric, date, date, text, text
) from public, anon, service_role;
grant execute on function public.update_manual_financial_transaction_with_version(
  uuid, bigint, timestamptz, numeric, date, date, text, text
) to authenticated;

revoke all on function public.settle_installment(uuid, bigint, timestamptz)
  from public, anon, service_role;
grant execute on function public.settle_installment(uuid, bigint, timestamptz)
  to authenticated;

notify pgrst, 'reload schema';
