create table public.vehicle_photos (
  id uuid primary key default gen_random_uuid(),
  vehicle_id bigint not null references public.vehicles (id) on delete restrict,
  storage_path text not null unique,
  content_type text not null default 'image/jpeg'
    check (content_type = 'image/jpeg'),
  file_size_bytes integer not null
    check (file_size_bytes between 1 and 5242880),
  pending_cleanup_paths text[] not null default '{}',
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index vehicle_photos_one_per_vehicle_unique_idx
  on public.vehicle_photos (vehicle_id);

create trigger vehicle_photos_set_updated_at
  before update on public.vehicle_photos
  for each row execute function public.set_updated_at();

alter table public.vehicle_photos enable row level security;
revoke all on table public.vehicle_photos from public, anon;
grant select, insert, update, delete on table public.vehicle_photos to authenticated;
grant all on table public.vehicle_photos to service_role;

create policy vehicle_photos_read_vehicle_readers
  on public.vehicle_photos
  for select to authenticated
  using (
    public.has_any_role(array['admin', 'manager', 'seller']::public.user_access_role[])
  );

create policy vehicle_photos_insert_vehicle_writers
  on public.vehicle_photos
  for insert to authenticated
  with check (
    public.has_any_role(array['admin', 'manager', 'seller']::public.user_access_role[])
    and created_by = auth.uid()
  );

create policy vehicle_photos_update_vehicle_writers
  on public.vehicle_photos
  for update to authenticated
  using (public.has_any_role(array['admin', 'manager', 'seller']::public.user_access_role[]))
  with check (public.has_any_role(array['admin', 'manager', 'seller']::public.user_access_role[]));

create policy vehicle_photos_delete_vehicle_writers
  on public.vehicle_photos
  for delete to authenticated
  using (public.has_any_role(array['admin', 'manager', 'seller']::public.user_access_role[]));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-photos',
  'vehicle-photos',
  false,
  5242880,
  array['image/jpeg']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy vehicle_photos_storage_read_vehicle_readers
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and public.has_any_role(array['admin', 'manager', 'seller']::public.user_access_role[])
    and (storage.foldername(name))[1] = 'vehicles'
    and (storage.foldername(name))[2] ~ '^[1-9][0-9]*$'
    and exists (
      select 1
        from public.vehicles as vehicle
        where vehicle.id::text = (storage.foldername(name))[2]
    )
  );

create policy vehicle_photos_storage_insert_vehicle_writers
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vehicle-photos'
    and public.has_any_role(array['admin', 'manager', 'seller']::public.user_access_role[])
    and (storage.foldername(name))[1] = 'vehicles'
    and (storage.foldername(name))[2] ~ '^[1-9][0-9]*$'
    and exists (
      select 1
        from public.vehicles as vehicle
        where vehicle.id::text = (storage.foldername(name))[2]
    )
  );

create policy vehicle_photos_storage_delete_vehicle_writers
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and public.has_any_role(array['admin', 'manager', 'seller']::public.user_access_role[])
    and (storage.foldername(name))[1] = 'vehicles'
    and (storage.foldername(name))[2] ~ '^[1-9][0-9]*$'
    and exists (
      select 1
        from public.vehicles as vehicle
        where vehicle.id::text = (storage.foldername(name))[2]
    )
  );

notify pgrst, 'reload schema';
