-- Read commercial totals from purchases so existing and concurrent changes are reflected.
create index purchases_supplier_history_idx
  on public.purchases (supplier_id, purchase_date desc, created_at desc, id desc)
  where status in ('pending', 'completed');

create function public.supplier_purchase_totals(supplier_ids bigint[])
returns table(supplier_id bigint, total numeric)
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
begin
  if not public.has_any_role(array['admin', 'manager', 'seller', 'financial']::public.user_access_role[]) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return query
    select s.id, coalesce(sum(p.total_value), 0)
    from public.suppliers s
    left join public.purchases p on p.supplier_id = s.id and p.status = 'completed'
    where s.id = any(supplier_ids)
    group by s.id;
end;
$$;

create function public.supplier_purchase_history(supplier_id_input bigint)
returns table(id bigint, purchase_date date, created_at timestamptz, brand text, model text, plate text, total_value numeric, status public.purchase_status)
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
begin
  if not public.has_any_role(array['admin', 'manager', 'seller', 'financial']::public.user_access_role[]) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return query
    select p.id, p.purchase_date, p.created_at, v.brand, v.model, v.plate, p.total_value, p.status
    from public.purchases p join public.vehicles v on v.id = p.vehicle_id
    where p.supplier_id = supplier_id_input and p.status in ('pending', 'completed')
    order by p.purchase_date desc, p.created_at desc, p.id desc;
end;
$$;

revoke all on function public.supplier_purchase_totals(bigint[]) from public, anon, service_role;
revoke all on function public.supplier_purchase_history(bigint) from public, anon, service_role;
grant execute on function public.supplier_purchase_totals(bigint[]) to authenticated;
grant execute on function public.supplier_purchase_history(bigint) to authenticated;
