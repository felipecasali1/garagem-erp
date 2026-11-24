create function public.run_vehicle_visibility_command(
  p_idempotency_key uuid, p_vehicle_id bigint, p_expected_updated_at timestamptz,
  p_action text, p_published boolean
) returns public.vehicles language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_payload jsonb;
  v_existing public.status_command_requests%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_inserted integer;
begin
  perform public.assert_vehicle_sales_access();
  if p_idempotency_key is null or p_vehicle_id is null or p_expected_updated_at is null
    or p_action is null or p_action not in ('archive', 'publication')
    or (p_action = 'publication' and p_published is null)
    or (p_action = 'archive' and p_published is not null) then
    raise exception using errcode = '22023', message = 'Os dados da operação de veículo são inválidos.';
  end if;
  v_payload := jsonb_build_object('command', p_action, 'vehicle_id', p_vehicle_id,
    'expected_updated_at', p_expected_updated_at, 'published', p_published);
  insert into public.status_command_requests(auth_user_id, idempotency_key, request_payload)
    values (auth.uid(), p_idempotency_key, v_payload) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_existing from public.status_command_requests
    where auth_user_id = auth.uid() and idempotency_key = p_idempotency_key for update;
  if v_inserted = 0 then
    if v_existing.request_payload is distinct from v_payload then
      raise exception using errcode = '23505', message = 'Esta chave de idempotência já foi usada para outra operação.';
    end if;
    return jsonb_populate_record(null::public.vehicles, v_existing.result);
  end if;
  if p_action = 'archive' then
    v_vehicle := public.archive_vehicle_with_version(p_vehicle_id, p_expected_updated_at);
  else
    v_vehicle := public.set_vehicle_published_with_version(p_vehicle_id, p_expected_updated_at, p_published);
  end if;
  update public.status_command_requests set vehicle_id = p_vehicle_id, result = to_jsonb(v_vehicle)
    where auth_user_id = auth.uid() and idempotency_key = p_idempotency_key;
  return v_vehicle;
end;
$$;
revoke all on function public.run_vehicle_visibility_command(uuid, bigint, timestamptz, text, boolean) from public, anon, authenticated, service_role;

create function public.archive_vehicle_idempotent(p_idempotency_key uuid, p_vehicle_id bigint, p_expected_updated_at timestamptz)
returns public.vehicles language sql security definer set search_path = pg_catalog, public as $$
  select public.run_vehicle_visibility_command(p_idempotency_key, p_vehicle_id, p_expected_updated_at, 'archive', null);
$$;
create function public.set_vehicle_published_idempotent(p_idempotency_key uuid, p_vehicle_id bigint, p_expected_updated_at timestamptz, p_published boolean)
returns public.vehicles language sql security definer set search_path = pg_catalog, public as $$
  select public.run_vehicle_visibility_command(p_idempotency_key, p_vehicle_id, p_expected_updated_at, 'publication', p_published);
$$;
revoke all on function public.archive_vehicle_idempotent(uuid, bigint, timestamptz) from public, anon, service_role;
revoke all on function public.set_vehicle_published_idempotent(uuid, bigint, timestamptz, boolean) from public, anon, service_role;
grant execute on function public.archive_vehicle_idempotent(uuid, bigint, timestamptz) to authenticated;
grant execute on function public.set_vehicle_published_idempotent(uuid, bigint, timestamptz, boolean) to authenticated;
revoke execute on function public.archive_vehicle_with_version(bigint, timestamptz) from authenticated;
revoke execute on function public.set_vehicle_published_with_version(bigint, timestamptz, boolean) from authenticated;
revoke execute on function public.update_vehicle_with_version(bigint, timestamptz, jsonb) from authenticated;
