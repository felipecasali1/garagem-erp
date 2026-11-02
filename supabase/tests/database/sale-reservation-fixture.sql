create or replace function public.test_reject_sale_financial_effect()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.sales
    where id = new.sale_id
      and notes = '__TEST_FORCE_FINANCIAL_FAILURE__'
  ) then
    raise exception 'forced payment failure';
  end if;

  return new;
end;
$$;

create trigger test_reject_sale_financial_effect_before_insert
  before insert on public.financial_transactions
  for each row execute function public.test_reject_sale_financial_effect();
