-- Populate the garage catalog with common vehicle accessories.
-- Existing catalog entries (including inactive ones) are left untouched.
insert into public.accessories (name)
values
  ('Ar-condicionado'),
  ('Direção elétrica'),
  ('Vidros elétricos'),
  ('Trava elétrica'),
  ('Airbag'),
  ('ABS'),
  ('Câmera de ré'),
  ('Sensor de estacionamento'),
  ('Multimídia'),
  ('Teto solar'),
  ('Bancos em couro'),
  ('Rodas de liga'),
  ('GPS'),
  ('Faróis de LED'),
  ('Piloto automático')
on conflict (lower(name)) do nothing;
