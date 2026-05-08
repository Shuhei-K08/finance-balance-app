drop function if exists public.ensure_personal_ledger();

create or replace function public.ensure_personal_ledger()
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_user_id uuid := auth.uid();
  target_household_id uuid;
  bank_main_id uuid;
  saving_id uuid;
  cash_id uuid;
  card_id uuid;
  food_id uuid;
  grocery_id uuid;
  dining_id uuid;
  home_id uuid;
  utility_id uuid;
  fun_id uuid;
  sub_id uuid;
  salary_id uuid;
  saving_cat_id uuid;
begin
  if current_user_id is null then
    raise exception 'login required';
  end if;

  select hm.household_id
    into target_household_id
  from household_members hm
  join households h on h.id = hm.household_id
  where hm.user_id = current_user_id
    and h.deleted_at is null
  order by hm.created_at
  limit 1;

  if target_household_id is not null then
    return target_household_id;
  end if;

  insert into households (owner_id, name, space_type, mode)
  values (current_user_id, '個人家計簿', 'personal', 'balance')
  returning id into target_household_id;

  insert into household_members (household_id, user_id, member_role)
  values (target_household_id, current_user_id, 'owner');

  insert into accounts (household_id, name, account_type, opening_balance, color)
  values
    (target_household_id, '生活口座', 'bank', 0, '#2563eb'),
    (target_household_id, '貯金口座', 'saving', 0, '#059669'),
    (target_household_id, '現金', 'cash', 0, '#d97706');

  select id into bank_main_id from accounts where accounts.household_id = target_household_id and name = '生活口座';
  select id into saving_id from accounts where accounts.household_id = target_household_id and name = '貯金口座';
  select id into cash_id from accounts where accounts.household_id = target_household_id and name = '現金';

  insert into accounts (household_id, name, account_type, opening_balance, color, closing_day, withdrawal_day, withdrawal_account_id)
  values (target_household_id, 'VISAカード', 'credit', 0, '#7c3aed', 25, 10, bank_main_id)
  returning id into card_id;

  insert into categories (household_id, name, color) values (target_household_id, '食費', '#ef4444') returning id into food_id;
  insert into categories (household_id, name, color) values (target_household_id, '住居', '#64748b') returning id into home_id;
  insert into categories (household_id, name, color) values (target_household_id, '娯楽', '#8b5cf6') returning id into fun_id;
  insert into categories (household_id, name, color) values (target_household_id, '給与', '#16a34a') returning id into salary_id;
  insert into categories (household_id, name, color) values (target_household_id, '貯金', '#10b981') returning id into saving_cat_id;
  insert into categories (household_id, parent_id, name, color) values (target_household_id, food_id, 'スーパー', '#f97316') returning id into grocery_id;
  insert into categories (household_id, parent_id, name, color) values (target_household_id, food_id, '外食', '#fb7185') returning id into dining_id;
  insert into categories (household_id, parent_id, name, color) values (target_household_id, home_id, '光熱費', '#0ea5e9') returning id into utility_id;
  insert into categories (household_id, parent_id, name, color) values (target_household_id, fun_id, 'サブスク', '#a855f7') returning id into sub_id;

  insert into fixed_costs (household_id, name, category_id, account_id, amount, is_variable, due_day, status)
  values
    (target_household_id, '家賃', home_id, bank_main_id, 0, false, 27, 'planned'),
    (target_household_id, '電気代', utility_id, card_id, 0, true, 18, 'planned'),
    (target_household_id, '保険', home_id, bank_main_id, 0, false, 20, 'confirmed');

  insert into saving_goals (household_id, name, account_id, target_amount, deadline, monthly_boost)
  values
    (target_household_id, '生活防衛資金', saving_id, 2000000, date '2028-12-31', 0),
    (target_household_id, '旅行資金', saving_id, 450000, date '2027-08-31', 0);

  return target_household_id;
end;
$$;
