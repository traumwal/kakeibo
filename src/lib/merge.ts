import type { AppData } from '../types';

/** キーの順番に依存しない比較 (Postgres の jsonb はキーの順番を並べ替えるため) */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => deepEqual(v, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) {
    // undefined の項目は「ない」のと同じ扱い (JSON にすると消えるため)
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

/** base から片方だけが変わっていればその変更を採用。両方変わっていたら local を優先 */
function pick<T>(base: T, local: T, remote: T): T {
  if (deepEqual(local, base)) return remote;
  return local;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function mergeObject(base: unknown, local: unknown, remote: unknown): unknown {
  if (!isPlainObject(local) || !isPlainObject(remote)) return pick(base, local, remote);
  const b = isPlainObject(base) ? base : {};
  const out: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(b)])) {
    const v = mergeObject(b[k], local[k], remote[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function mergeList<T extends { id: string }>(base: T[], local: T[], remote: T[]): T[] {
  const bm = new Map(base.map((x) => [x.id, x]));
  const lm = new Map(local.map((x) => [x.id, x]));
  const rm = new Map(remote.map((x) => [x.id, x]));
  const ids = [...lm.keys(), ...[...rm.keys()].filter((id) => !lm.has(id))];
  const out: T[] = [];
  for (const id of ids) {
    const b = bm.get(id);
    const l = lm.get(id);
    const r = rm.get(id);
    let v: T | undefined;
    if (deepEqual(l, b)) v = r; // 手元は変更なし → クラウド側(削除も含む)を採用
    else if (deepEqual(r, b)) v = l; // クラウドは変更なし → 手元を採用
    else v = l ?? r; // 両方で変更: 手元を優先。ただし片方で削除・片方で編集なら編集を残す
    if (v) out.push(v);
  }
  return out;
}

/**
 * 3方向マージ。base は前回同期したときのデータ。
 * 項目は id ごとに、設定は項目ごとに、変更があった側を採用する。
 */
export function merge3(base: AppData, local: AppData, remote: AppData): AppData {
  return {
    version: 1,
    subscriptions: mergeList(base.subscriptions, local.subscriptions, remote.subscriptions),
    expenses: mergeList(base.expenses, local.expenses, remote.expenses),
    friends: mergeList(base.friends, local.friends, remote.friends),
    repayments: mergeList(base.repayments, local.repayments, remote.repayments),
    settings: mergeObject(base.settings, local.settings, remote.settings) as AppData['settings'],
  };
}

/** 初めてクラウドとつなぐとき: 両方の項目を残し、設定はクラウド側を採用する */
export function mergeFirst(local: AppData, remote: AppData): AppData {
  const base: AppData = { ...local, subscriptions: [], expenses: [], friends: [], repayments: [] };
  return merge3(base, local, remote);
}
