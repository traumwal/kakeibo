import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppData } from '../types';
import { normalize } from './storage';
import { deepEqual, merge3, mergeFirst } from './merge';

const META_KEY = 'kakeibo:sync';
const TABLE = 'kakeibo_data';

/** 前回同期したときの状態。次回の3方向マージの基準になる */
export interface SyncMeta {
  userId: string;
  rev: number;
  base: AppData;
}

export function loadMeta(): SyncMeta | null {
  try {
    const s = localStorage.getItem(META_KEY);
    if (!s) return null;
    const m = JSON.parse(s) as SyncMeta;
    return { userId: m.userId, rev: m.rev, base: normalize(m.base) };
  } catch {
    return null;
  }
}

export function saveMeta(meta: SyncMeta | null): void {
  try {
    if (meta) localStorage.setItem(META_KEY, JSON.stringify(meta));
    else localStorage.removeItem(META_KEY);
  } catch {
    // 容量不足など。次回は初回同期として扱われるだけなので無視する
  }
}

/**
 * クラウドと1回同期する。手元とクラウドの変更をマージし、必要ならクラウドに保存する。
 * 返り値の data を手元のデータにする。
 */
export async function syncOnce(
  client: SupabaseClient,
  userId: string,
  local: AppData,
  meta: SyncMeta | null,
): Promise<{ data: AppData; meta: SyncMeta }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row, error } = await client.from(TABLE).select('data, rev').eq('user_id', userId).maybeSingle();
    if (error) throw new Error(error.message);

    if (!row) {
      const { error: insErr } = await client.from(TABLE).insert({ user_id: userId, data: local, rev: 1 });
      if (insErr?.code === '23505') continue; // 別の端末が先に作った
      if (insErr) throw new Error(insErr.message);
      return { data: local, meta: { userId, rev: 1, base: local } };
    }

    const remote = normalize(row.data);
    const rev = Number(row.rev);
    const base = meta && meta.userId === userId ? meta : null;
    const merged = base
      ? base.rev === rev ? local : merge3(base.base, local, remote)
      : mergeFirst(local, remote);

    if (deepEqual(merged, remote)) return { data: remote, meta: { userId, rev, base: remote } };

    const { data: updated, error: upErr } = await client
      .from(TABLE)
      .update({ data: merged, rev: rev + 1, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('rev', rev)
      .select('rev');
    if (upErr) throw new Error(upErr.message);
    if (!updated || updated.length === 0) continue; // 読んだ後に別の端末が保存した → やり直す
    return { data: merged, meta: { userId, rev: rev + 1, base: merged } };
  }
  throw new Error('ほかの端末と同時に保存したため同期できませんでした。少し待ってからもう一度お試しください');
}
