-- Compute commercial totals from the source of truth, including existing sales.
create index sales_customer_history_idx on public.sales (customer_id, sale_date desc, created_at desc, id desc) where status in ('pending', 'completed');

create function public.customer_purchase_totals(customer_ids bigint[])
returns table(customer_id bigint, total numeric)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.has_any_role(array['admin', 'manager', 'seller', 'financial']::public.user_access_role[]) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return query
    select c.id, coalesce(sum(s.total_value), 0)
    from public.customers c
    left join public.sales s on s.customer_id = c.id and s.status = 'completed'
    where c.id = any(customer_ids)
    group by c.id;
end;
$$;

create function public.customer_purchase_history(customer_id_input bigint)
returns table(id bigint, sale_date date, created_at timestamptz, brand text, model text, plate text, total_value numeric, status public.sale_status)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.has_any_role(array['admin', 'manager', 'seller', 'financial']::public.user_access_role[]) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return query
    select s.id, s.sale_date, s.created_at, v.brand, v.model, v.plate, s.total_value, s.status
    from public.sales s join public.vehicles v on v.id = s.vehicle_id
    where s.customer_id = customer_id_input and s.status in ('pending', 'completed')
    order by s.sale_date desc, s.created_at desc, s.id desc;
end;
$$;

revoke all on function public.customer_purchase_totals(bigint[]) from public, anon, service_role;
revoke all on function public.customer_purchase_history(bigint) from public, anon, service_role;
grant execute on function public.customer_purchase_totals(bigint[]) to authenticated;
grant execute on function public.customer_purchase_history(bigint) to authenticated;
