-- A vehicle can return to the garage and participate in later purchase and sale cycles.
-- Keep the operational state on vehicles as the guard for the active cycle; the
-- purchase and sale tables must preserve historical rows instead of enforcing a
-- lifetime one-to-one relationship.
alter table public.purchases
  drop constraint if exists purchases_vehicle_id_key;

alter table public.sales
  drop constraint if exists sales_vehicle_id_key;

create index if not exists purchases_vehicle_idx
  on public.purchases (vehicle_id);

create index if not exists sales_vehicle_idx
  on public.sales (vehicle_id);
