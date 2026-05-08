create extension if not exists pgcrypto;

do $$
begin
  create type ledger_space_type as enum ('personal', 'shared');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type ledger_mode as enum ('cashflow', 'balance');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type transaction_type as enum ('income', 'expense', 'transfer');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type fixed_cost_status as enum ('planned', 'confirmed', 'paid');
exception when duplicate_object then null;
end $$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  name text not null,
  space_type ledger_space_type not null default 'personal',
  mode ledger_mode not null default 'balance',
  invite_code text unique,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table households add column if not exists invite_code text;

create table if not exists household_members (
  household_id uuid references households(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  account_type text not null check (account_type in ('bank', 'cash', 'credit', 'saving')),
  opening_balance numeric(14, 0) not null default 0,
  opening_balance_date date,
  color text not null default '#0f766e',
  closing_day int check (closing_day between 1 and 31),
  withdrawal_day int check (withdrawal_day between 1 and 31),
  withdrawal_account_id uuid references accounts(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table accounts add column if not exists opening_balance_date date;

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  parent_id uuid references categories(id),
  name text not null,
  color text not null default '#0f766e',
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  transaction_type transaction_type not null,
  amount numeric(14, 0) not null check (amount > 0),
  category_id uuid references categories(id),
  account_id uuid not null references accounts(id),
  transfer_to_account_id uuid references accounts(id),
  occurred_on date not null,
  reflected_on date,
  credit_status text check (credit_status is null or credit_status in ('unconfirmed', 'confirmed', 'withdrawn')),
  memo text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (transaction_type = 'transfer' and transfer_to_account_id is not null)
    or (transaction_type <> 'transfer' and transfer_to_account_id is null)
  )
);

create table if not exists fixed_costs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  category_id uuid references categories(id),
  account_id uuid references accounts(id),
  name text not null,
  amount numeric(14, 0) not null check (amount >= 0),
  is_variable boolean not null default false,
  due_day int not null check (due_day between 1 and 31),
  status fixed_cost_status not null default 'planned',
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists saving_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  account_id uuid references accounts(id),
  name text not null,
  target_amount numeric(14, 0) not null check (target_amount > 0),
  deadline date,
  monthly_boost numeric(14, 0) not null default 0 check (monthly_boost >= 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists household_members_user_id_idx on household_members(user_id);
create index if not exists accounts_household_id_idx on accounts(household_id) where deleted_at is null;
create index if not exists categories_household_id_idx on categories(household_id) where deleted_at is null;
create index if not exists transactions_household_id_occurred_on_idx on transactions(household_id, occurred_on desc) where deleted_at is null;
create index if not exists fixed_costs_household_id_idx on fixed_costs(household_id) where deleted_at is null;
create index if not exists saving_goals_household_id_idx on saving_goals(household_id) where deleted_at is null;
create unique index if not exists households_invite_code_uidx on households(invite_code) where invite_code is not null and deleted_at is null;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'admin'
      and deleted_at is null
  );
$$;

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from household_members
    where household_id = target_household_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.owns_household(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from households
    where id = target_household_id
      and owner_id = auth.uid()
      and deleted_at is null
  );
$$;

create or replace function public.claim_first_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'login required';
  end if;

  if exists (select 1 from profiles where role = 'admin' and deleted_at is null) then
    raise exception 'admin already exists';
  end if;

  insert into profiles (id, display_name, role)
  values (auth.uid(), '管理者', 'admin')
  on conflict (id) do update
    set role = 'admin',
        deleted_at = null;
end;
$$;

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

create or replace function public.create_shared_ledger(ledger_name text)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_user_id uuid := auth.uid();
  new_household_id uuid;
  new_invite_code text;
  bank_main_id uuid;
  saving_id uuid;
  cash_id uuid;
  card_id uuid;
  food_id uuid;
  home_id uuid;
  utility_id uuid;
  fun_id uuid;
  salary_id uuid;
  saving_cat_id uuid;
begin
  if current_user_id is null then
    raise exception 'login required';
  end if;

  loop
    new_invite_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from households where households.invite_code = new_invite_code);
  end loop;

  insert into households (owner_id, name, space_type, mode, invite_code)
  values (current_user_id, coalesce(nullif(trim(ledger_name), ''), '共有家計簿'), 'shared', 'balance', new_invite_code)
  returning id into new_household_id;

  insert into household_members (household_id, user_id, member_role)
  values (new_household_id, current_user_id, 'owner');

  insert into accounts (household_id, name, account_type, opening_balance, color)
  values
    (new_household_id, '共有口座', 'bank', 0, '#2563eb'),
    (new_household_id, '共有貯金', 'saving', 0, '#059669'),
    (new_household_id, '共有現金', 'cash', 0, '#d97706');

  select id into bank_main_id from accounts where accounts.household_id = new_household_id and name = '共有口座';
  select id into saving_id from accounts where accounts.household_id = new_household_id and name = '共有貯金';
  select id into cash_id from accounts where accounts.household_id = new_household_id and name = '共有現金';

  insert into accounts (household_id, name, account_type, opening_balance, color, closing_day, withdrawal_day, withdrawal_account_id)
  values (new_household_id, '共有カード', 'credit', 0, '#7c3aed', 25, 10, bank_main_id)
  returning id into card_id;

  insert into categories (household_id, name, color) values (new_household_id, '食費', '#ef4444') returning id into food_id;
  insert into categories (household_id, parent_id, name, color) values (new_household_id, food_id, 'スーパー', '#f97316');
  insert into categories (household_id, parent_id, name, color) values (new_household_id, food_id, '外食', '#fb7185');
  insert into categories (household_id, name, color) values (new_household_id, '住居', '#64748b') returning id into home_id;
  insert into categories (household_id, parent_id, name, color) values (new_household_id, home_id, '光熱費', '#0ea5e9') returning id into utility_id;
  insert into categories (household_id, name, color) values (new_household_id, '娯楽', '#8b5cf6') returning id into fun_id;
  insert into categories (household_id, parent_id, name, color) values (new_household_id, fun_id, 'サブスク', '#a855f7');
  insert into categories (household_id, name, color) values (new_household_id, '給与', '#16a34a') returning id into salary_id;
  insert into categories (household_id, name, color) values (new_household_id, '貯金', '#10b981') returning id into saving_cat_id;

  insert into fixed_costs (household_id, name, category_id, account_id, amount, is_variable, due_day, status)
  values
    (new_household_id, '家賃', home_id, bank_main_id, 0, false, 27, 'planned'),
    (new_household_id, '光熱費', utility_id, card_id, 0, true, 18, 'planned');

  insert into saving_goals (household_id, name, account_id, target_amount, deadline, monthly_boost)
  values (new_household_id, '共有貯金目標', saving_id, 1000000, current_date + interval '2 years', 0);

  return new_household_id;
end;
$$;

create or replace function public.join_shared_ledger(code text)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_user_id uuid := auth.uid();
  household_id uuid;
begin
  if current_user_id is null then
    raise exception 'login required';
  end if;

  select id into household_id
  from households
  where invite_code = upper(trim(code))
    and space_type = 'shared'
    and deleted_at is null;

  if household_id is null then
    raise exception '共有家計簿が見つかりません。招待コードを確認してください。';
  end if;

  insert into household_members (household_id, user_id, member_role)
  values (household_id, current_user_id, 'member')
  on conflict (household_id, user_id) do nothing;

  return household_id;
end;
$$;

create or replace function public.validate_household_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'accounts' then
    if new.withdrawal_account_id is not null then
      if not exists (select 1 from accounts where id = new.withdrawal_account_id and household_id = new.household_id) then
        raise exception 'withdrawal account must belong to the same household';
      end if;
    end if;
    return new;
  end if;

  if tg_table_name = 'categories' then
    if new.parent_id is not null then
      if not exists (select 1 from categories where id = new.parent_id and household_id = new.household_id) then
        raise exception 'parent category must belong to the same household';
      end if;
    end if;
    return new;
  end if;

  if tg_table_name = 'transactions' then
    if not exists (select 1 from accounts where id = new.account_id and household_id = new.household_id and deleted_at is null) then
      raise exception 'account must belong to the same household';
    end if;
    if new.transfer_to_account_id is not null and not exists (select 1 from accounts where id = new.transfer_to_account_id and household_id = new.household_id and deleted_at is null) then
      raise exception 'transfer target must belong to the same household';
    end if;
    if new.category_id is not null and not exists (select 1 from categories where id = new.category_id and household_id = new.household_id and deleted_at is null) then
      raise exception 'category must belong to the same household';
    end if;
    return new;
  end if;

  if tg_table_name = 'fixed_costs' then
    if new.account_id is not null and not exists (select 1 from accounts where id = new.account_id and household_id = new.household_id and deleted_at is null) then
      raise exception 'account must belong to the same household';
    end if;
    if not exists (select 1 from categories where id = new.category_id and household_id = new.household_id and deleted_at is null) then
      raise exception 'category must belong to the same household';
    end if;
    return new;
  end if;

  if tg_table_name = 'saving_goals' then
    if new.account_id is not null and not exists (select 1 from accounts where id = new.account_id and household_id = new.household_id and deleted_at is null) then
      raise exception 'account must belong to the same household';
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_accounts_household_refs on accounts;
create trigger validate_accounts_household_refs
before insert or update on accounts
for each row execute function public.validate_household_refs();

drop trigger if exists validate_categories_household_refs on categories;
create trigger validate_categories_household_refs
before insert or update on categories
for each row execute function public.validate_household_refs();

drop trigger if exists validate_transactions_household_refs on transactions;
create trigger validate_transactions_household_refs
before insert or update on transactions
for each row execute function public.validate_household_refs();

drop trigger if exists validate_fixed_costs_household_refs on fixed_costs;
create trigger validate_fixed_costs_household_refs
before insert or update on fixed_costs
for each row execute function public.validate_household_refs();

drop trigger if exists validate_saving_goals_household_refs on saving_goals;
create trigger validate_saving_goals_household_refs
before insert or update on saving_goals
for each row execute function public.validate_household_refs();

alter table profiles enable row level security;
alter table households enable row level security;
alter table household_members enable row level security;
alter table accounts enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table fixed_costs enable row level security;
alter table saving_goals enable row level security;

drop policy if exists "profiles select own or admin" on profiles;
drop policy if exists "profiles insert own" on profiles;
drop policy if exists "profiles update own basic or admin" on profiles;
drop policy if exists "households member select" on households;
drop policy if exists "households owner bootstrap select" on households;
drop policy if exists "households owner insert" on households;
drop policy if exists "households owner update" on households;
drop policy if exists "household members select own household" on household_members;
drop policy if exists "household members owner insert" on household_members;
drop policy if exists "household members self join shared" on household_members;
drop policy if exists "household members owner update" on household_members;
drop policy if exists "household members owner delete" on household_members;
drop policy if exists "accounts member access" on accounts;
drop policy if exists "categories member access" on categories;
drop policy if exists "transactions member access" on transactions;
drop policy if exists "fixed costs member access" on fixed_costs;
drop policy if exists "saving goals member access" on saving_goals;

create policy "profiles select own or admin" on profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles insert own" on profiles
  for insert with check (id = auth.uid());
create policy "profiles update own basic or admin" on profiles
  for update using (id = auth.uid() or public.is_admin())
  with check ((id = auth.uid() and role = 'user') or public.is_admin());

create policy "households member select" on households
  for select using (public.is_household_member(id) or public.is_admin());
create policy "households owner bootstrap select" on households
  for select using (owner_id = auth.uid() or public.is_admin());
create policy "households owner insert" on households
  for insert with check (owner_id = auth.uid() or public.is_admin());
create policy "households owner update" on households
  for update using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

create policy "household members select own household" on household_members
  for select using (user_id = auth.uid() or public.is_household_member(household_id) or public.is_admin());
create policy "household members owner insert" on household_members
  for insert with check (user_id = auth.uid() and public.owns_household(household_id));
create policy "household members self join shared" on household_members
  for insert with check (user_id = auth.uid());
create policy "household members owner update" on household_members
  for update using (public.owns_household(household_id) or public.is_admin())
  with check (public.owns_household(household_id) or public.is_admin());
create policy "household members owner delete" on household_members
  for delete using (public.owns_household(household_id) or public.is_admin());

create policy "accounts member access" on accounts
  for all using (public.is_household_member(household_id) or public.is_admin())
  with check (public.is_household_member(household_id) or public.is_admin());

create policy "categories member access" on categories
  for all using (public.is_household_member(household_id) or public.is_admin())
  with check (public.is_household_member(household_id) or public.is_admin());

create policy "transactions member access" on transactions
  for all using (public.is_household_member(household_id) or public.is_admin())
  with check (public.is_household_member(household_id) or public.is_admin());

create policy "fixed costs member access" on fixed_costs
  for all using (public.is_household_member(household_id) or public.is_admin())
  with check (public.is_household_member(household_id) or public.is_admin());

create policy "saving goals member access" on saving_goals
  for all using (public.is_household_member(household_id) or public.is_admin())
  with check (public.is_household_member(household_id) or public.is_admin());
