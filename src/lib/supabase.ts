import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** 環境変数が設定されていないときは null (クラウド同期なしで今まで通り動く) */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

/** ショートカットから受け取り箱に送るときのアドレスとキー (anon key は公開してよいキー) */
export const supabaseUrl = url ?? null;
export const supabaseAnonKey = key ?? null;
