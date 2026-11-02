-- ============================================================
-- 家計簿間の資金移動（個人 ⇄ 共有）
-- Supabase の SQL Editor でこのファイルの中身を1回実行してください。
-- 何度実行しても壊れないように書いてあります。
-- ============================================================

-- 1. 取引に「つながり」を持たせる列を追加
alter table transactions add column if not exists transfer_group_id uuid;
alter table transactions add column if not exists transfer_direction text;
alter table transactions add column if not exists counterparty_household_id uuid;
alter table transactions add column if not exists counterparty_account_id uuid;
alter table transactions add column if not exists transfer_sender_id uuid;
alter table transactions add column if not exists counterparty_household_name text;
alter table transactions add column if not exists counterparty_account_name text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_transfer_direction_check') then
    alter table transactions add constraint transactions_transfer_direction_check
      check (transfer_direction is null or transfer_direction in ('out', 'in'));
  end if;
end $$;

create index if not exists transactions_transfer_group_idx on transactions (transfer_group_id) where transfer_group_id is not null;

-- 2. 「振替なら同じ家計簿の振替先が必須」の制約を、家計簿間の資金移動だけは例外にする
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%transfer_to_account_id%'
      and conname <> 'transactions_transfer_target_check'
  loop
    execute format('alter table transactions drop constraint %I', constraint_row.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'transactions_transfer_target_check') then
    alter table transactions add constraint transactions_transfer_target_check check (
      (transaction_type = 'transfer' and (transfer_to_account_id is not null or transfer_group_id is not null))
      or (transaction_type <> 'transfer' and transfer_to_account_id is null)
    );
  end if;
end $$;

-- 3. 資金移動をつくる（両方の家計簿に1件ずつ、同じ transfer_group_id で）
--    呼び出した人が「両方の家計簿のメンバー」であることを確認する
create or replace function public.create_ledger_transfer(
  from_household_id uuid,
  from_account_id uuid,
  from_category_id uuid,
  to_household_id uuid,
  to_account_id uuid,
  to_category_id uuid,
  transfer_amount numeric,
  transfer_date date,
  transfer_memo text,
  count_as_expense boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  group_id uuid := gen_random_uuid();
  from_name text;
  to_name text;
  from_account_name text;
  to_account_name text;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です。';
  end if;
  if from_household_id = to_household_id then
    raise exception '同じ家計簿の中の移動は、通常の振替で登録してください。';
  end if;
  if not public.is_household_member(from_household_id) or not public.is_household_member(to_household_id) then
    raise exception '両方の家計簿のメンバーである必要があります。';
  end if;
  if transfer_amount is null or transfer_amount <= 0 then
    raise exception '金額を入力してください。';
  end if;
  if not exists (select 1 from accounts where id = from_account_id and household_id = from_household_id and deleted_at is null) then
    raise exception '移動元の口座が見つかりません。';
  end if;
  if not exists (select 1 from accounts where id = to_account_id and household_id = to_household_id and deleted_at is null) then
    raise exception '移動先の口座が見つかりません。';
  end if;

  select name into from_name from households where id = from_household_id;
  select name into to_name from households where id = to_household_id;
  select name into from_account_name from accounts where id = from_account_id;
  select name into to_account_name from accounts where id = to_account_id;

  -- 移動元：出ていく側（「支出として数える」なら支出として記録）
  insert into transactions (
    household_id, transaction_type, amount, category_id, account_id, occurred_on, memo,
    transfer_group_id, transfer_direction, counterparty_household_id, counterparty_account_id,
    counterparty_household_name, counterparty_account_name, transfer_sender_id
  ) values (
    from_household_id,
    case when count_as_expense then 'expense'::transaction_type else 'transfer'::transaction_type end,
    transfer_amount, from_category_id, from_account_id, transfer_date, nullif(transfer_memo, ''),
    group_id, 'out', to_household_id, to_account_id, to_name, to_account_name, auth.uid()
  );

  -- 移動先：入ってくる側
  insert into transactions (
    household_id, transaction_type, amount, category_id, account_id, occurred_on, memo,
    transfer_group_id, transfer_direction, counterparty_household_id, counterparty_account_id,
    counterparty_household_name, counterparty_account_name, transfer_sender_id
  ) values (
    to_household_id, 'transfer', transfer_amount, to_category_id, to_account_id, transfer_date, nullif(transfer_memo, ''),
    group_id, 'in', from_household_id, from_account_id, from_name, from_account_name, auth.uid()
  );

  return group_id;
end;
$$;

-- 4. 資金移動を直す：金額・日付・メモは両方に反映。
--    カテゴリ・口座・支出として数えるかは、呼び出した人が見ている家計簿の側だけ変える
create or replace function public.update_ledger_transfer(
  target_group_id uuid,
  editing_household_id uuid,
  new_amount numeric,
  new_date date,
  new_memo text,
  new_category_id uuid,
  new_account_id uuid,
  new_count_as_expense boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  side record;
begin
  select * into side from transactions
  where transfer_group_id = target_group_id and household_id = editing_household_id and deleted_at is null
  limit 1;
  if side.id is null then
    raise exception '資金移動が見つかりません。';
  end if;
  if not public.is_household_member(editing_household_id) and not public.is_admin() then
    raise exception 'この資金移動を変更する権限がありません。';
  end if;
  if new_amount is null or new_amount <= 0 then
    raise exception '金額を入力してください。';
  end if;
  if new_account_id is not null and not exists (select 1 from accounts where id = new_account_id and household_id = editing_household_id and deleted_at is null) then
    raise exception '口座が見つかりません。';
  end if;

  update transactions
  set amount = new_amount,
      occurred_on = new_date,
      memo = nullif(new_memo, '')
  where transfer_group_id = target_group_id and deleted_at is null;

  update transactions
  set category_id = new_category_id,
      account_id = coalesce(new_account_id, account_id),
      transaction_type = case
        when side.transfer_direction = 'out' and new_count_as_expense is true then 'expense'::transaction_type
        when side.transfer_direction = 'out' and new_count_as_expense is false then 'transfer'::transaction_type
        else transaction_type
      end
  where id = side.id;

  -- 相手側に、こちらの口座名を反映
  if new_account_id is not null then
    update transactions
    set counterparty_account_id = new_account_id,
        counterparty_account_name = (select name from accounts where id = new_account_id)
    where transfer_group_id = target_group_id and household_id <> editing_household_id and deleted_at is null;
  end if;
end;
$$;

-- 5. 資金移動を消す：どちらかの家計簿のメンバーなら、両側をまとめて削除（片側だけ残らないように）
create or replace function public.delete_ledger_transfer(target_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not exists (
    select 1 from transactions
    where transfer_group_id = target_group_id and deleted_at is null
      and (public.is_household_member(household_id) or public.is_admin())
  ) then
    raise exception 'この資金移動を削除する権限がありません。';
  end if;
  update transactions set deleted_at = now()
  where transfer_group_id = target_group_id and deleted_at is null;
end;
$$;

-- 6. 通常の取引削除で資金移動の片側を消したときも、もう片側を一緒に消す
create or replace function public.delete_transaction_safe(target_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_household_id uuid;
  target_group uuid;
begin
  select household_id, transfer_group_id into target_household_id, target_group
  from transactions
  where id = target_transaction_id
    and deleted_at is null;

  if target_household_id is null then
    return;
  end if;

  if not public.is_household_member(target_household_id) and not public.is_admin() then
    raise exception 'この取引を削除する権限がありません。';
  end if;

  if target_group is not null then
    update transactions set deleted_at = now() where transfer_group_id = target_group and deleted_at is null;
  else
    update transactions set deleted_at = now() where id = target_transaction_id;
  end if;
end;
$$;

grant execute on function public.create_ledger_transfer(uuid, uuid, uuid, uuid, uuid, uuid, numeric, date, text, boolean) to authenticated;
grant execute on function public.update_ledger_transfer(uuid, uuid, numeric, date, text, uuid, uuid, boolean) to authenticated;
grant execute on function public.delete_ledger_transfer(uuid) to authenticated;
grant execute on function public.delete_transaction_safe(uuid) to authenticated;

-- ============================================================
-- 定期項目（毎月の振替）の家計簿間資金移動
-- ============================================================

-- 7. 定期項目にも「つながり」を持たせる列を追加
alter table fixed_costs add column if not exists transfer_group_id uuid;
alter table fixed_costs add column if not exists transfer_direction text;
alter table fixed_costs add column if not exists counterparty_household_id uuid;
alter table fixed_costs add column if not exists counterparty_account_id uuid;
alter table fixed_costs add column if not exists counterparty_household_name text;
alter table fixed_costs add column if not exists counterparty_account_name text;

do $$
declare
  constraint_row record;
begin
  if not exists (select 1 from pg_constraint where conname = 'fixed_costs_transfer_direction_check') then
    alter table fixed_costs add constraint fixed_costs_transfer_direction_check
      check (transfer_direction is null or transfer_direction in ('out', 'in'));
  end if;
  -- 「振替なら振替先が必須」のような制約があれば、家計簿間の定期移動だけ例外にする
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.fixed_costs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%transfer_to_account_id%'
      and conname <> 'fixed_costs_transfer_target_check'
  loop
    execute format('alter table fixed_costs drop constraint %I', constraint_row.conname);
  end loop;
end $$;

create index if not exists fixed_costs_transfer_group_idx on fixed_costs (transfer_group_id) where transfer_group_id is not null;

-- 8. 定期の資金移動をつくる（両方の家計簿に1件ずつ）
create or replace function public.create_ledger_fixed_transfer(
  from_household_id uuid,
  from_account_id uuid,
  from_category_id uuid,
  to_household_id uuid,
  to_account_id uuid,
  to_category_id uuid,
  item_name text,
  item_amount numeric,
  item_due_day int,
  item_effective_from date,
  item_effective_to date,
  count_as_expense boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  group_id uuid := gen_random_uuid();
  from_name text;
  to_name text;
  from_account_name text;
  to_account_name text;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です。';
  end if;
  if from_household_id = to_household_id then
    raise exception '同じ家計簿の中の移動は、通常の定期振替で登録してください。';
  end if;
  if not public.is_household_member(from_household_id) or not public.is_household_member(to_household_id) then
    raise exception '両方の家計簿のメンバーである必要があります。';
  end if;
  if item_amount is null or item_amount < 0 then
    raise exception '金額を入力してください。';
  end if;
  if item_due_day is null or item_due_day < 1 or item_due_day > 31 then
    raise exception '日付は1〜31で入力してください。';
  end if;
  if not exists (select 1 from accounts where id = from_account_id and household_id = from_household_id and deleted_at is null) then
    raise exception '移動元の口座が見つかりません。';
  end if;
  if not exists (select 1 from accounts where id = to_account_id and household_id = to_household_id and deleted_at is null) then
    raise exception '移動先の口座が見つかりません。';
  end if;

  select name into from_name from households where id = from_household_id;
  select name into to_name from households where id = to_household_id;
  select name into from_account_name from accounts where id = from_account_id;
  select name into to_account_name from accounts where id = to_account_id;

  insert into fixed_costs (
    household_id, name, fixed_type, category_id, account_id, amount, is_variable, due_day, status,
    effective_from, effective_to, transfer_group_id, transfer_direction,
    counterparty_household_id, counterparty_account_id, counterparty_household_name, counterparty_account_name
  ) values (
    from_household_id, item_name,
    case when count_as_expense then 'expense'::transaction_type else 'transfer'::transaction_type end,
    from_category_id, from_account_id, item_amount, false, item_due_day, 'planned',
    item_effective_from, item_effective_to, group_id, 'out',
    to_household_id, to_account_id, to_name, to_account_name
  );

  insert into fixed_costs (
    household_id, name, fixed_type, category_id, account_id, amount, is_variable, due_day, status,
    effective_from, effective_to, transfer_group_id, transfer_direction,
    counterparty_household_id, counterparty_account_id, counterparty_household_name, counterparty_account_name
  ) values (
    to_household_id, item_name, 'transfer', to_category_id, to_account_id, item_amount, false, item_due_day, 'planned',
    item_effective_from, item_effective_to, group_id, 'in',
    from_household_id, from_account_id, from_name, from_account_name
  );

  return group_id;
end;
$$;

-- 9. 定期の資金移動を直す
--    名称・金額・日付・期間は両方に反映。カテゴリ・口座・支出として数えるかは編集した側だけ。
--    edit_scope = 'future' なら、from_month より前で両方を区切り、以降を新しい組として作り直す
create or replace function public.update_ledger_fixed_transfer(
  target_group_id uuid,
  editing_household_id uuid,
  new_name text,
  new_amount numeric,
  new_due_day int,
  new_effective_from date,
  new_effective_to date,
  new_category_id uuid,
  new_account_id uuid,
  new_count_as_expense boolean,
  edit_scope text default 'all',
  from_month date default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  side record;
  next_group uuid := gen_random_uuid();
  close_on date;
begin
  if not exists (select 1 from fixed_costs where transfer_group_id = target_group_id and household_id = editing_household_id and deleted_at is null) then
    raise exception '定期の資金移動が見つかりません。';
  end if;
  if not public.is_household_member(editing_household_id) and not public.is_admin() then
    raise exception 'この定期項目を変更する権限がありません。';
  end if;
  if new_amount is null or new_amount < 0 then
    raise exception '金額を入力してください。';
  end if;
  if new_due_day is null or new_due_day < 1 or new_due_day > 31 then
    raise exception '日付は1〜31で入力してください。';
  end if;
  if new_account_id is not null and not exists (select 1 from accounts where id = new_account_id and household_id = editing_household_id and deleted_at is null) then
    raise exception '口座が見つかりません。';
  end if;

  if edit_scope = 'future' and from_month is not null then
    close_on := (date_trunc('month', from_month) - interval '1 day')::date;
    for side in select * from fixed_costs where transfer_group_id = target_group_id and deleted_at is null loop
      update fixed_costs set effective_to = close_on where id = side.id;
      insert into fixed_costs (
        household_id, name, fixed_type, category_id, account_id, amount, is_variable, due_day, status,
        effective_from, effective_to, transfer_group_id, transfer_direction,
        counterparty_household_id, counterparty_account_id, counterparty_household_name, counterparty_account_name
      ) values (
        side.household_id, new_name,
        case
          when side.household_id = editing_household_id and side.transfer_direction = 'out' and new_count_as_expense is true then 'expense'::transaction_type
          when side.household_id = editing_household_id and side.transfer_direction = 'out' and new_count_as_expense is false then 'transfer'::transaction_type
          else side.fixed_type
        end,
        case when side.household_id = editing_household_id then new_category_id else side.category_id end,
        case when side.household_id = editing_household_id then coalesce(new_account_id, side.account_id) else side.account_id end,
        new_amount, false, new_due_day, 'planned',
        date_trunc('month', from_month)::date, new_effective_to, next_group, side.transfer_direction,
        side.counterparty_household_id,
        case when side.household_id <> editing_household_id and new_account_id is not null then new_account_id else side.counterparty_account_id end,
        side.counterparty_household_name,
        case when side.household_id <> editing_household_id and new_account_id is not null then (select name from accounts where id = new_account_id) else side.counterparty_account_name end
      );
    end loop;
    return;
  end if;

  update fixed_costs
  set name = new_name,
      amount = new_amount,
      due_day = new_due_day,
      effective_from = new_effective_from,
      effective_to = new_effective_to
  where transfer_group_id = target_group_id and deleted_at is null;

  update fixed_costs
  set category_id = new_category_id,
      account_id = coalesce(new_account_id, account_id),
      fixed_type = case
        when transfer_direction = 'out' and new_count_as_expense is true then 'expense'::transaction_type
        when transfer_direction = 'out' and new_count_as_expense is false then 'transfer'::transaction_type
        else fixed_type
      end
  where transfer_group_id = target_group_id and household_id = editing_household_id and deleted_at is null;

  if new_account_id is not null then
    update fixed_costs
    set counterparty_account_id = new_account_id,
        counterparty_account_name = (select name from accounts where id = new_account_id)
    where transfer_group_id = target_group_id and household_id <> editing_household_id and deleted_at is null;
  end if;
end;
$$;

-- 10. 定期の資金移動を消す（両方まとめて）。delete_scope = 'future' なら from_month より前で終わらせる
create or replace function public.delete_ledger_fixed_transfer(target_group_id uuid, delete_scope text default 'all', from_month date default null)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not exists (
    select 1 from fixed_costs
    where transfer_group_id = target_group_id and deleted_at is null
      and (public.is_household_member(household_id) or public.is_admin())
  ) then
    raise exception 'この定期項目を削除する権限がありません。';
  end if;
  if delete_scope = 'future' and from_month is not null then
    update fixed_costs set effective_to = (date_trunc('month', from_month) - interval '1 day')::date
    where transfer_group_id = target_group_id and deleted_at is null;
  else
    update fixed_costs set deleted_at = now()
    where transfer_group_id = target_group_id and deleted_at is null;
  end if;
end;
$$;

-- 11. 定期の資金移動を「この月だけ変更」：金額・日付・スキップは両方に、名称・口座・カテゴリは編集した側だけ
create or replace function public.upsert_ledger_fixed_override(
  target_group_id uuid,
  editing_household_id uuid,
  override_month date,
  new_name text,
  new_amount numeric,
  new_due_day int,
  new_account_id uuid,
  new_category_id uuid,
  new_skipped boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  side record;
  month_start date := date_trunc('month', override_month)::date;
begin
  if not public.is_household_member(editing_household_id) and not public.is_admin() then
    raise exception 'この定期項目を変更する権限がありません。';
  end if;
  if new_account_id is not null and not exists (select 1 from accounts where id = new_account_id and household_id = editing_household_id and deleted_at is null) then
    raise exception '口座が見つかりません。';
  end if;
  for side in select * from fixed_costs where transfer_group_id = target_group_id and deleted_at is null loop
    if side.household_id = editing_household_id then
      insert into fixed_cost_overrides (household_id, fixed_cost_id, target_month, name, category_id, account_id, amount, due_day, skipped)
      values (side.household_id, side.id, month_start, nullif(new_name, ''), new_category_id, new_account_id, new_amount, new_due_day, coalesce(new_skipped, false))
      on conflict (fixed_cost_id, target_month) do update
        set name = excluded.name, category_id = excluded.category_id, account_id = excluded.account_id,
            amount = excluded.amount, due_day = excluded.due_day, skipped = excluded.skipped, deleted_at = null;
    else
      insert into fixed_cost_overrides (household_id, fixed_cost_id, target_month, amount, due_day, skipped)
      values (side.household_id, side.id, month_start, new_amount, new_due_day, coalesce(new_skipped, false))
      on conflict (fixed_cost_id, target_month) do update
        set amount = excluded.amount, due_day = excluded.due_day, skipped = excluded.skipped, deleted_at = null;
    end if;
  end loop;
end;
$$;

grant execute on function public.create_ledger_fixed_transfer(uuid, uuid, uuid, uuid, uuid, uuid, text, numeric, int, date, date, boolean) to authenticated;
grant execute on function public.update_ledger_fixed_transfer(uuid, uuid, text, numeric, int, date, date, uuid, uuid, boolean, text, date) to authenticated;
grant execute on function public.delete_ledger_fixed_transfer(uuid, text, date) to authenticated;
grant execute on function public.upsert_ledger_fixed_override(uuid, uuid, date, text, numeric, int, uuid, uuid, boolean) to authenticated;
