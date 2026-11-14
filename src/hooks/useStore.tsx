import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AppData } from '../types';
import { loadData, saveData } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { loadMeta, saveMeta, syncOnce } from '../lib/sync';
import { deepEqual, merge3 } from '../lib/merge';

export type SyncStatus = 'disabled' | 'signedOut' | 'syncing' | 'synced' | 'offline' | 'error';

export interface Cloud {
  status: SyncStatus;
  email: string | null;
  lastSyncedAt: Date | null;
  error: string | null;
  syncNow: () => void;
  signOut: () => Promise<void>;
}

interface Store {
  data: AppData;
  update: (fn: (d: AppData) => AppData) => void;
  replace: (d: AppData) => void;
  saveError: boolean;
  cloud: Cloud;
}

const Ctx = createContext<Store | null>(null);

const SYNC_DELAY_MS = 1500; // 入力が落ち着いてからクラウドに保存する
const POLL_MS = 60_000; // 画面を開いている間、ほかの端末の変更を取りに行く間隔

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(loadData);
  const [saveError, setSaveError] = useState(false);

  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SyncStatus>(supabase ? 'signedOut' : 'disabled');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [syncErr, setSyncErr] = useState<string | null>(null);

  const dataRef = useRef(data);
  dataRef.current = data;
  const running = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    setSaveError(!saveData(data));
  }, [data]);

  // ログイン状態を追いかける
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const runSync = useCallback(async () => {
    if (!supabase || !userId) return;
    if (running.current) {
      again.current = true;
      return;
    }
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }
    running.current = true;
    setStatus('syncing');
    try {
      const snapshot = dataRef.current;
      const res = await syncOnce(supabase, userId, snapshot, loadMeta());
      saveMeta(res.meta);
      if (!deepEqual(res.data, snapshot)) {
        // 同期中に手元で編集されていたら、その編集も残す (次回の同期でクラウドに送られる)
        setData((cur) => (cur === snapshot ? res.data : merge3(snapshot, cur, res.data)));
      }
      setLastSyncedAt(new Date());
      setSyncErr(null);
      setStatus('synced');
    } catch (e) {
      setSyncErr((e as Error).message);
      setStatus(navigator.onLine ? 'error' : 'offline');
    } finally {
      running.current = false;
      if (again.current) {
        again.current = false;
        void runSync();
      }
    }
  }, [userId]);

  // ログインしたら同期、ログアウトしたら状態を戻す
  useEffect(() => {
    if (!supabase) return;
    if (userId) void runSync();
    else setStatus('signedOut');
  }, [userId, runSync]);

  // 手元で変更があったら少し待ってから同期
  useEffect(() => {
    if (!userId) return;
    const meta = loadMeta();
    if (meta && meta.userId === userId && deepEqual(meta.base, data)) return; // 同期済みの内容と同じ
    const t = setTimeout(() => void runSync(), SYNC_DELAY_MS);
    return () => clearTimeout(t);
  }, [data, userId, runSync]);

  // アプリに戻ってきたとき・オンラインに戻ったとき・定期的に、ほかの端末の変更を取りに行く
  useEffect(() => {
    if (!userId) return;
    const onVisible = () => document.visibilityState === 'visible' && void runSync();
    const onOnline = () => void runSync();
    const onOffline = () => setStatus('offline');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const timer = setInterval(() => document.visibilityState === 'visible' && void runSync(), POLL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(timer);
    };
  }, [userId, runSync]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    saveMeta(null); // 手元のデータは残す
    setLastSyncedAt(null);
    setSyncErr(null);
  }, []);

  const cloud = useMemo<Cloud>(
    () => ({
      status,
      email: session?.user.email ?? null,
      lastSyncedAt,
      error: syncErr,
      syncNow: () => void runSync(),
      signOut,
    }),
    [status, session, lastSyncedAt, syncErr, runSync, signOut],
  );

  const update = useCallback((fn: (d: AppData) => AppData) => setData((d) => fn(d)), []);
  const value = useMemo(() => ({ data, update, replace: setData, saveError, cloud }), [data, update, saveError, cloud]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider がありません');
  return s;
}
