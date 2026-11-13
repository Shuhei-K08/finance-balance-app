-- ============================================================
-- 家計簿ごとに「税金」タブを使うかどうか
-- 個人・共有・事業用のどの家計簿でも、設定で税金タブをオン／オフできます。
-- 未設定（null）のときは、これまでどおり事業用の家計簿だけ税金タブが出ます。
-- Supabase の SQL Editor でこのファイルの中身を1回実行してください。
-- 何度実行しても壊れないように書いてあります。
-- （fixed_costs.tax_kind が必要なので、add-business-ledger.sql を先に実行してあること）
-- ============================================================

alter table households add column if not exists tax_enabled boolean;

-- PostgREST に新しい列を知らせる
notify pgrst, 'reload schema';
