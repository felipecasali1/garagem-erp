create or replace function public.is_authenticated()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null;
$$;

create or replace function public.current_access_role()
returns user_access_role
language sql
stable
security definer
set search_path = public
as $$
  select u.access_role
  from public.users as u
  where u.auth_user_id = auth.uid()
    and u.active = true
  limit 1;
$$;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select u.is_admin or u.access_role = 'admin'
      from public.users as u
      where u.auth_user_id = auth.uid()
        and u.active = true
      limit 1
    ),
    false
  );
$$;

create or replace function public.has_any_role(allowed_roles user_access_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_admin_user()
    or (
      select u.access_role = any(allowed_roles)
      from public.users as u
      where u.auth_user_id = auth.uid()
        and u.active = true
      limit 1
    ),
    false
  );
$$;

alter table public.people enable row level security;
alter table public.addresses enable row level security;
alter table public.employees enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.vehicles enable row level security;
alter table public.accessories enable row level security;
alter table public.vehicle_accessories enable row level security;
alter table public.users enable row level security;
alter table public.vehicle_checklist_items enable row level security;
alter table public.sales enable row level security;
alter table public.sale_payments enable row level security;
alter table public.commissions enable row level security;
alter table public.purchases enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.installments enable row level security;
alter table public.company_settings enable row level security;

create policy "people_select_authenticated"
  on public.people
  for select
  using (public.is_authenticated());

create policy "people_write_management"
  on public.people
  for all
  using (public.has_any_role(array['admin', 'manager', 'seller']::user_access_role[]))
  with check (public.has_any_role(array['admin', 'manager', 'seller']::user_access_role[]));

create policy "addresses_select_authenticated"
  on public.addresses
  for select
  using (public.is_authenticated());

create policy "addresses_write_management"
  on public.addresses
  for all
  using (public.has_any_role(array['admin', 'manager', 'seller']::user_access_role[]))
  with check (public.has_any_role(array['admin', 'manager', 'seller']::user_access_role[]));

create policy "employees_select_authenticated"
  on public.employees
  for select
  using (public.is_authenticated());

create policy "employees_write_management"
  on public.employees
  for all
  using (public.has_any_role(array['admin', 'manager']::user_access_role[]))
  with check (public.has_any_role(array['admin', 'manager']::user_access_role[]));

create policy "customers_select_authenticated"
  on public.customers
  for select
  using (public.is_authenticated());

create policy "customers_write_sales"
  on public.customers
  for all
  using (
    public.has_any_role(array['admin', 'manager', 'seller']::user_access_role[])
  )
  with check (
    public.has_any_role(array['admin', 'manager', 'seller']::user_access_role[])
  );

create policy "suppliers_select_authenticated"
  on public.suppliers
  for select
  using (public.is_authenticated());

create policy "suppliers_write_sales"
  on public.suppliers
  for all
  using (
    public.has_any_role(array['admin', 'manager', 'seller']::user_access_role[])
  )
  with check (
    public.has_any_role(array['admin', 'manager', 'seller']::user_access_role[])
  );

create policy "vehicles_select_authenticated"
  on public.vehicles
  for select
  using (public.is_authenticated());

create policy "vehicles_write_sales"
  on public.vehicles
  for all
  using (
    public.has_any_role(array['admin', 'manager', 'seller']::user_access_role[])
  )
  with check (
    public.has_any_role(array['admin', 'manager', 'seller']::user_access_role[])
  );

create policy "accessories_select_authenticated"
  on public.accessories
  for select
  using (public.is_authenticated());

create policy "accessories_write_sales"
  on public.accessories
  for all
  using (
    public.has_any_role(array['admin', 'manager', 'seller']::user_access_role[])
  )
  with check (
    public.has_any_role(array['admin', 'manager', 'seller']::user_access_role[])
  );

create policy "vehicle_accessories_select_authenticated"
  on public.vehicle_accessories
  for select
  using (public.is_authenticated());

create policy "vehicle_accessories_write_sales"
  on public.vehicle_accessories
  for all
  using (
    public.has_any_role(array['admin', 'manager', 'seller']::user_access_role[])
  )
  with check (
    public.has_any_role(array['admin', 'manager', 'seller']::user_access_role[])
  );

create policy "users_select_self_or_management"
  on public.users
  for select
  using (
    auth.uid() = auth_user_id
    or public.has_any_role(array['admin', 'manager']::user_access_role[])
  );

create policy "users_write_management"
  on public.users
  for all
  using (public.has_any_role(array['admin', 'manager']::user_access_role[]))
  with check (public.has_any_role(array['admin', 'manager']::user_access_role[]));

create policy "vehicle_checklist_items_select_authenticated"
  on public.vehicle_checklist_items
  for select
  using (public.is_authenticated());

create policy "vehicle_checklist_items_write_sales"
  on public.vehicle_checklist_items
  for all
  using (
    public.has_any_role(array['admin', 'manager', 'seller']::user_access_role[])
  )
  with check (
    public.has_any_role(array['admin', 'manager', 'seller']::user_access_role[])
  );

create policy "sales_select_authenticated"
  on public.sales
  for select
  using (public.is_authenticated());

create policy "sales_write_sales"
  on public.sales
  for all
  using (
    public.has_any_role(array['admin', 'manager', 'seller']::user_access_role[])
  )
  with check (
    public.has_any_role(array['admin', 'manager', 'seller']::user_access_role[])
  );

create policy "sale_payments_select_authenticated"
  on public.sale_payments
  for select
  using (public.is_authenticated());

create policy "sale_payments_write_sales"
  on public.sale_payments
  for all
  using (
    public.has_any_role(array['admin', 'manager', 'seller']::user_access_role[])
  )
  with check (
    public.has_any_role(array['admin', 'manager', 'seller']::user_access_role[])
  );

create policy "commissions_select_authenticated"
  on public.commissions
  for select
  using (public.is_authenticated());

create policy "commissions_write_financial"
  on public.commissions
  for all
  using (
    public.has_any_role(array['admin', 'manager', 'financial']::user_access_role[])
  )
  with check (
    public.has_any_role(array['admin', 'manager', 'financial']::user_access_role[])
  );

create policy "purchases_select_authenticated"
  on public.purchases
  for select
  using (public.is_authenticated());

create policy "purchases_write_sales_financial"
  on public.purchases
  for all
  using (
    public.has_any_role(array['admin', 'manager', 'seller', 'financial']::user_access_role[])
  )
  with check (
    public.has_any_role(array['admin', 'manager', 'seller', 'financial']::user_access_role[])
  );

create policy "financial_transactions_select_authenticated"
  on public.financial_transactions
  for select
  using (public.is_authenticated());

create policy "financial_transactions_write_financial"
  on public.financial_transactions
  for all
  using (
    public.has_any_role(array['admin', 'manager', 'financial']::user_access_role[])
  )
  with check (
    public.has_any_role(array['admin', 'manager', 'financial']::user_access_role[])
  );

create policy "installments_select_authenticated"
  on public.installments
  for select
  using (public.is_authenticated());

create policy "installments_write_financial"
  on public.installments
  for all
  using (
    public.has_any_role(array['admin', 'manager', 'financial']::user_access_role[])
  )
  with check (
    public.has_any_role(array['admin', 'manager', 'financial']::user_access_role[])
  );

create policy "company_settings_select_authenticated"
  on public.company_settings
  for select
  using (public.is_authenticated());

create policy "company_settings_write_management"
  on public.company_settings
  for all
  using (public.has_any_role(array['admin', 'manager']::user_access_role[]))
  with check (public.has_any_role(array['admin', 'manager']::user_access_role[]));
