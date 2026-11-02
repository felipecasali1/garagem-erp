create table public.user_auth_operations (
  operation_id uuid primary key,
  operation_type text not null check (operation_type in ('provision', 'remove')),
  status text not null default 'pending' check (status in ('pending', 'completed')),
  employee_id bigint references public.employees (id) on delete restrict,
  user_id bigint references public.users (id) on delete set null,
  auth_user_id uuid references auth.users (id) on delete set null,
  request_payload jsonb not null,
  result_user_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint user_auth_operations_target_check check (
    (operation_type = 'provision' and employee_id is not null and user_id is null)
    or (
      operation_type = 'remove'
      and employee_id is null
      and (user_id is not null or status = 'completed')
    )
  ),
  constraint user_auth_operations_completion_check check (
    (status = 'pending' and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  )
);

create unique index user_auth_operations_pending_employee_unique_idx
  on public.user_auth_operations (employee_id)
  where operation_type = 'provision' and status = 'pending';

create unique index user_auth_operations_pending_user_unique_idx
  on public.user_auth_operations (user_id)
  where operation_type = 'remove' and status = 'pending' and user_id is not null;

alter table public.user_auth_operations enable row level security;
revoke all on table public.user_auth_operations from public, anon, authenticated, service_role;

revoke insert, update, delete on public.users from public, anon, authenticated;

create function public.begin_user_provisioning(
  p_operation_id uuid,
  p_employee_id bigint,
  p_access_role public.user_access_role,
  p_is_admin boolean,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_operation public.user_auth_operations%rowtype;
  v_payload jsonb;
  v_person_id bigint;
  v_person_name text;
  v_email text;
  v_employee_active boolean;
  v_existing_user_id bigint;
begin
  if p_operation_id is null or p_employee_id is null or p_access_role is null
    or p_is_admin is null or p_active is null
  then
    raise exception using errcode = '22023', message = 'Os dados da operação de criação do User são inválidos.';
  end if;

  v_payload := jsonb_build_object(
    'employee_id', p_employee_id,
    'email', null,
    'access_role', p_access_role,
    'is_admin', p_is_admin,
    'active', p_active
  );

  select * into v_operation
    from public.user_auth_operations
    where operation_id = p_operation_id
    for update;

  if found then
    if v_operation.operation_type <> 'provision'
      or (v_operation.request_payload - 'email') is distinct from (v_payload - 'email')
    then
      raise exception using errcode = '23505', message = 'Este identificador já pertence a outra operação de User.';
    end if;

    select e.person_id, p.name, lower(nullif(btrim(p.email), ''))
      into v_person_id, v_person_name, v_email
      from public.employees as e
      join public.people as p on p.id = e.person_id
      where e.id = p_employee_id;

    return jsonb_build_object(
      'operation_id', v_operation.operation_id,
      'status', v_operation.status,
      'auth_user_id', v_operation.auth_user_id,
      'result_user_id', v_operation.result_user_id,
      'email', coalesce(v_operation.request_payload->>'email', v_email, ''),
      'name', coalesce(v_person_name, '')
    );
  end if;

  perform pg_advisory_xact_lock(p_employee_id);

  select e.person_id, p.name, lower(nullif(btrim(p.email), '')), e.active
    into v_person_id, v_person_name, v_email, v_employee_active
    from public.employees as e
    join public.people as p on p.id = e.person_id
    where e.id = p_employee_id
    for update of e;
  if not found then
    raise exception using errcode = '22023', message = 'Funcionário não encontrado para criar acesso.';
  end if;
  if not v_employee_active then
    raise exception using errcode = '23514', message = 'Reative o funcionário antes de criar um novo acesso.';
  end if;
  if v_email is null then
    raise exception using errcode = '22023', message = 'Cadastre um e-mail antes de criar o acesso desse funcionário.';
  end if;

  v_payload := jsonb_set(v_payload, '{email}', to_jsonb(v_email));

  select * into v_operation
    from public.user_auth_operations
    where operation_type = 'provision'
      and employee_id = p_employee_id
      and status = 'pending'
    for update;
  if found then
    if v_operation.request_payload is distinct from v_payload then
      raise exception using errcode = '23505', message = 'Há uma criação pendente com outros dados para este funcionário; retome ou resolva essa operação primeiro.';
    end if;
    return jsonb_build_object(
      'operation_id', v_operation.operation_id,
      'status', v_operation.status,
      'auth_user_id', v_operation.auth_user_id,
      'result_user_id', v_operation.result_user_id,
      'email', v_email,
      'name', v_person_name
    );
  end if;

  select id into v_existing_user_id
    from public.users
    where employee_id = p_employee_id or person_id = v_person_id
    for update;
  if found then
    raise exception using errcode = '23505', message = 'Esse funcionário já possui um User interno.';
  end if;

  insert into public.user_auth_operations (
    operation_id, operation_type, employee_id, request_payload
  ) values (
    p_operation_id, 'provision', p_employee_id, v_payload
  ) returning * into v_operation;

  return jsonb_build_object(
    'operation_id', v_operation.operation_id,
    'status', v_operation.status,
    'auth_user_id', v_operation.auth_user_id,
    'result_user_id', v_operation.result_user_id,
    'email', v_email,
    'name', v_person_name
  );
end;
$$;

create function public.record_user_auth_provisioned(
  p_operation_id uuid,
  p_auth_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_operation public.user_auth_operations%rowtype;
begin
  if p_operation_id is null or p_auth_user_id is null then
    raise exception using errcode = '22023', message = 'Os dados de vínculo do Auth são inválidos.';
  end if;

  select * into v_operation
    from public.user_auth_operations
    where operation_id = p_operation_id
    for update;
  if not found or v_operation.operation_type <> 'provision' then
    raise exception using errcode = '22023', message = 'Operação de criação de User não encontrada.';
  end if;
  if v_operation.status = 'completed' then
    if v_operation.auth_user_id is distinct from p_auth_user_id then
      raise exception using errcode = '23505', message = 'A operação já está vinculada a outra conta Auth.';
    end if;
    return;
  end if;
  if v_operation.auth_user_id is not null and v_operation.auth_user_id <> p_auth_user_id then
    raise exception using errcode = '23505', message = 'A operação já está vinculada a outra conta Auth.';
  end if;

  update public.user_auth_operations
    set auth_user_id = p_auth_user_id,
        updated_at = now()
    where operation_id = p_operation_id;
end;
$$;

create function public.complete_user_provisioning(
  p_operation_id uuid,
  p_auth_user_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_operation public.user_auth_operations%rowtype;
  v_employee public.employees%rowtype;
  v_employee_id bigint;
  v_user_id bigint;
  v_existing_auth_user_id uuid;
  v_requested_active boolean;
  v_access_role public.user_access_role;
  v_is_admin boolean;
begin
  if p_operation_id is null or p_auth_user_id is null then
    raise exception using errcode = '22023', message = 'Os dados para concluir o provisionamento são inválidos.';
  end if;

  select * into v_operation
    from public.user_auth_operations
    where operation_id = p_operation_id;
  if not found or v_operation.operation_type <> 'provision' then
    raise exception using errcode = '22023', message = 'Operação de criação de User não encontrada.';
  end if;

  v_employee_id := v_operation.employee_id;
  perform pg_advisory_xact_lock(v_employee_id);

  select * into v_operation
    from public.user_auth_operations
    where operation_id = p_operation_id
    for update;
  if not found or v_operation.operation_type <> 'provision' then
    raise exception using errcode = '22023', message = 'Operação de criação de User não encontrada.';
  end if;
  if v_operation.status = 'completed' then
    if v_operation.result_user_id is null then
      raise exception using errcode = '23505', message = 'A criação foi concluída sem User interno disponível.';
    end if;
    if v_operation.auth_user_id is distinct from p_auth_user_id then
      raise exception using errcode = '23505', message = 'A operação já foi concluída com outra conta Auth.';
    end if;
    return v_operation.result_user_id;
  end if;
  if v_operation.auth_user_id is distinct from p_auth_user_id then
    raise exception using errcode = '23505', message = 'A conta Auth ainda não foi confirmada para esta operação.';
  end if;

  select * into v_employee
    from public.employees
    where id = v_operation.employee_id
    for update;
  if not found then
    raise exception using errcode = '23503', message = 'O funcionário da operação não existe mais.';
  end if;

  v_access_role := (v_operation.request_payload->>'access_role')::public.user_access_role;
  v_is_admin := (v_operation.request_payload->>'is_admin')::boolean;
  v_requested_active := (v_operation.request_payload->>'active')::boolean;

  select id, auth_user_id into v_user_id, v_existing_auth_user_id
    from public.users
    where employee_id = v_employee.id or person_id = v_employee.person_id
    for update;

  if found then
    if v_existing_auth_user_id is distinct from p_auth_user_id then
      raise exception using errcode = '23505', message = 'O funcionário já possui outro User interno vinculado.';
    end if;
    update public.users
      set employee_id = v_employee.id,
          access_role = v_access_role,
          is_admin = v_is_admin,
          active = v_requested_active and v_employee.active
      where id = v_user_id;
  else
    insert into public.users (
      auth_user_id, person_id, employee_id, access_role, is_admin, active,
      email_verified_at, invited_at
    ) values (
      p_auth_user_id,
      v_employee.person_id,
      v_employee.id,
      v_access_role,
      v_is_admin,
      v_requested_active and v_employee.active,
      now(),
      now()
    ) returning id into v_user_id;
  end if;

  update public.user_auth_operations
    set status = 'completed',
        result_user_id = v_user_id,
        updated_at = now(),
        completed_at = now()
    where operation_id = p_operation_id;

  return v_user_id;
end;
$$;

create function public.begin_user_removal(
  p_operation_id uuid,
  p_user_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_operation public.user_auth_operations%rowtype;
  v_user public.users%rowtype;
  v_payload jsonb;
begin
  if p_operation_id is null or p_user_id is null then
    raise exception using errcode = '22023', message = 'Os dados da remoção do User são inválidos.';
  end if;

  v_payload := jsonb_build_object('user_id', p_user_id);

  select * into v_operation
    from public.user_auth_operations
    where operation_id = p_operation_id
    for update;
  if found then
    if v_operation.operation_type <> 'remove'
      or v_operation.request_payload is distinct from v_payload
    then
      raise exception using errcode = '23505', message = 'Este identificador já pertence a outra operação de User.';
    end if;
    return jsonb_build_object(
      'operation_id', v_operation.operation_id,
      'status', v_operation.status,
      'auth_user_id', v_operation.auth_user_id
    );
  end if;

  perform pg_advisory_xact_lock(p_user_id);

  select * into v_operation
    from public.user_auth_operations
    where operation_type = 'remove'
      and user_id = p_user_id
      and status = 'pending'
    for update;
  if found then
    return jsonb_build_object(
      'operation_id', v_operation.operation_id,
      'status', v_operation.status,
      'auth_user_id', v_operation.auth_user_id
    );
  end if;

  select * into v_operation
    from public.user_auth_operations
    where operation_type = 'remove'
      and request_payload->>'user_id' = p_user_id::text
      and status = 'completed'
    order by completed_at desc
    limit 1;
  if found then
    return jsonb_build_object(
      'operation_id', v_operation.operation_id,
      'status', v_operation.status,
      'auth_user_id', v_operation.auth_user_id
    );
  end if;

  select * into v_user
    from public.users
    where id = p_user_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'User interno não encontrado.';
  end if;

  update public.users set active = false where id = p_user_id;

  insert into public.user_auth_operations (
    operation_id, operation_type, user_id, auth_user_id, request_payload
  ) values (
    p_operation_id, 'remove', p_user_id, v_user.auth_user_id, v_payload
  ) returning * into v_operation;

  return jsonb_build_object(
    'operation_id', v_operation.operation_id,
    'status', v_operation.status,
    'auth_user_id', v_operation.auth_user_id
  );
end;
$$;

create function public.complete_user_removal(p_operation_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_operation public.user_auth_operations%rowtype;
begin
  if p_operation_id is null then
    raise exception using errcode = '22023', message = 'O identificador da operação é obrigatório.';
  end if;

  select * into v_operation
    from public.user_auth_operations
    where operation_id = p_operation_id
    for update;
  if not found or v_operation.operation_type <> 'remove' then
    raise exception using errcode = '22023', message = 'Operação de remoção do User não encontrada.';
  end if;
  if v_operation.status = 'completed' then
    return;
  end if;
  if v_operation.auth_user_id is not null then
    raise exception using
      errcode = '23514',
      message = 'AUTH_DELETION_NOT_CONFIRMED: a conta precisa desaparecer do Supabase Auth antes de remover o User interno.';
  end if;

  update public.user_auth_operations
    set status = 'completed', updated_at = now(), completed_at = now()
    where operation_id = p_operation_id;

  delete from public.users where id = v_operation.user_id;
end;
$$;

create function public.set_system_user_active(
  p_user_id bigint,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_employee_id bigint;
  v_employee_active boolean;
  v_current_employee_id bigint;
begin
  if p_user_id is null or p_active is null then
    raise exception using errcode = '22023', message = 'Os dados de ativação do User são inválidos.';
  end if;

  select employee_id into v_employee_id
    from public.users
    where id = p_user_id;
  if not found then
    raise exception using errcode = '22023', message = 'User interno não encontrado.';
  end if;

  if v_employee_id is not null then
    select active into v_employee_active
      from public.employees
      where id = v_employee_id
      for share;
    if not found then
      raise exception using errcode = '23503', message = 'Funcionário vinculado não encontrado.';
    end if;
    if p_active and not v_employee_active then
      raise exception using errcode = '23514', message = 'Reative o funcionário antes de reativar o User.';
    end if;
  end if;

  select employee_id into v_current_employee_id
    from public.users
    where id = p_user_id
    for update;
  if not found then
    raise exception using errcode = '22023', message = 'User interno não encontrado.';
  end if;
  if v_current_employee_id is distinct from v_employee_id then
    raise exception using errcode = '40001', message = 'O vínculo do User mudou; atualize e tente novamente.';
  end if;
  if p_active and exists (
    select 1
      from public.user_auth_operations
      where operation_type = 'remove'
        and user_id = p_user_id
        and status = 'pending'
  ) then
    raise exception using errcode = '23514', message = 'A remoção deste User ainda está pendente no Supabase Auth.';
  end if;

  update public.users set active = p_active where id = p_user_id;
end;
$$;

create or replace function public.set_employee_active_status(
  p_employee_id bigint,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.has_any_role(array['admin', 'manager']::public.user_access_role[]) then
    raise exception using errcode = '42501', message = 'Permissão negada para alterar status de funcionário.';
  end if;
  if p_employee_id is null or p_active is null then
    raise exception using errcode = '22023', message = 'Os dados do funcionário são inválidos.';
  end if;

  update public.employees set active = p_active where id = p_employee_id;
  if not found then
    raise exception using errcode = '22023', message = 'Funcionário não encontrado.';
  end if;
end;
$$;

create or replace function public.suspend_user_when_employee_inactive()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.active is distinct from new.active and not new.active then
    update public.users set active = false where employee_id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.guard_user_access_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.active then
    if new.employee_id is not null then
      perform 1
        from public.employees
        where id = new.employee_id
          and active
        for share;
      if not found then
        raise exception using
          errcode = '23514',
          message = 'Reative o funcionário vinculado antes de ativar este User.';
      end if;
    end if;

    if tg_op = 'UPDATE' and exists (
      select 1
        from public.user_auth_operations
        where operation_type = 'remove'
          and user_id = new.id
          and status = 'pending'
    ) then
      raise exception using
        errcode = '23514',
        message = 'A remoção deste User ainda está pendente no Supabase Auth.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists employees_suspend_linked_user on public.employees;
create trigger employees_suspend_linked_user
after update of active on public.employees
for each row execute function public.suspend_user_when_employee_inactive();

drop trigger if exists users_guard_access_status on public.users;
create trigger users_guard_access_status
before insert or update of active, employee_id on public.users
for each row execute function public.guard_user_access_status();

update public.users as u
  set active = false
  from public.employees as e
  where e.id = u.employee_id
    and not e.active
    and u.active;

revoke all on function public.begin_user_provisioning(
  uuid, bigint, public.user_access_role, boolean, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.begin_user_provisioning(
  uuid, bigint, public.user_access_role, boolean, boolean
) to service_role;

revoke all on function public.record_user_auth_provisioned(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.record_user_auth_provisioned(uuid, uuid)
  to service_role;

revoke all on function public.complete_user_provisioning(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_user_provisioning(uuid, uuid)
  to service_role;

revoke all on function public.begin_user_removal(uuid, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_user_removal(uuid, bigint)
  to service_role;

revoke all on function public.complete_user_removal(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_user_removal(uuid)
  to service_role;

revoke all on function public.set_system_user_active(bigint, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.set_system_user_active(bigint, boolean)
  to service_role;

revoke all on function public.set_employee_active_status(bigint, boolean)
  from public, anon, service_role;
grant execute on function public.set_employee_active_status(bigint, boolean)
  to authenticated, service_role;

revoke all on function public.suspend_user_when_employee_inactive()
  from public, anon, authenticated, service_role;

revoke all on function public.guard_user_access_status()
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
