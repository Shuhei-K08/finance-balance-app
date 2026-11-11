-- ============================================================
-- 税金・年金などの「支払った」記録
-- 定期項目のその月の分を、いつ支払い済みにしたか
-- Supabase の SQL Editor でこのファイルの中身を1回実行してください。
-- 何度実行しても壊れないように書いてあります。
-- ============================================================

alter table fixed_cost_overrides add column if not exists pay_date date;
alter table fixed_cost_overrides add column if not exists paid_on date;

-- PostgREST に新しい列を知らせる
notify pgrst, 'reload schema';
