-- ============================================================
-- 共有家計簿への参加で「column reference "household_id" is ambiguous」になる不具合の修正
-- Supabase の SQL Editor でこのファイルの中身を1回実行してください。
-- ============================================================
create or replace function public.join_shared_ledger(code text)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_user_id uuid := auth.uid();
  -- 列名 household_id とぶつからないように変数名を分ける
  found_household_id uuid;
begin
  if current_user_id is null then
    raise exception 'login required';
  end if;

  insert into profiles (id, display_name)
  values (current_user_id, coalesce(auth.jwt() ->> 'email', 'ユーザー'))
  on conflict (id) do update
    set display_name = coalesce(profiles.display_name, coalesce(auth.jwt() ->> 'email', 'ユーザー')),
        deleted_at = null;

  select h.id into found_household_id
  from households h
  where h.invite_code = upper(trim(code))
    and h.space_type = 'shared'
    and h.deleted_at is null;

  if found_household_id is null then
    raise exception '共有家計簿が見つかりません。招待コードを確認してください。';
  end if;

  if exists (select 1 from household_members m where m.household_id = found_household_id and m.user_id = current_user_id) then
    raise exception 'この共有家計簿にはすでに参加しています。';
  end if;

  insert into household_members (household_id, user_id, member_role)
  values (found_household_id, current_user_id, 'member')
  on conflict do nothing;

  return found_household_id;
end;
$$;
