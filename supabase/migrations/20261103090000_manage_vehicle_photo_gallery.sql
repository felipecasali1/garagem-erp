drop index public.vehicle_photos_one_per_vehicle_unique_idx;

alter table public.vehicle_photos
  add column content_digest text check (content_digest ~ '^[0-9a-f]{64}$'),
  add column deletion_pending boolean not null default false;

create index vehicle_photos_vehicle_order_idx
  on public.vehicle_photos (vehicle_id, created_at, id);

create function public.enforce_vehicle_photo_limit()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and new.vehicle_id = old.vehicle_id then
    return new;
  end if;
  perform 1 from public.vehicles where id = new.vehicle_id for update;
  if (select count(*) from public.vehicle_photos where vehicle_id = new.vehicle_id) >= 15 then
    raise exception using errcode = '23505',
      message = 'VEHICLE_PHOTO_LIMIT: este veículo já possui 15 fotos. Remova uma foto antes de adicionar outra.';
  end if;
  return new;
end;
$$;

create trigger vehicle_photos_enforce_limit
before insert or update of vehicle_id on public.vehicle_photos
for each row execute function public.enforce_vehicle_photo_limit();

revoke insert, update, delete on public.vehicle_photos from public, anon, authenticated;

create function public.assert_vehicle_photo_access()
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.has_any_role(
    array['admin', 'manager', 'seller']::public.user_access_role[]
  ) then
    raise exception using errcode = '42501', message = 'Seu usuário não tem permissão para gerenciar fotos de veículos.';
  end if;
end;
$$;

-- Serialize object cleanup with metadata saves. A timed-out save may still commit;
-- Storage must not delete an object that has become a current photo in the meantime.
create function public.can_remove_vehicle_photo_object(p_storage_path text)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_vehicle_id bigint;
begin
  if auth.uid() is null or not public.has_any_role(
    array['admin', 'manager', 'seller']::public.user_access_role[]
  ) or p_storage_path !~ '^vehicles/[1-9][0-9]*/[A-Za-z0-9-]+[.]jpg$' then
    return false;
  end if;
  select id into v_vehicle_id from public.vehicles
    where id::text = split_part(p_storage_path, '/', 2) for update;
  if not found then return false; end if;
  return not exists (
    select 1 from public.vehicle_photos
      where storage_path = p_storage_path and not deletion_pending
  );
end;
$$;

drop policy vehicle_photos_storage_delete_vehicle_writers on storage.objects;
create policy vehicle_photos_storage_delete_vehicle_writers
  on storage.objects for delete to authenticated
  using (bucket_id = 'vehicle-photos' and public.can_remove_vehicle_photo_object(name));

create function public.save_vehicle_photo(
  p_photo_id uuid, p_vehicle_id bigint, p_storage_path text,
  p_file_size_bytes integer, p_content_digest text,
  p_expected_storage_path text default null
)
returns public.vehicle_photos language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_photo public.vehicle_photos%rowtype;
begin
  perform public.assert_vehicle_photo_access();
  if p_photo_id is null or p_vehicle_id is null or p_storage_path is null
    or p_file_size_bytes is null or p_file_size_bytes not between 1 and 5242880
    or p_content_digest is null or p_content_digest !~ '^[0-9a-f]{64}$'
    or p_storage_path !~ ('^vehicles/' || p_vehicle_id::text || '/[A-Za-z0-9-]+[.]jpg$')
  then
    raise exception using errcode = '22023', message = 'Os dados da foto são inválidos.';
  end if;

  perform 1 from public.vehicles where id = p_vehicle_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'Veículo não encontrado.';
  end if;
  select * into v_photo from public.vehicle_photos where id = p_photo_id for update;
  if found then
    if v_photo.vehicle_id <> p_vehicle_id or v_photo.deletion_pending then
      raise exception using errcode = '23505', message = 'Esta foto está em remoção ou pertence a outro veículo. Atualize a galeria.';
    end if;
    if v_photo.storage_path = p_storage_path and v_photo.content_digest = p_content_digest
      and v_photo.file_size_bytes = p_file_size_bytes
    then
      return v_photo;
    end if;
    if p_expected_storage_path is null or v_photo.storage_path <> p_expected_storage_path then
      raise exception using errcode = '23505', message = 'STALE_PHOTO: esta foto mudou em outra sessão. Atualize a galeria antes de substituir.';
    end if;
  elsif p_expected_storage_path is not null then
    raise exception using errcode = '23505', message = 'Esta foto foi removida em outra sessão. Atualize a galeria.';
  end if;

  if not exists (
    select 1 from storage.objects where bucket_id = 'vehicle-photos' and name = p_storage_path
      and metadata->>'mimetype' = 'image/jpeg'
      and (metadata->>'size')::bigint = p_file_size_bytes
  ) then
    raise exception using errcode = '22023', message = 'O arquivo JPEG ainda não foi confirmado no armazenamento. Tente enviar novamente.';
  end if;

  if v_photo.id is null then
    insert into public.vehicle_photos (id, vehicle_id, storage_path, file_size_bytes, content_digest)
      values (p_photo_id, p_vehicle_id, p_storage_path, p_file_size_bytes, p_content_digest)
      returning * into v_photo;
  else
    update public.vehicle_photos
      set storage_path = p_storage_path, file_size_bytes = p_file_size_bytes,
          content_digest = p_content_digest,
          pending_cleanup_paths = array_append(pending_cleanup_paths, v_photo.storage_path)
      where id = p_photo_id returning * into v_photo;
  end if;
  return v_photo;
end;
$$;

create function public.clear_vehicle_photo_cleanup(p_vehicle_id bigint, p_storage_path text)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_vehicle_photo_access();
  if exists (select 1 from public.vehicle_photos where storage_path = p_storage_path) then
    raise exception using errcode = '23505', message = 'O arquivo ainda está associado a uma foto.';
  end if;
  update public.vehicle_photos
    set pending_cleanup_paths = array_remove(pending_cleanup_paths, p_storage_path)
    where vehicle_id = p_vehicle_id and p_storage_path = any(pending_cleanup_paths);
end;
$$;

create function public.begin_vehicle_photo_removal(
  p_vehicle_id bigint, p_photo_id uuid, p_expected_storage_path text
)
returns public.vehicle_photos language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_photo public.vehicle_photos%rowtype;
begin
  perform public.assert_vehicle_photo_access();
  perform 1 from public.vehicles where id = p_vehicle_id for update;
  select * into v_photo from public.vehicle_photos
    where id = p_photo_id and vehicle_id = p_vehicle_id for update;
  if not found then return null; end if;
  if p_expected_storage_path is null or v_photo.storage_path <> p_expected_storage_path then
    raise exception using errcode = '23505', message = 'STALE_PHOTO: esta foto mudou em outra sessão. Atualize a galeria antes de remover.';
  end if;
  update public.vehicle_photos set deletion_pending = true
    where id = p_photo_id returning * into v_photo;
  return v_photo;
end;
$$;

create function public.finish_vehicle_photo_removal(p_vehicle_id bigint, p_photo_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_photo public.vehicle_photos%rowtype;
begin
  perform public.assert_vehicle_photo_access();
  perform 1 from public.vehicles where id = p_vehicle_id for update;
  select * into v_photo from public.vehicle_photos
    where id = p_photo_id and vehicle_id = p_vehicle_id for update;
  if not found then return; end if;
  if not v_photo.deletion_pending then
    raise exception using errcode = '23505', message = 'Confirme a remoção da foto antes de concluir.';
  end if;
  if exists (
    select 1 from storage.objects where bucket_id = 'vehicle-photos'
      and (name = v_photo.storage_path or name = any(v_photo.pending_cleanup_paths))
  ) then
    raise exception using errcode = '23505', message = 'A remoção do arquivo ainda está pendente. Tente remover a foto novamente.';
  end if;
  delete from public.vehicle_photos where id = p_photo_id;
end;
$$;

revoke all on function public.enforce_vehicle_photo_limit() from public, anon, authenticated, service_role;
revoke all on function public.assert_vehicle_photo_access() from public, anon, authenticated, service_role;
revoke all on function public.can_remove_vehicle_photo_object(text) from public, anon, service_role;
revoke all on function public.save_vehicle_photo(uuid, bigint, text, integer, text, text) from public, anon, service_role;
revoke all on function public.clear_vehicle_photo_cleanup(bigint, text) from public, anon, service_role;
revoke all on function public.begin_vehicle_photo_removal(bigint, uuid, text) from public, anon, service_role;
revoke all on function public.finish_vehicle_photo_removal(bigint, uuid) from public, anon, service_role;
grant execute on function public.save_vehicle_photo(uuid, bigint, text, integer, text, text) to authenticated;
grant execute on function public.can_remove_vehicle_photo_object(text) to authenticated;
grant execute on function public.clear_vehicle_photo_cleanup(bigint, text) to authenticated;
grant execute on function public.begin_vehicle_photo_removal(bigint, uuid, text) to authenticated;
grant execute on function public.finish_vehicle_photo_removal(bigint, uuid) to authenticated;

notify pgrst, 'reload schema';
