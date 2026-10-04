begin;

select plan(3);

select set_config('test.auth_user_id', gen_random_uuid()::text, true);
select set_config(
  'test.auth_user_email',
  'supabase-local-' || gen_random_uuid()::text || '@example.test',
  true
);
select set_config('test.vehicle_plate', 'TAP-' || gen_random_uuid()::text, true);
select set_config(
  'test.denied_vehicle_plate',
  'TAP-DENIED-' || gen_random_uuid()::text,
  true
);

insert into auth.users (id, email)
values (
  current_setting('test.auth_user_id')::uuid,
  current_setting('test.auth_user_email')
);

select public.bootstrap_internal_user(
  current_setting('test.auth_user_email'),
  'Usuário de teste local',
  'Vendedor',
  'seller',
  false
);

insert into public.vehicles (
  plate,
  brand,
  model,
  color,
  fuel_type,
  transmission,
  manufacture_year,
  model_year
)
values (
  current_setting('test.vehicle_plate'),
  'Marca de teste',
  'Modelo de teste',
  'Cinza',
  'flex',
  'manual',
  2020,
  2021
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  current_setting('test.auth_user_id'),
  true
);

select is(
  (
    select count(*)
    from public.vehicles
    where plate = current_setting('test.vehicle_plate')
  ),
  1::bigint,
  'active internal users can read vehicle inventory'
);

select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);

select is(
  (
    select count(*)
    from public.vehicles
    where plate = current_setting('test.vehicle_plate')
  ),
  0::bigint,
  'authenticated identities without an active internal account cannot read inventory'
);

select throws_ok(
  $$
    insert into public.vehicles (
      plate,
      brand,
      model,
      color,
      fuel_type,
      transmission,
      manufacture_year,
      model_year
    )
    values (
      current_setting('test.denied_vehicle_plate'),
      'Marca de teste',
      'Modelo de teste',
      'Cinza',
      'flex',
      'manual',
      2020,
      2021
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "vehicles"',
  'authenticated users without an active internal account cannot write vehicles'
);

reset role;
select * from finish();
rollback;
