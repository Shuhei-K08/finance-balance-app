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
