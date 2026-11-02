-- ============================================================
-- 定期項目と「この月だけ変更」にメモ欄を追加
-- Supabase の SQL Editor でこのファイルの中身を1回実行してください。
-- 何度実行しても壊れないように書いてあります。
-- ============================================================
alter table fixed_costs add column if not exists memo text;
alter table fixed_cost_overrides add column if not exists memo text;
