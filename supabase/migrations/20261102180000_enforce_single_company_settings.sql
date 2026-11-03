do $$
begin
  if (select count(*) from public.company_settings) > 1 then
    raise exception using
      errcode = '23505',
      message = 'Há mais de um perfil em company_settings. Preserve o perfil correto e remova os duplicados antes de aplicar esta migration.';
  end if;
end;
$$;

create unique index company_settings_singleton_unique_idx
  on public.company_settings ((true));
