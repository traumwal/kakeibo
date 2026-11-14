-- kakeibo のクラウド同期用テーブル
-- Supabase の SQL Editor に貼り付けて「Run」してください。

create table if not exists public.kakeibo_data (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  rev bigint not null default 1,          -- 保存のたびに +1 (同時に保存したときの競合検出用)
  updated_at timestamptz not null default now()
);

alter table public.kakeibo_data enable row level security;

-- ログインしている本人の行だけ読み書きできる
drop policy if exists "own row: select" on public.kakeibo_data;
drop policy if exists "own row: insert" on public.kakeibo_data;
drop policy if exists "own row: update" on public.kakeibo_data;
drop policy if exists "own row: delete" on public.kakeibo_data;

create policy "own row: select" on public.kakeibo_data
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own row: insert" on public.kakeibo_data
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own row: update" on public.kakeibo_data
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own row: delete" on public.kakeibo_data
  for delete to authenticated using ((select auth.uid()) = user_id);
