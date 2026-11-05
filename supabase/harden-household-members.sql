-- ============================================================
-- セキュリティ強化：家計簿のメンバーを「直接」追加できないようにする
--
-- これまでのポリシーでは、ログインしている人なら誰でも、家計簿のIDさえ分かれば
-- 自分をその家計簿（個人・事業用も含む）のメンバーに追加できてしまう状態でした。
-- 参加は招待コードを確認する関数（join_shared_ledger）からだけにします。
-- 家計簿の作成・参加などのアプリの動きは変わりません。
--
-- Supabase の SQL Editor でこのファイルの中身を1回実行してください。
-- ============================================================
drop policy if exists "household members self join shared" on household_members;
drop policy if exists "household members owner insert" on household_members;

-- 確認用：家計簿ごとのメンバー一覧（知らない人が入っていないか見てください）
select h.name as 家計簿, h.space_type as 種類, coalesce(p.display_name, m.user_id::text) as メンバー, m.member_role as 役割, m.created_at as 参加日時
from household_members m
join households h on h.id = m.household_id
left join profiles p on p.id = m.user_id
where h.deleted_at is null
order by h.name, m.created_at;
