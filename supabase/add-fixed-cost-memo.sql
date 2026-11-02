-- ============================================================
-- 定期項目と「この月だけ変更」にメモ欄を追加
-- Supabase の SQL Editor でこのファイルの中身を1回実行してください。
-- 何度実行しても壊れないように書いてあります。
-- ============================================================
alter table fixed_costs add column if not exists memo text;
alter table fixed_cost_overrides add column if not exists memo text;

-- 家計簿間の定期移動のメモを、両方の家計簿にそろえて保存する
-- override_month を渡すと「この月だけ変更」のメモ、渡さなければ定期項目そのもののメモ
create or replace function public.set_ledger_fixed_memo(target_group_id uuid, new_memo text, override_month date default null)
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
    raise exception 'この定期項目を変更する権限がありません。';
  end if;
  if override_month is null then
    update fixed_costs set memo = nullif(new_memo, '')
    where transfer_group_id = target_group_id and deleted_at is null;
  else
    update fixed_cost_overrides o set memo = nullif(new_memo, '')
    from fixed_costs f
    where o.fixed_cost_id = f.id and f.transfer_group_id = target_group_id and f.deleted_at is null
      and o.target_month = date_trunc('month', override_month)::date;
  end if;
end;
$$;

grant execute on function public.set_ledger_fixed_memo(uuid, text, date) to authenticated;

-- すでに片側だけに書いたメモを、相手側にもそろえる（何度実行しても同じ結果）
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'fixed_costs' and column_name = 'transfer_group_id') then
    update fixed_costs f set memo = o.memo
    from fixed_costs o
    where f.transfer_group_id = o.transfer_group_id and f.id <> o.id
      and f.deleted_at is null and o.deleted_at is null
      and f.memo is null and o.memo is not null;

    update fixed_cost_overrides fo set memo = oo.memo
    from fixed_costs f, fixed_costs o, fixed_cost_overrides oo
    where fo.fixed_cost_id = f.id and oo.fixed_cost_id = o.id
      and f.transfer_group_id = o.transfer_group_id and f.id <> o.id
      and fo.target_month = oo.target_month
      and fo.memo is null and oo.memo is not null;
  end if;
end $$;
