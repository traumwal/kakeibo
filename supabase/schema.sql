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

-- ============================================================
-- Apple Pay の支払いの受け取り箱 (iPhone のショートカットから送る)
-- ロック中は Safari を開けないので、ショートカットはここに送るだけにして、
-- 次にアプリを開いたときに記録する。前の部分を実行済みでも、ここから下だけ実行すれば大丈夫です
-- ============================================================

-- ショートカット専用の合言葉 (ログインしなくても、この合言葉で受け取り箱に入れられる)
create table if not exists public.kakeibo_pay_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);
-- 直接は読み書きさせない (下の関数からだけ使う)
alter table public.kakeibo_pay_tokens enable row level security;

create table if not exists public.kakeibo_inbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  pay text not null,                       -- 「金額\n加盟店\nカード」
  created_at timestamptz not null default now()
);
create index if not exists kakeibo_inbox_user on public.kakeibo_inbox (user_id, created_at);

alter table public.kakeibo_inbox enable row level security;
drop policy if exists "own inbox: select" on public.kakeibo_inbox;
drop policy if exists "own inbox: delete" on public.kakeibo_inbox;
create policy "own inbox: select" on public.kakeibo_inbox
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own inbox: delete" on public.kakeibo_inbox
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ログイン中の本人の合言葉を返す (なければ作る。renew = true で作り直す)
create or replace function public.kakeibo_pay_token(renew boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  t text;
begin
  if uid is null then
    raise exception 'ログインしていません';
  end if;
  if not renew then
    select token into t from public.kakeibo_pay_tokens where user_id = uid;
    if t is not null then
      return t;
    end if;
  end if;
  t := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.kakeibo_pay_tokens (user_id, token) values (uid, t)
    on conflict (user_id) do update set token = excluded.token, created_at = now();
  return t;
end;
$$;
revoke all on function public.kakeibo_pay_token(boolean) from public, anon;
grant execute on function public.kakeibo_pay_token(boolean) to authenticated;

-- ショートカットから呼ぶ: 合言葉が合えば、その人の受け取り箱に入れる
create or replace function public.kakeibo_pay(token text, pay text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  select t.user_id into uid from public.kakeibo_pay_tokens t where t.token = kakeibo_pay.token;
  if uid is null then
    raise exception '合言葉が違います';
  end if;
  -- いたずらで大量に入れられないように
  if (select count(*) from public.kakeibo_inbox i where i.user_id = uid and i.created_at > now() - interval '1 minute') >= 20 then
    raise exception '短い時間に送りすぎています';
  end if;
  insert into public.kakeibo_inbox (user_id, pay) values (uid, left(coalesce(kakeibo_pay.pay, ''), 500));
end;
$$;
revoke all on function public.kakeibo_pay(text, text) from public;
grant execute on function public.kakeibo_pay(text, text) to anon, authenticated;
