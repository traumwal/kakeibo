import { describe, expect, it } from 'vitest';
import {
  billingDateInMonth, categoryBreakdown, categoryTotals, costPerHour, friendBalances, isActiveInMonth, monthSummary, monthlyAmount, monthlyTrend,
  nextBillingDate, reviewCandidates, SUBSCRIPTION_LABEL,
} from './calc';
import { emptyData } from './storage';
import type { Expense, Subscription } from '../types';

const sub = (p: Partial<Subscription>): Subscription => ({
  id: p.name ?? 's', name: 's', amount: 1000, cycle: 'monthly', billingDay: 10, category: 'サブスク', startDate: '2026-01-01', ...p,
});
const exp = (p: Partial<Expense>): Expense => ({ id: Math.random().toString(), date: '2026-11-05', amount: 1000, category: '外食', ...p });

describe('サブスクの金額', () => {
  it('年払いは12で割って月額換算する', () => {
    expect(monthlyAmount(sub({ amount: 12000, cycle: 'yearly' }))).toBe(1000);
    expect(monthlyAmount(sub({ amount: 980 }))).toBe(980);
  });

  it('開始前と解約後の月は集計しない', () => {
    const s = sub({ startDate: '2026-03-15', endDate: '2026-06-10' });
    expect(isActiveInMonth(s, '2026-02')).toBe(false);
    expect(isActiveInMonth(s, '2026-03')).toBe(true);
    expect(isActiveInMonth(s, '2026-06')).toBe(true);
    expect(isActiveInMonth(s, '2026-07')).toBe(false);
  });

  it('次回請求日: 今月の請求日を過ぎたら翌月、短い月は月末に丸める', () => {
    expect(nextBillingDate(sub({ billingDay: 20 }), '2026-11-12')).toBe('2026-11-20');
    expect(nextBillingDate(sub({ billingDay: 5 }), '2026-11-12')).toBe('2026-12-05');
    expect(nextBillingDate(sub({ billingDay: 31 }), '2026-02-10')).toBe('2026-02-28');
    expect(nextBillingDate(sub({ cycle: 'yearly', startDate: '2025-04-01', billingDay: 1 }), '2026-11-12')).toBe('2027-04-01');
    expect(nextBillingDate(sub({ endDate: '2026-10-01' }), '2026-11-12')).toBeNull();
  });
});

describe('月の集計', () => {
  const data = {
    ...emptyData(),
    subscriptions: [sub({ name: 'a', amount: 1500 }), sub({ name: 'b', amount: 6000, cycle: 'yearly' })],
    expenses: [exp({ amount: 3000 }), exp({ amount: 1500, category: '食費' }), exp({ date: '2026-10-30', amount: 9999 })],
  };

  it('固定費と単発支出の合計', () => {
    expect(monthSummary(data, '2026-11')).toEqual({ ym: '2026-11', subscriptions: 2000, expenses: 4500, total: 6500 });
  });

  it('推移は古い順に n ヶ月', () => {
    const t = monthlyTrend(data, '2026-11', 3);
    expect(t.map((m) => m.ym)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(t[1].expenses).toBe(9999);
  });

  it('カテゴリ別は金額の大きい順で、サブスクは1本にまとめる', () => {
    const c = categoryTotals({ ...data, settings: { ...data.settings, budgets: { 外食: 2500 } } }, '2026-11');
    expect(c.map((x) => x.category)).toEqual(['外食', SUBSCRIPTION_LABEL, '食費']);
    expect(c[0].budget).toBe(2500);
  });
});

describe('友達との貸し借り', () => {
  const friends = [{ id: 'f1', name: 'A' }, { id: 'f2', name: 'B' }];
  it('立て替え(貸し・借り)と返済を合算する', () => {
    const expenses = [
      exp({ settlements: [{ friendId: 'f1', type: 'friendPaid', amount: 3000 }] }),
      exp({ settlements: [{ friendId: 'f1', type: 'iPaid', amount: 1000 }, { friendId: 'f2', type: 'iPaid', amount: 1000 }] }),
    ];
    const repayments = [
      { id: 'r1', friendId: 'f1', date: '2026-11-10', amount: 500, direction: 'paidBack' as const },
      { id: 'r2', friendId: 'f2', date: '2026-11-10', amount: 1000, direction: 'receivedBack' as const },
    ];
    const b = friendBalances(friends, expenses, repayments);
    expect(b.find((x) => x.friend.id === 'f1')!.balance).toBe(-1500); // 1500円借りている
    expect(b.find((x) => x.friend.id === 'f2')!.balance).toBe(0); // 精算済み
  });
});

describe('見直し候補', () => {
  const settings = { ...emptyData().settings, reviewCostPerHour: 500, reviewUnusedDays: 30 };
  const today = '2026-11-12';

  it('1時間あたりのコスト', () => {
    expect(costPerHour(sub({ amount: 1200, usageHoursPerMonth: 4 }))).toBe(300);
    expect(costPerHour(sub({ usageHoursPerMonth: 0 }))).toBe(Infinity);
    expect(costPerHour(sub({}))).toBeNull();
  });

  it('長期間未使用・高コスト・未入力を検出し、深刻なものを優先する', () => {
    const subs = [
      sub({ name: 'ok', amount: 1000, usageHoursPerMonth: 10, lastUsedAt: '2026-11-10' }),
      sub({ name: 'nodata', amount: 5000, lastUsedAt: '2026-11-10' }),
      sub({ name: 'unused', amount: 500, usageHoursPerMonth: 10, lastUsedAt: '2026-09-01' }),
      sub({ name: 'costly', amount: 2000, usageHoursPerMonth: 1, lastUsedAt: '2026-11-11' }),
      sub({ name: 'ended', amount: 9999, endDate: '2026-10-01' }),
    ];
    const r = reviewCandidates(subs, settings, today);
    expect(r.map((c) => c.sub.name)).toEqual(['costly', 'unused', 'nodata']);
    expect(r[0].yearlySaving).toBe(24000);
    expect(r[1].reasons).toEqual([{ kind: 'unused', days: 72 }]);
  });
});

describe('分類別の明細', () => {
  it('分類ごとに金額の大きい順、明細は日付順。サブスクは請求日つきでまとめる', () => {
    const data = {
      ...emptyData(),
      expenses: [
        exp({ date: '2026-11-20', amount: 700, category: '外食' }),
        exp({ date: '2026-11-03', amount: 1500, category: '外食' }),
        exp({ date: '2026-11-10', amount: 800, category: '日用品' }),
        exp({ date: '2026-10-31', amount: 9999, category: '外食' }),
      ],
      subscriptions: [sub({ name: 'a', amount: 1000, billingDay: 25 }), sub({ name: 'b', amount: 12000, cycle: 'yearly', startDate: '2026-03-01' })],
    };
    const groups = categoryBreakdown(data, '2026-11');
    expect(groups.map((g) => [g.category, g.amount])).toEqual([['外食', 2200], [SUBSCRIPTION_LABEL, 2000], ['日用品', 800]]);
    expect(groups[0].items.map((i) => i.date)).toEqual(['2026-11-03', '2026-11-20']);
    // 年払いで今月請求がないものは日付なし(月割り)で最後
    expect(groups[1].items.map((i) => i.date)).toEqual(['2026-11-25', null]);
  });

  it('年払いは開始月に請求日が入る', () => {
    const s = sub({ cycle: 'yearly', startDate: '2026-03-01', billingDay: 31 });
    expect(billingDateInMonth(s, '2027-03')).toBe('2027-03-31');
    expect(billingDateInMonth(s, '2027-04')).toBeNull();
  });
});
