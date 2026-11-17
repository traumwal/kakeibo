import { describe, expect, it } from 'vitest';
import { addCategory, guessCategory, moveCategory, removeCategory, renameCategory, subCategoryOptions } from './categories';
import { emptyData } from './storage';
import type { AppData, Expense } from '../types';

const exp = (category: string): Expense => ({ id: Math.random().toString(), date: '2026-11-05', amount: 1000, category });
const make = (categories: string[], expenses: Expense[] = [], budgets: Record<string, number> = {}): AppData => {
  const d = emptyData();
  return { ...d, expenses, settings: { ...d.settings, categories, budgets } };
};

describe('分類の編集', () => {
  it('名前を変えると記録と予算もついてくる', () => {
    const d = renameCategory(make(['外食', 'その他'], [exp('外食'), exp('その他')], { 外食: 10000 }), '外食', 'ごはん');
    expect(d.settings.categories).toEqual(['ごはん', 'その他']);
    expect(d.settings.budgets).toEqual({ ごはん: 10000 });
    expect(d.expenses.map((e) => e.category)).toEqual(['ごはん', 'その他']);
  });

  it('既にある名前に変えると統合する', () => {
    const d = renameCategory(make(['外食', '食費', 'その他'], [exp('外食')], { 外食: 1, 食費: 2 }), '外食', '食費');
    expect(d.settings.categories).toEqual(['食費', 'その他']);
    expect(d.settings.budgets).toEqual({ 食費: 2 });
    expect(d.expenses[0].category).toBe('食費');
  });

  it('削除すると記録は「その他」に移る(なければ作る)', () => {
    const d = removeCategory(make(['外食', '食費'], [exp('外食')], { 外食: 1 }), '外食');
    expect(d.settings.categories).toEqual(['食費', 'その他']);
    expect(d.settings.budgets).toEqual({});
    expect(d.expenses[0].category).toBe('その他');
  });

  it('使っていない分類の削除では「その他」を増やさない。最後の1つは消せない', () => {
    expect(removeCategory(make(['外食', '食費']), '外食').settings.categories).toEqual(['食費']);
    expect(removeCategory(make(['外食']), '外食').settings.categories).toEqual(['外食']);
  });

  it('「その他」を消すと記録は先頭の分類に移る', () => {
    const d = removeCategory(make(['外食', 'その他'], [exp('その他')]), 'その他');
    expect(d.expenses[0].category).toBe('外食');
  });

  it('並べ替えと追加(「その他」は最後のまま)', () => {
    expect(moveCategory(make(['a', 'b', 'c']), 'c', -1).settings.categories).toEqual(['a', 'c', 'b']);
    expect(moveCategory(make(['a', 'b']), 'a', -1).settings.categories).toEqual(['a', 'b']);
    expect(addCategory(make(['a', 'その他']), ' 趣味 ').settings.categories).toEqual(['a', '趣味', 'その他']);
    expect(addCategory(make(['a']), 'a').settings.categories).toEqual(['a']);
  });
});

describe('サブスクの分類', () => {
  it('名前から分類を推測する', () => {
    expect(guessCategory('JR 定期券')).toBe('交通');
    expect(guessCategory('Netflix プレミアム')).toBe('趣味・娯楽');
    expect(guessCategory('ChatGPT Plus')).toBe('AI・ツール');
    expect(guessCategory('Claude Pro')).toBe('AI・ツール');
    expect(guessCategory('au')).toBe('通信費');
    expect(guessCategory('chocoZAP')).toBe('医療・健康');
    expect(guessCategory('よくわからないもの')).toBeUndefined();
    expect(guessCategory('ガウチョ')).toBeUndefined(); // 短い英字 au は部分一致しない
  });

  it('分類を削除するとサブスクも「その他」に移る', () => {
    const d = make(['趣味・娯楽', 'その他']);
    const s = { id: 'n', name: 'Netflix', amount: 1000, cycle: 'monthly' as const, billingDay: 1, category: '趣味・娯楽', startDate: '2026-01-01' };
    const r = removeCategory({ ...d, subscriptions: [s] }, '趣味・娯楽');
    expect(r.subscriptions[0].category).toBe('その他');
  });

  it('選択肢は記録用の分類と固定費の候補。未分類は最後', () => {
    const o = subCategoryOptions(['外食', '交通', 'その他']);
    expect(o.slice(0, 2)).toEqual(['外食', '交通']);
    expect(o).toContain('AI・ツール');
    expect(o.filter((c) => c === '交通')).toHaveLength(1);
    expect(o.at(-1)).toBe('サブスク');
  });
});
