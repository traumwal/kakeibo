import type { AppData } from '../types';

const KEY = 'kakeibo:v1';

export const DEFAULT_CATEGORIES = ['外食', '食費', '交際費', '日用品', '交通', '娯楽', '衣服', 'その他'];

export function emptyData(): AppData {
  return {
    version: 1,
    subscriptions: [],
    expenses: [],
    friends: [],
    repayments: [],
    settings: { categories: DEFAULT_CATEGORIES, budgets: {}, reviewCostPerHour: 500, reviewUnusedDays: 30 },
  };
}

/** 読み込んだデータを検証し、欠けている項目は既定値で補う */
export function normalize(raw: unknown): AppData {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') throw new Error('データの形式が正しくありません');
  const r = raw as Partial<AppData>;
  if (r.version !== 1) throw new Error('対応していないデータのバージョンです');
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    version: 1,
    subscriptions: arr(r.subscriptions),
    expenses: arr(r.expenses),
    friends: arr(r.friends),
    repayments: arr(r.repayments),
    settings: { ...base.settings, ...(r.settings ?? {}) },
  };
}

export function loadData(): AppData {
  try {
    const s = localStorage.getItem(KEY);
    return s ? normalize(JSON.parse(s)) : emptyData();
  } catch {
    return emptyData();
  }
}

export function saveData(data: AppData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
