-- 定期項目で「振替」を選ぶと "category must belong to the same household" になる不具合の修正
-- 振替の定期項目は category_id = null で保存されるため、カテゴリはnullでない場合のみ検証する。
-- あわせて振替先口座（transfer_to_account_id）が同じ家計簿の口座かを検証する。

alter table fixed_costs add column if not exists fixed_type transaction_type not null default 'expense';
alter table fixed_costs add column if not exists transfer_to_account_id uuid references accounts(id);

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
    if new.deleted_at is not null then
      return new;
    end if;
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
    if new.transfer_to_account_id is not null and not exists (select 1 from accounts where id = new.transfer_to_account_id and household_id = new.household_id and deleted_at is null) then
      raise exception 'transfer target must belong to the same household';
    end if;
    -- 振替の定期項目はカテゴリを持たない（category_id = null）ため、カテゴリ指定時のみ検証する
    if new.category_id is not null and not exists (select 1 from categories where id = new.category_id and household_id = new.household_id and deleted_at is null) then
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
