create function public.update_person_configuration(
  p_idempotency_key uuid,
  p_role text,
  p_role_id bigint,
  p_person jsonb,
  p_primary_address jsonb,
  p_role_data jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_person_id bigint;
  v_person public.people%rowtype;
  v_address public.addresses%rowtype;
  v_address_id bigint;
  v_customer public.customers%rowtype;
  v_supplier public.suppliers%rowtype;
  v_employee public.employees%rowtype;
  v_payload jsonb;
  v_existing public.person_configuration_command_requests%rowtype;
  v_inserted integer;
  v_result jsonb;
begin
  if auth.uid() is null or not public.has_any_role(array['admin', 'manager', 'seller']::public.user_access_role[])
    or (p_role = 'employee' and not public.has_any_role(array['admin', 'manager']::public.user_access_role[])) then
    raise exception using errcode = '42501', message = 'Seu usuário não tem permissão para editar este cadastro.';
  end if;
  if p_idempotency_key is null or p_role is null or p_role not in ('customer', 'supplier', 'employee')
    or p_role_id is null or p_person is null or jsonb_typeof(p_person) <> 'object'
    or (p_person - array['name', 'type', 'cpf', 'cnpj', 'phone', 'email']) <> '{}'::jsonb
    or p_primary_address is null or jsonb_typeof(p_primary_address) <> 'object'
    or (p_primary_address - array['street', 'number', 'complement', 'neighborhood', 'city', 'state', 'zip_code']) <> '{}'::jsonb
    or p_role_data is null or jsonb_typeof(p_role_data) <> 'object'
    or (p_role = 'customer' and (p_role_data - array['notes']) <> '{}'::jsonb)
    or (p_role = 'supplier' and (p_role_data - array['notes', 'supplier_type']) <> '{}'::jsonb)
    or (p_role = 'employee' and (p_role_data - array['position', 'salary', 'commission_rate', 'commission_type', 'hired_at']) <> '{}'::jsonb)
  then
    raise exception using errcode = '22023', message = 'Os dados da edição são inválidos.';
  end if;
  v_payload := jsonb_build_object('command', 'update_person_configuration', 'role', p_role,
    'role_id', p_role_id, 'person', p_person, 'primary_address', p_primary_address, 'role_data', p_role_data);
  insert into public.person_configuration_command_requests(auth_user_id, idempotency_key, request_payload)
    values (auth.uid(), p_idempotency_key, v_payload) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_existing from public.person_configuration_command_requests
    where auth_user_id = auth.uid() and idempotency_key = p_idempotency_key for update;
  if v_inserted = 0 then
    if v_existing.request_payload is distinct from v_payload then
      raise exception using errcode = '23505', message = 'Esta chave de idempotência já foi usada com outros dados de pessoa.';
    end if;
    return v_existing.result;
  end if;

  if p_role = 'customer' then
    select person_id into v_person_id from public.customers where id = p_role_id;
  elsif p_role = 'supplier' then
    select person_id into v_person_id from public.suppliers where id = p_role_id;
  else
    select person_id into v_person_id from public.employees where id = p_role_id;
  end if;
  if v_person_id is null then
    raise exception using errcode = '22023', message = 'Cadastro não encontrado.';
  end if;
  select * into v_person from public.people where id = v_person_id for update;
  if p_role = 'customer' then
    perform 1 from public.customers where id = p_role_id and person_id = v_person_id for update;
  elsif p_role = 'supplier' then
    perform 1 from public.suppliers where id = p_role_id and person_id = v_person_id for update;
  else
    perform 1 from public.employees where id = p_role_id and person_id = v_person_id for update;
  end if;
  if not found then
    raise exception using errcode = '23505', message = 'O vínculo deste cadastro mudou. Atualize os dados e tente novamente.';
  end if;
  v_person := jsonb_populate_record(v_person, p_person);
  if nullif(btrim(v_person.name), '') is null then
    raise exception using errcode = '22023', message = 'Informe o nome da pessoa.';
  end if;
  update public.people set name = btrim(v_person.name), type = v_person.type,
    cpf = nullif(regexp_replace(coalesce(v_person.cpf, ''), '\D', '', 'g'), ''),
    cnpj = nullif(regexp_replace(coalesce(v_person.cnpj, ''), '\D', '', 'g'), ''),
    phone = nullif(btrim(v_person.phone), ''), email = nullif(btrim(v_person.email), '')
    where id = v_person_id;

  v_address := jsonb_populate_record(null::public.addresses, p_primary_address);
  select id into v_address_id from public.addresses where person_id = v_person_id and is_primary for update;
  if v_address_id is null then
    insert into public.addresses(person_id, street, number, complement, neighborhood, city, state, zip_code, is_primary)
    values (v_person_id, nullif(btrim(v_address.street), ''), nullif(btrim(v_address.number), ''),
      nullif(btrim(v_address.complement), ''), nullif(btrim(v_address.neighborhood), ''),
      nullif(btrim(v_address.city), ''), nullif(upper(btrim(v_address.state)), ''),
      nullif(regexp_replace(coalesce(v_address.zip_code, ''), '\D', '', 'g'), ''), true);
  else
    update public.addresses set street = nullif(btrim(v_address.street), ''), number = nullif(btrim(v_address.number), ''),
      complement = nullif(btrim(v_address.complement), ''), neighborhood = nullif(btrim(v_address.neighborhood), ''),
      city = nullif(btrim(v_address.city), ''), state = nullif(upper(btrim(v_address.state)), ''),
      zip_code = nullif(regexp_replace(coalesce(v_address.zip_code, ''), '\D', '', 'g'), '') where id = v_address_id;
  end if;

  if p_role = 'customer' then
    select * into v_customer from public.customers where id = p_role_id;
    v_customer := jsonb_populate_record(v_customer, p_role_data);
    update public.customers set notes = nullif(btrim(v_customer.notes), '') where id = p_role_id;
  elsif p_role = 'supplier' then
    select * into v_supplier from public.suppliers where id = p_role_id;
    v_supplier := jsonb_populate_record(v_supplier, p_role_data);
    update public.suppliers set notes = nullif(btrim(v_supplier.notes), ''), supplier_type = v_supplier.supplier_type where id = p_role_id;
  else
    select * into v_employee from public.employees where id = p_role_id;
    v_employee := jsonb_populate_record(v_employee, p_role_data);
    update public.employees set position = btrim(v_employee.position), salary = v_employee.salary,
      commission_rate = v_employee.commission_rate, commission_type = v_employee.commission_type,
      hired_at = v_employee.hired_at where id = p_role_id;
  end if;
  v_result := jsonb_build_object('person_id', v_person_id, 'role', p_role, 'role_id', p_role_id);
  update public.person_configuration_command_requests set person_id = v_person_id, result = v_result
    where auth_user_id = auth.uid() and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;
revoke all on function public.update_person_configuration(uuid, text, bigint, jsonb, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.update_person_configuration(uuid, text, bigint, jsonb, jsonb, jsonb) to authenticated;
