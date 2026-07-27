alter type vehicle_status add value if not exists 'evaluating';

alter table public.vehicles alter column status set default 'evaluating';
