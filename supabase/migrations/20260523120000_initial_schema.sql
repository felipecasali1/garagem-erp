create extension if not exists pgcrypto;

create type person_type as enum ('individual', 'company');
create type commission_type as enum ('percentage', 'fixed');
create type fuel_type as enum ('flex', 'gasoline', 'diesel', 'electric', 'hybrid');
create type transmission_type as enum ('manual', 'automatic', 'cvt', 'dual_clutch', 'automatized');
create type vehicle_status as enum ('available', 'reserved', 'sold', 'in_repair');
create type sale_status as enum ('pending', 'completed', 'canceled');
create type purchase_status as enum ('pending', 'completed', 'canceled');
create type transaction_type as enum ('income', 'expense');
create type transaction_category as enum (
  'vehicle_sale',
  'vehicle_purchase',
  'salary',
  'commission',
  'fixed_cost',
  'other'
);
create type transaction_status as enum ('pending', 'paid', 'overdue', 'canceled');
create type commission_status as enum ('pending', 'paid');
create type payment_method as enum ('cash', 'financing', 'card', 'pix', 'trade_in');
create type payment_status as enum ('pending', 'partial', 'paid');
create type checklist_status as enum (
  'pending',
  'in_progress',
  'waiting_parts',
  'completed',
  'cancelled'
);
create type checklist_priority as enum ('low', 'medium', 'high', 'urgent');
create type checklist_category as enum (
  'mechanical',
  'bodywork',
  'cleaning',
  'tires',
  'oil_change',
  'documentation',
  'electrical',
  'accessories',
  'marketplace',
  'photography',
  'inspection',
  'maintenance',
  'fueling',
  'washing',
  'notes'
);
create type supplier_type as enum ('individual', 'company', 'dealership', 'auction', 'trade_in');
create type user_access_role as enum ('admin', 'manager', 'seller', 'financial');

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table people (
  id bigint generated always as identity primary key,
  name text not null,
  type person_type not null,
  cpf text,
  cnpj text,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint people_document_check check (
    (type = 'individual' and cnpj is null)
    or (type = 'company' and cpf is null)
    or (cpf is null and cnpj is null)
  )
);

create unique index people_cpf_unique_idx on people (cpf) where cpf is not null;
create unique index people_cnpj_unique_idx on people (cnpj) where cnpj is not null;

create table addresses (
  id bigint generated always as identity primary key,
  person_id bigint not null references people (id) on delete cascade,
  street text,
  number text,
  complement text,
  neighborhood text,
  city text,
  state text,
  zip_code text,
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index addresses_primary_per_person_idx
  on addresses (person_id)
  where is_primary;

create table employees (
  id bigint generated always as identity primary key,
  person_id bigint not null unique references people (id) on delete restrict,
  position text not null,
  salary numeric(12, 2) not null default 0,
  commission_rate numeric(8, 2) not null default 0,
  commission_type commission_type not null default 'percentage',
  active boolean not null default true,
  hired_at date not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table customers (
  id bigint generated always as identity primary key,
  person_id bigint not null unique references people (id) on delete restrict,
  notes text,
  total_purchases numeric(14, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table suppliers (
  id bigint generated always as identity primary key,
  person_id bigint not null unique references people (id) on delete restrict,
  supplier_type supplier_type not null default 'company',
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table vehicles (
  id bigint generated always as identity primary key,
  plate text not null,
  brand text not null,
  model text not null,
  version text,
  color text not null,
  fuel_type fuel_type not null,
  transmission transmission_type not null,
  vin text,
  chassis text,
  manufacture_year integer not null,
  model_year integer not null,
  current_mileage integer not null default 0,
  cost_price numeric(14, 2) not null default 0,
  sale_price numeric(14, 2) not null default 0,
  published boolean not null default false,
  status vehicle_status not null default 'available',
  image text,
  notes text,
  sold_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint vehicles_year_check check (
    manufacture_year between 1900 and 2100
    and model_year between 1900 and 2101
  ),
  constraint vehicles_price_check check (
    cost_price >= 0
    and sale_price >= 0
  ),
  constraint vehicles_mileage_check check (current_mileage >= 0)
);

create unique index vehicles_plate_unique_idx on vehicles (plate);
create unique index vehicles_vin_unique_idx on vehicles (vin) where vin is not null;
create unique index vehicles_chassis_unique_idx on vehicles (chassis) where chassis is not null;
create index vehicles_status_idx on vehicles (status);

create table accessories (
  id bigint generated always as identity primary key,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index accessories_name_unique_idx on accessories (lower(name));

create table vehicle_accessories (
  id bigint generated always as identity primary key,
  vehicle_id bigint not null references vehicles (id) on delete cascade,
  accessory_id bigint not null references accessories (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (vehicle_id, accessory_id)
);

create table users (
  id bigint generated always as identity primary key,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  person_id bigint not null unique references people (id) on delete restrict,
  employee_id bigint unique references employees (id) on delete set null,
  access_role user_access_role not null default 'seller',
  is_admin boolean not null default false,
  active boolean not null default true,
  email_verified_at timestamptz,
  invited_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table vehicle_checklist_items (
  id uuid primary key default gen_random_uuid(),
  vehicle_id bigint not null references vehicles (id) on delete cascade,
  title text not null,
  description text,
  category checklist_category not null,
  status checklist_status not null default 'pending',
  priority checklist_priority not null default 'medium',
  estimated_cost numeric(14, 2) not null default 0,
  actual_cost numeric(14, 2) not null default 0,
  due_date date,
  completion_date date,
  responsible_employee_id bigint references employees (id) on delete set null,
  notes text,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint checklist_cost_check check (
    estimated_cost >= 0
    and actual_cost >= 0
  )
);

create index vehicle_checklist_vehicle_idx on vehicle_checklist_items (vehicle_id);
create index vehicle_checklist_status_idx on vehicle_checklist_items (status);
create index vehicle_checklist_due_date_idx on vehicle_checklist_items (due_date);

create table sales (
  id bigint generated always as identity primary key,
  customer_id bigint not null references customers (id) on delete restrict,
  vehicle_id bigint not null unique references vehicles (id) on delete restrict,
  employee_id bigint not null references employees (id) on delete restrict,
  total_value numeric(14, 2) not null,
  discount numeric(14, 2) not null default 0,
  status sale_status not null default 'pending',
  sale_date date not null,
  notes text,
  trade_in_vehicle_id bigint references vehicles (id) on delete set null,
  trade_in_value numeric(14, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sales_amount_check check (
    total_value >= 0
    and discount >= 0
    and trade_in_value >= 0
  )
);

create index sales_customer_idx on sales (customer_id);
create index sales_employee_idx on sales (employee_id);
create index sales_date_idx on sales (sale_date);

create table sale_payments (
  id bigint generated always as identity primary key,
  sale_id bigint not null references sales (id) on delete cascade,
  payment_method payment_method not null,
  payment_status payment_status not null default 'pending',
  down_payment numeric(14, 2) not null default 0,
  installments_count integer not null default 1,
  payment_date date,
  remaining_amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sale_payments_amount_check check (
    down_payment >= 0
    and remaining_amount >= 0
    and installments_count >= 1
  )
);

create index sale_payments_sale_idx on sale_payments (sale_id);

create table commissions (
  id bigint generated always as identity primary key,
  sale_id bigint not null references sales (id) on delete cascade,
  employee_id bigint not null references employees (id) on delete restrict,
  vehicle_id bigint not null references vehicles (id) on delete restrict,
  type commission_type not null,
  rate numeric(12, 2) not null default 0,
  amount numeric(14, 2) not null default 0,
  status commission_status not null default 'pending',
  due_date date,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint commissions_amount_check check (
    rate >= 0
    and amount >= 0
  )
);

create unique index commissions_sale_employee_unique_idx on commissions (sale_id, employee_id);

create table purchases (
  id bigint generated always as identity primary key,
  supplier_id bigint not null references suppliers (id) on delete restrict,
  vehicle_id bigint not null unique references vehicles (id) on delete restrict,
  employee_id bigint references employees (id) on delete set null,
  total_value numeric(14, 2) not null,
  purchase_date date not null,
  status purchase_status not null default 'pending',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint purchases_amount_check check (total_value >= 0)
);

create index purchases_supplier_idx on purchases (supplier_id);
create index purchases_date_idx on purchases (purchase_date);

create table financial_transactions (
  id bigint generated always as identity primary key,
  type transaction_type not null,
  category transaction_category not null,
  status transaction_status not null default 'pending',
  amount numeric(14, 2) not null,
  transaction_date date not null,
  due_date date,
  paid_at timestamptz,
  description text not null,
  related text,
  sale_id bigint references sales (id) on delete set null,
  purchase_id bigint references purchases (id) on delete set null,
  employee_id bigint references employees (id) on delete set null,
  commission_id bigint references commissions (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint financial_transactions_amount_check check (amount >= 0)
);

create index financial_transactions_status_idx on financial_transactions (status);
create index financial_transactions_date_idx on financial_transactions (transaction_date);
create index financial_transactions_due_date_idx on financial_transactions (due_date);
create index financial_transactions_sale_idx on financial_transactions (sale_id);
create index financial_transactions_purchase_idx on financial_transactions (purchase_id);

alter table purchases
  add column financial_transaction_id bigint references financial_transactions (id) on delete set null;

create table installments (
  id bigint generated always as identity primary key,
  transaction_id bigint references financial_transactions (id) on delete cascade,
  sale_payment_id bigint references sale_payments (id) on delete cascade,
  number integer not null,
  total_installments integer not null,
  amount numeric(14, 2) not null,
  due_date date not null,
  paid_at timestamptz,
  status transaction_status not null default 'pending',
  description text,
  is_installment_parent boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint installments_owner_check check (
    transaction_id is not null
    or sale_payment_id is not null
  ),
  constraint installments_number_check check (
    number >= 1
    and total_installments >= 1
    and number <= total_installments
    and amount >= 0
  )
);

create index installments_transaction_idx on installments (transaction_id);
create index installments_sale_payment_idx on installments (sale_payment_id);
create index installments_due_date_idx on installments (due_date);

create table company_settings (
  id bigint generated always as identity primary key,
  legal_name text not null,
  trade_name text,
  cnpj text not null,
  state_registration text,
  phone text,
  email text,
  logo_url text,
  zip_code text,
  city text,
  state text,
  street text,
  number text,
  neighborhood text,
  default_commission_type commission_type not null default 'percentage',
  default_commission_rate numeric(8, 2) not null default 0,
  show_estimated_margins boolean not null default true,
  show_overdue_installment_alerts boolean not null default true,
  email_commission_notifications boolean not null default false,
  default_dark_theme_for_new_users boolean not null default false,
  message_of_the_day text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index company_settings_cnpj_unique_idx on company_settings (cnpj);

create trigger people_set_updated_at
before update on people
for each row execute function set_updated_at();

create trigger addresses_set_updated_at
before update on addresses
for each row execute function set_updated_at();

create trigger employees_set_updated_at
before update on employees
for each row execute function set_updated_at();

create trigger customers_set_updated_at
before update on customers
for each row execute function set_updated_at();

create trigger suppliers_set_updated_at
before update on suppliers
for each row execute function set_updated_at();

create trigger vehicles_set_updated_at
before update on vehicles
for each row execute function set_updated_at();

create trigger accessories_set_updated_at
before update on accessories
for each row execute function set_updated_at();

create trigger users_set_updated_at
before update on users
for each row execute function set_updated_at();

create trigger vehicle_checklist_items_set_updated_at
before update on vehicle_checklist_items
for each row execute function set_updated_at();

create trigger sales_set_updated_at
before update on sales
for each row execute function set_updated_at();

create trigger sale_payments_set_updated_at
before update on sale_payments
for each row execute function set_updated_at();

create trigger commissions_set_updated_at
before update on commissions
for each row execute function set_updated_at();

create trigger purchases_set_updated_at
before update on purchases
for each row execute function set_updated_at();

create trigger financial_transactions_set_updated_at
before update on financial_transactions
for each row execute function set_updated_at();

create trigger installments_set_updated_at
before update on installments
for each row execute function set_updated_at();

create trigger company_settings_set_updated_at
before update on company_settings
for each row execute function set_updated_at();
