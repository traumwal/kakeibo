import type { AppData } from '../types';

/** 「その他」はどの記録にも使える受け皿。削除した分類の記録はここに移す */
export const FALLBACK_CATEGORY = 'その他';

export const usageCount = (data: AppData, name: string) => data.expenses.filter((e) => e.category === name).length;

/** 名前を変える。記録・予算・サブスクの分類もまとめて変える。既にある名前にすると統合する (予算は統合先を残す) */
export function renameCategory(data: AppData, from: string, to: string): AppData {
  to = to.trim();
  if (!to || to === from || !data.settings.categories.includes(from)) return data;
  const exists = data.settings.categories.includes(to);
  const categories = exists ? data.settings.categories.filter((c) => c !== from) : data.settings.categories.map((c) => (c === from ? to : c));
  const budgets = { ...data.settings.budgets };
  if (from in budgets) {
    if (!(to in budgets)) budgets[to] = budgets[from];
    delete budgets[from];
  }
  return {
    ...data,
    settings: { ...data.settings, categories, budgets },
    expenses: data.expenses.map((e) => (e.category === from ? { ...e, category: to } : e)),
    subscriptions: data.subscriptions.map((s) => (s.category === from ? { ...s, category: to } : s)),
  };
}

/** 削除する。その分類の記録は「その他」(「その他」自体を消すときは先頭の分類) に移す。最後の1つは消せない */
export function removeCategory(data: AppData, name: string): AppData {
  const rest = data.settings.categories.filter((c) => c !== name);
  if (rest.length === 0 || rest.length === data.settings.categories.length) return data;
  const used = usageCount(data, name) > 0;
  const target = name !== FALLBACK_CATEGORY ? FALLBACK_CATEGORY : rest[0];
  const categories = used && !rest.includes(target) ? [...rest, target] : rest;
  const budgets = { ...data.settings.budgets };
  delete budgets[name];
  return {
    ...data,
    settings: { ...data.settings, categories, budgets },
    expenses: data.expenses.map((e) => (e.category === name ? { ...e, category: target } : e)),
  };
}

export function moveCategory(data: AppData, name: string, delta: -1 | 1): AppData {
  const list = [...data.settings.categories];
  const i = list.indexOf(name);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return data;
  [list[i], list[j]] = [list[j], list[i]];
  return { ...data, settings: { ...data.settings, categories: list } };
}

export function addCategory(data: AppData, name: string): AppData {
  name = name.trim();
  if (!name || data.settings.categories.includes(name)) return data;
  const list = [...data.settings.categories];
  // 「その他」は常に最後に置く
  const at = list[list.length - 1] === FALLBACK_CATEGORY ? list.length - 1 : list.length;
  list.splice(at, 0, name);
  return { ...data, settings: { ...data.settings, categories: list } };
}
