import type { AppData } from '../types';

const KEY = 'kakeibo:v1';

/** 初めて使うときの分類。家賃・通信費などの固定費はサブスク側で扱うので入れていない */
export const DEFAULT_CATEGORIES = ['外食', '食費', '日用品', '交通', '交際費', '趣味・娯楽', '衣服・美容', '医療・健康', '教育・自己投資', 'その他'];
/** 設定画面の「おすすめから追加」に出す候補 */
export const SUGGESTED_CATEGORIES = [...DEFAULT_CATEGORIES, 'カフェ', '旅行', '書籍', 'ガジェット', 'プレゼント', '住まい', 'ペット', '子ども'];

export function emptyData(): AppData {
  return {
    version: 1,
    subscriptions: [],
    expenses: [],
    friends: [],
    repayments: [],
    settings: {
      categories: DEFAULT_CATEGORIES,
      budgets: {},
      reviewUnusedDays: 30,
      monthlyTarget: 20000,
      yearlyMode: 'spread',
      paymentMethods: ['現金'],
    },
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
