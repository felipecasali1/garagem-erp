create table public.person_configuration_command_requests (
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key uuid not null,
  person_id bigint references public.people (id) on delete restrict,
  request_payload jsonb not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (auth_user_id, idempotency_key)
);

alter table public.person_configuration_command_requests enable row level security;
revoke all on table public.person_configuration_command_requests
  from public, anon, authenticated, service_role;

revoke insert on public.people, public.customers,
  public.employees, public.suppliers from public, anon, authenticated;

create function public.create_person_configuration(
  p_idempotency_key uuid,
  p_person jsonb,
  p_roles jsonb,
  p_primary_address jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_request_payload jsonb;
  v_existing_payload jsonb;
  v_existing_result jsonb;
  v_request_rows_inserted integer;
  v_person_input public.people%rowtype;
  v_person_id bigint;
  v_person_role jsonb;
  v_person_role_name text;
  v_role_count integer;
  v_address_input public.addresses%rowtype;
  v_existing_address_id bigint;
  v_customer_input public.customers%rowtype;
  v_employee_input public.employees%rowtype;
  v_supplier_input public.suppliers%rowtype;
  v_customer_id bigint;
  v_employee_id bigint;
  v_supplier_id bigint;
  v_result jsonb := jsonb_build_object(
    'customer_id', null,
    'employee_id', null,
    'supplier_id', null
  );
begin
  if v_auth_user_id is null then
    raise exception using errcode = '42501', message = 'Faça login para cadastrar uma pessoa.';
  end if;

  if p_idempotency_key is null
    or p_person is null
    or jsonb_typeof(p_person) <> 'object'
    or (p_person - array['name', 'type', 'cpf', 'cnpj', 'phone', 'email', 'notes']) <> '{}'::jsonb
    or p_roles is null
    or jsonb_typeof(p_roles) <> 'array'
    or jsonb_array_length(p_roles) = 0
    or (p_primary_address is not null and jsonb_typeof(p_primary_address) <> 'object')
    or (
      p_primary_address is not null
      and (p_primary_address - array[
        'street', 'number', 'complement', 'neighborhood', 'city', 'state', 'zip_code'
      ]) <> '{}'::jsonb
    )
  then
    raise exception using errcode = '22023', message = 'Os dados da pessoa são inválidos.';
  end if;

  if nullif(btrim(p_person->>'name'), '') is null
    or p_person->>'type' not in ('individual', 'company')
  then
    raise exception using errcode = '22023', message = 'Informe um nome e tipo de pessoa válidos.';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_roles) as entry(value)
      where jsonb_typeof(entry.value) <> 'object'
        or entry.value->>'role' is null
        or entry.value->>'role' not in ('customer', 'employee', 'supplier')
        or (
          entry.value->>'role' = 'customer'
          and (entry.value - array['role', 'notes']) <> '{}'::jsonb
        )
        or (
          entry.value->>'role' = 'employee'
          and (entry.value - array[
            'role', 'position', 'salary', 'commission_rate',
            'commission_type', 'active', 'hired_at'
          ]) <> '{}'::jsonb
        )
        or (
          entry.value->>'role' = 'supplier'
          and (entry.value - array['role', 'supplier_type', 'notes']) <> '{}'::jsonb
        )
  ) then
    raise exception using errcode = '22023', message = 'Os papéis de negócio enviados são inválidos.';
  end if;

  select count(*) into v_role_count
    from (
      select entry.value->>'role'
        from jsonb_array_elements(p_roles) as entry(value)
       group by entry.value->>'role'
    ) as distinct_roles;
  if v_role_count <> jsonb_array_length(p_roles) then
    raise exception using errcode = '22023', message = 'Cada papel de negócio pode ser enviado apenas uma vez.';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_roles) as entry(value)
      where entry.value->>'role' in ('customer', 'supplier')
  ) and not public.has_any_role(array['admin', 'manager', 'seller']::public.user_access_role[])
  then
    raise exception using errcode = '42501', message = 'Seu usuário não tem permissão para cadastrar clientes ou fornecedores.';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_roles) as entry(value)
      where entry.value->>'role' = 'employee'
  ) and not public.has_any_role(array['admin', 'manager']::public.user_access_role[])
  then
    raise exception using errcode = '42501', message = 'Seu usuário não tem permissão para cadastrar funcionários.';
  end if;

  v_request_payload := jsonb_build_object(
    'command', 'create_person_configuration',
    'person', p_person,
    'roles', p_roles,
    'primary_address', p_primary_address
  );

  insert into public.person_configuration_command_requests (
    auth_user_id, idempotency_key, request_payload
  ) values (
    v_auth_user_id, p_idempotency_key, v_request_payload
  ) on conflict (auth_user_id, idempotency_key) do nothing;
  get diagnostics v_request_rows_inserted = row_count;

  select request_payload, result
    into v_existing_payload, v_existing_result
    from public.person_configuration_command_requests
    where auth_user_id = v_auth_user_id
      and idempotency_key = p_idempotency_key
    for update;

  if v_request_rows_inserted = 0 then
    if v_existing_payload is distinct from v_request_payload then
      raise exception using
        errcode = '23505',
        message = 'Esta chave de idempotência já foi usada com outros dados de pessoa.';
    end if;
    if v_existing_result is null then
      raise exception using errcode = '23505', message = 'O cadastro desta pessoa não possui resultado disponível.';
    end if;
    return v_existing_result;
  end if;

  v_person_input := jsonb_populate_record(null::public.people, p_person);
  v_person_input.name := btrim(v_person_input.name);
  v_person_input.cpf := nullif(regexp_replace(coalesce(v_person_input.cpf, ''), '\D', '', 'g'), '');
  v_person_input.cnpj := nullif(regexp_replace(coalesce(v_person_input.cnpj, ''), '\D', '', 'g'), '');
  v_person_input.phone := nullif(btrim(v_person_input.phone), '');
  v_person_input.email := nullif(btrim(v_person_input.email), '');
  v_person_input.notes := nullif(btrim(v_person_input.notes), '');

  if v_person_input.type = 'individual' and v_person_input.cpf is not null then
    insert into public.people (name, type, cpf, cnpj, phone, email, notes)
      values (
        v_person_input.name, v_person_input.type, v_person_input.cpf, null,
        v_person_input.phone, v_person_input.email, v_person_input.notes
      )
      on conflict (cpf) where cpf is not null
      do update set
        name = excluded.name,
        phone = excluded.phone,
        email = excluded.email,
        notes = case when p_person ? 'notes' then excluded.notes else people.notes end
      returning id into v_person_id;
  elsif v_person_input.type = 'company' and v_person_input.cnpj is not null then
    insert into public.people (name, type, cpf, cnpj, phone, email, notes)
      values (
        v_person_input.name, v_person_input.type, null, v_person_input.cnpj,
        v_person_input.phone, v_person_input.email, v_person_input.notes
      )
      on conflict (cnpj) where cnpj is not null
      do update set
        name = excluded.name,
        phone = excluded.phone,
        email = excluded.email,
        notes = case when p_person ? 'notes' then excluded.notes else people.notes end
      returning id into v_person_id;
  else
    insert into public.people (name, type, cpf, cnpj, phone, email, notes)
      values (
        v_person_input.name, v_person_input.type,
        case when v_person_input.type = 'individual' then v_person_input.cpf end,
        case when v_person_input.type = 'company' then v_person_input.cnpj end,
        v_person_input.phone, v_person_input.email, v_person_input.notes
      )
      returning id into v_person_id;
  end if;

  if p_primary_address is not null then
    v_address_input := jsonb_populate_record(null::public.addresses, p_primary_address);
    select id into v_existing_address_id
      from public.addresses
      where person_id = v_person_id
        and is_primary
      for update;

    if v_existing_address_id is null then
      insert into public.addresses (
        person_id, street, number, complement, neighborhood, city, state, zip_code, is_primary
      ) values (
        v_person_id,
        nullif(btrim(v_address_input.street), ''),
        nullif(btrim(v_address_input.number), ''),
        nullif(btrim(v_address_input.complement), ''),
        nullif(btrim(v_address_input.neighborhood), ''),
        nullif(btrim(v_address_input.city), ''),
        nullif(upper(btrim(v_address_input.state)), ''),
        nullif(regexp_replace(coalesce(v_address_input.zip_code, ''), '\D', '', 'g'), ''),
        true
      );
    else
      update public.addresses
        set street = nullif(btrim(v_address_input.street), ''),
            number = nullif(btrim(v_address_input.number), ''),
            complement = nullif(btrim(v_address_input.complement), ''),
            neighborhood = nullif(btrim(v_address_input.neighborhood), ''),
            city = nullif(btrim(v_address_input.city), ''),
            state = nullif(upper(btrim(v_address_input.state)), ''),
            zip_code = nullif(regexp_replace(coalesce(v_address_input.zip_code, ''), '\D', '', 'g'), '')
        where id = v_existing_address_id;
    end if;
  end if;

  for v_person_role in select value from jsonb_array_elements(p_roles)
  loop
    v_person_role_name := v_person_role->>'role';
    if v_person_role_name = 'customer' then
      v_customer_input := jsonb_populate_record(null::public.customers, v_person_role - 'role');
      insert into public.customers (person_id, notes)
        values (v_person_id, nullif(btrim(v_customer_input.notes), ''))
        returning id into v_customer_id;
      v_result := jsonb_set(v_result, '{customer_id}', to_jsonb(v_customer_id));
    elsif v_person_role_name = 'employee' then
      v_employee_input := jsonb_populate_record(null::public.employees, v_person_role - 'role');
      if nullif(btrim(v_employee_input.position), '') is null then
        raise exception using errcode = '22023', message = 'Informe o cargo do funcionário.';
      end if;
      insert into public.employees (
        person_id, position, salary, commission_rate, commission_type, active, hired_at
      ) values (
        v_person_id, btrim(v_employee_input.position),
        coalesce(v_employee_input.salary, 0), coalesce(v_employee_input.commission_rate, 0),
        coalesce(v_employee_input.commission_type, 'percentage'),
        coalesce(v_employee_input.active, true), coalesce(v_employee_input.hired_at, current_date)
      ) returning id into v_employee_id;
      v_result := jsonb_set(v_result, '{employee_id}', to_jsonb(v_employee_id));
    else
      v_supplier_input := jsonb_populate_record(null::public.suppliers, v_person_role - 'role');
      insert into public.suppliers (person_id, supplier_type, notes, active)
        values (
          v_person_id,
          coalesce(
            v_supplier_input.supplier_type,
            case when v_person_input.type = 'company' then 'company'::public.supplier_type
                 else 'individual'::public.supplier_type end
          ),
          nullif(btrim(v_supplier_input.notes), ''),
          true
        )
        on conflict (person_id) do update
          set supplier_type = excluded.supplier_type,
              notes = excluded.notes,
              active = true
        returning id into v_supplier_id;
      v_result := jsonb_set(v_result, '{supplier_id}', to_jsonb(v_supplier_id));
    end if;
  end loop;

  v_result := jsonb_build_object('person_id', v_person_id)
    || v_result;

  update public.person_configuration_command_requests
    set person_id = v_person_id,
        result = v_result
    where auth_user_id = v_auth_user_id
      and idempotency_key = p_idempotency_key;

  return v_result;
end;
$$;

revoke all on function public.create_person_configuration(uuid, jsonb, jsonb, jsonb)
  from public, anon, service_role;
grant execute on function public.create_person_configuration(uuid, jsonb, jsonb, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
