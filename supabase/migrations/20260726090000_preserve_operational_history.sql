alter type vehicle_status add value if not exists 'evaluating';
alter type vehicle_status add value if not exists 'archived';

alter table public.customers
  add column if not exists active boolean not null default true;

alter table public.vehicle_accessories
  add column if not exists active boolean not null default true;

create index if not exists customers_active_idx on public.customers (active);
create index if not exists vehicle_accessories_active_idx on public.vehicle_accessories (vehicle_id, active);
