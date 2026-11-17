import { describe, expect, it } from 'vitest';
import {
  billingDateInMonth, categoryBreakdown, sortGroups, type GroupSort, type LedgerItem, categoryTotals, friendBalances, isActiveInMonth, monthSummary, monthlyAmount, monthlyTrend,
  nextBillingDate, reviewCandidates, SUBSCRIPTION_LABEL, amountInMonth, turnOff, turnOn, isOn, markUsed, usesInLast, monthsOfYear, yearTrend,
  paymentBreakdown, NO_PAYMENT_LABEL, axisTicks,
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

  it('固定費と日々の支出の合計', () => {
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
  const settings = { ...emptyData().settings, reviewUnusedDays: 30 };
  const today = '2026-11-12';

  it('長期間使っていない・ほぼ使わない・記録なしを検出し、節約額の大きい順', () => {
    const subs = [
      sub({ name: 'ok', amount: 1000, lastUsedAt: '2026-11-10' }),
      sub({ name: 'rated', amount: 3000, usage: 'often' }),
      sub({ name: 'never', amount: 5000 }),
      sub({ name: 'unused', amount: 500, lastUsedAt: '2026-09-01' }),
      sub({ name: 'rarely', amount: 2000, usage: 'rarely', lastUsedAt: '2026-11-11' }),
      sub({ name: 'off', amount: 9999, endDate: '2026-10-01' }),
    ];
    const r = reviewCandidates(subs, settings, today);
    expect(r.map((c) => c.sub.name)).toEqual(['never', 'rarely', 'unused']);
    expect(r[1].yearlySaving).toBe(24000);
    expect(r[2].reasons).toEqual([{ kind: 'unused', days: 72 }]);
  });

  it('「今日使った」の回数を数え、90日より前は捨てる', () => {
    let s = sub({ usedDates: ['2026-07-01', '2026-10-20', '2026-11-01'] });
    s = markUsed(s, today);
    expect(s.lastUsedAt).toBe(today);
    expect(s.usedDates).toEqual(['2026-10-20', '2026-11-01', today]);
    expect(usesInLast(s, today)).toBe(3);
    expect(markUsed(s, today).usedDates).toHaveLength(3); // 同じ日は1回
  });
});

describe('オン/オフ', () => {
  it('オフにした月までは集計し、翌月からは集計しない', () => {
    const s = turnOff(sub({ startDate: '2026-01-01' }), '2026-06-15');
    expect(isOn(s, '2026-06-14')).toBe(true);
    expect(isOn(s, '2026-06-15')).toBe(false);
    expect(isActiveInMonth(s, '2026-06')).toBe(true);
    expect(isActiveInMonth(s, '2026-07')).toBe(false);
  });

  it('同じ月に戻したらオフを取り消す', () => {
    const s = turnOn(turnOff(sub({}), '2026-06-15'), '2026-06-20');
    expect(s.endDate).toBeUndefined();
    expect(s.history).toBeUndefined();
  });

  it('後の月に戻したら、過去の期間を残して今日から再開する', () => {
    const s = turnOn(turnOff(sub({ startDate: '2026-01-01' }), '2026-03-10'), '2026-08-05');
    expect(s.startDate).toBe('2026-08-05');
    expect(s.history).toEqual([{ start: '2026-01-01', end: '2026-03-10' }]);
    expect(['2026-02', '2026-03', '2026-05', '2026-08'].map((ym) => isActiveInMonth(s, ym))).toEqual([true, true, false, true]);
  });
});

describe('年払いの計上方法', () => {
  const y = sub({ amount: 12000, cycle: 'yearly', startDate: '2026-03-01' });
  it('月割り: 毎月 1/12', () => {
    expect(amountInMonth(y, '2026-05', { ...emptyData().settings, yearlyMode: 'spread' })).toBe(1000);
  });
  it('請求月にまとめて: 請求月だけ全額', () => {
    expect(amountInMonth(y, '2027-03', { ...emptyData().settings, yearlyMode: 'billing' })).toBe(12000);
    expect(amountInMonth(y, '2026-05', { ...emptyData().settings, yearlyMode: 'billing' })).toBe(0);
  });
});

describe('年間の集計', () => {
  it('今年は今月まで、来年は空', () => {
    expect(monthsOfYear(2026, '2026-03')).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(monthsOfYear(2025, '2026-03')).toHaveLength(12);
    expect(monthsOfYear(2027, '2026-03')).toEqual([]);
  });
  it('1年分の推移は12ヶ月で、先の月は0', () => {
    const data = { ...emptyData(), subscriptions: [sub({ amount: 1000, startDate: '2025-01-01' })] };
    const t = yearTrend(data, 2026, '2026-03');
    expect(t).toHaveLength(12);
    expect(t.map((m) => m.total).slice(0, 4)).toEqual([1000, 1000, 1000, 0]);
  });
  it('複数月の分類別: サブスクは1行にまとめ、予算は月数倍', () => {
    const data = {
      ...emptyData(),
      settings: { ...emptyData().settings, budgets: { 外食: 1000 } },
      expenses: [exp({ date: '2026-01-05', amount: 500 }), exp({ date: '2026-02-05', amount: 700 })],
      subscriptions: [sub({ name: 'a', amount: 1000, startDate: '2025-01-01' })],
    };
    const g = categoryBreakdown(data, ['2026-01', '2026-02', '2026-03']);
    expect(g.map((x) => [x.category, x.amount, x.budget])).toEqual([[SUBSCRIPTION_LABEL, 3000, undefined], ['外食', 1200, 3000]]);
    expect(g[0].items).toMatchObject([{ kind: 'sub', date: null, count: 3 }]);
  });
});

describe('支払い方法別', () => {
  it('記録とサブスクをカードごとにまとめ、未設定は最後', () => {
    const data = {
      ...emptyData(),
      expenses: [exp({ amount: 3000, payment: '楽天カード' }), exp({ amount: 9000 }), exp({ amount: 500, payment: '現金' })],
      subscriptions: [sub({ amount: 1000, payment: '楽天カード' })],
    };
    const g = paymentBreakdown(data, '2026-11');
    expect(g.map((x) => [x.category, x.amount])).toEqual([['楽天カード', 4000], ['現金', 500], [NO_PAYMENT_LABEL, 9000]]);
  });
});

describe('グラフの目盛り', () => {
  it('目安の半分きざみ、目安までは必ず出す', () => {
    expect(axisTicks(7000, 20000)).toEqual([0, 10000, 20000]);
    expect(axisTicks(26000, 20000)).toEqual([0, 10000, 20000, 30000]);
  });
  it('多すぎるときは間隔を倍にする', () => {
    expect(axisTicks(140000, 20000)).toEqual([0, 40000, 80000, 120000, 160000]);
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

describe('分類の並び順', () => {
  const g = (category: string, n: number, amount: number) => ({ category, amount, items: Array(n).fill(null) as LedgerItem[] });
  const groups = [g('交通', 1, 20000), g('外食', 5, 8000), g(SUBSCRIPTION_LABEL, 3, 3000), g('食費', 5, 12000)];
  const names = (mode: GroupSort) => sortGroups(groups, mode, ['外食', '食費', '交通']).map((x) => x.category);

  it('自分で決めた順。サブスクは最後', () => {
    expect(names('custom')).toEqual(['外食', '食費', '交通', SUBSCRIPTION_LABEL]);
  });
  it('回数順(同じ回数なら金額順)', () => {
    expect(names('count')).toEqual(['食費', '外食', SUBSCRIPTION_LABEL, '交通']);
  });
  it('金額順', () => {
    expect(names('amount')).toEqual(['交通', '食費', '外食', SUBSCRIPTION_LABEL]);
  });
});
