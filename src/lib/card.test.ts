import { describe, expect, it } from 'vitest';
import { closingDateFor, statements, upcomingWithdrawals, withdrawalDate, ruleLabel } from './card';
import { emptyData } from './storage';
import type { CardRule, Expense, Subscription } from '../types';

const eom27: CardRule = { closingDay: 31, payDay: 27, payMonths: 1 }; // 末締め翌月27日
const d15: CardRule = { closingDay: 15, payDay: 10, payMonths: 1 }; // 15日締め翌月10日

describe('締め日と引き落とし日', () => {
  it('末締め翌月27日払い', () => {
    expect(withdrawalDate(eom27, '2026-11-01')).toBe('2026-12-27');
    expect(withdrawalDate(eom27, '2026-11-30')).toBe('2026-12-27');
    expect(withdrawalDate(eom27, '2026-12-01')).toBe('2027-01-27');
  });
  it('15日締め: 締め日を過ぎたら翌月の締めに入る', () => {
    expect(closingDateFor(d15, '2026-11-15')).toBe('2026-11-15');
    expect(withdrawalDate(d15, '2026-11-15')).toBe('2026-12-10');
    expect(withdrawalDate(d15, '2026-11-16')).toBe('2027-01-10');
  });
  it('翌々月払い・短い月は月末に丸める', () => {
    expect(withdrawalDate({ closingDay: 31, payDay: 31, payMonths: 2 }, '2026-12-10')).toBe('2027-02-28');
  });
  it('表示', () => {
    expect(ruleLabel(eom27)).toBe('末日締め・翌月27日払い');
  });
});

describe('引き落とし額', () => {
  const exp = (p: Partial<Expense>): Expense => ({ id: Math.random().toString(), date: '2026-11-05', amount: 1000, category: '外食', payment: 'A', ...p });
  const sub = (p: Partial<Subscription>): Subscription => ({
    id: 's', name: 's', amount: 1000, cycle: 'monthly', billingDay: 10, category: 'サブスク', startDate: '2025-01-01', payment: 'A', ...p,
  });
  const data = {
    ...emptyData(),
    settings: { ...emptyData().settings, paymentMethods: ['現金', 'A'], cardRules: { A: d15 } },
    expenses: [
      exp({ date: '2026-10-20', amount: 2000 }), // 11/15締め → 12/10
      exp({ date: '2026-11-15', amount: 3000 }), // 11/15締め → 12/10
      exp({ date: '2026-11-16', amount: 4000 }), // 12/15締め → 1/10
      exp({ date: '2026-11-01', amount: 500, payment: '現金' }),
      exp({ date: '2026-11-02', amount: 700, settlements: [{ friendId: 'f', type: 'friendPaid', amount: 700 }] }), // 友達が払った
      exp({ date: '2026-11-03', amount: 1000, total: 3000, settlements: [{ friendId: 'f', type: 'iPaid', amount: 2000 }] }), // 合計で請求
    ],
    subscriptions: [sub({ amount: 1490, billingDay: 10 }), sub({ id: 'y', amount: 12000, cycle: 'yearly', startDate: '2025-11-01', billingDay: 1 })],
  };

  it('引き落とし月ごとにまとめる。年払いは請求月に全額、友達が払った分は除く', () => {
    const [s] = statements(data, ['2026-12'], '2026-11-16');
    expect(s.payDate).toBe('2026-12-10');
    expect(s.closeDate).toBe('2026-11-15');
    // 2000 + 3000 + 3000(立て替え合計) + 1490(11/10) + 12000(11/1 年払い)
    expect(s.amount).toBe(21490);
    expect(s.open).toBe(false);
  });

  it('次回の引き落とし: 締め前なら見込み', () => {
    const [u] = upcomingWithdrawals(data, '2026-12-11');
    expect(u.payDate).toBe('2027-01-10');
    expect(u.amount).toBe(4000 + 1490); // 11/16 の利用 + 12/10 のサブスク
    expect(u.open).toBe(true);
  });

  it('締め日を設定していないカードは出さない', () => {
    const d = { ...data, settings: { ...data.settings, cardRules: {} } };
    expect(statements(d, ['2026-12'], '2026-11-16')).toEqual([]);
  });
});
