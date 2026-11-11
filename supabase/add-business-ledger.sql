-- ============================================================
-- 事業用の家計簿と「税金」タブ
-- Supabase の SQL Editor でこのファイルの中身を1回実行してください。
-- 何度実行しても壊れないように書いてあります。
-- ============================================================

-- 1. 家計簿の使い方（household = ふだんの生活費 / business = 事業用）
alter table households add column if not exists ledger_purpose text not null default 'household';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'households_ledger_purpose_check') then
    alter table households add constraint households_ledger_purpose_check
      check (ledger_purpose in ('household', 'business'));
  end if;
end $$;

-- 2. 定期項目のうち、税金・社会保険として「税金」タブに出すもの
alter table fixed_costs add column if not exists tax_kind text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fixed_costs_tax_kind_check') then
    alter table fixed_costs add constraint fixed_costs_tax_kind_check
      check (tax_kind is null or tax_kind in ('income_tax', 'resident_tax', 'health_insurance', 'pension'));
  end if;
end $$;
