import { describe, expect, it, vi } from 'vitest';
import { fetchRates, missingRateDates, rateOn, yenCharge } from './fx';
import { amountInMonth, monthSummary } from './calc';
import { statements } from './card';
import { emptyData } from './storage';
import type { FxSettings, Subscription } from '../types';

const claude = (p: Partial<Subscription> = {}): Subscription => ({
  id: 'c', name: 'Claude', amount: 22, currency: 'USD', cycle: 'monthly', billingDay: 6, category: 'サブスク', startDate: '2026-01-06', ...p,
});
const fx = (p: Partial<FxSettings> = {}): FxSettings => ({ rates: {}, manualRate: 150, feePercent: 0, ...p });

describe('ドル円の換算', () => {
  it('JCB の明細と同じ: 22ドル × 160.266円 = 3,525円 (円未満は切り捨て)', () => {
    expect(yenCharge(claude(), '2026-11-06', fx({ rates: { '2026-11-06': 160.266 } }))).toEqual({ yen: 3525, actual: false, estimate: false, rate: 160.266 });
  });

  it('手数料を公表レートに上乗せする (157.74 × 1.016 ≒ 160.26)', () => {
    const c = yenCharge(claude(), '2026-11-06', fx({ rates: { '2026-11-06': 157.74 }, feePercent: 1.6 }));
    expect(c.yen).toBe(3525);
    expect(c.rate).toBeCloseTo(160.26, 2);
  });

  it('レートがない日は最新のレートで見込み、それもなければ手入力のレート', () => {
    expect(rateOn(fx({ latest: { date: '2026-11-16', rate: 155 } }), '2026-12-06')).toEqual({ rate: 155, source: 'latest' });
    expect(rateOn(fx({ manualRate: 152 }), '2026-12-06')).toEqual({ rate: 152, source: 'manual' });
    expect(yenCharge(claude(), '2026-12-06', fx({ manualRate: 150 }))).toMatchObject({ yen: 3300, estimate: true });
  });

  it('明細の額で上書きしたら、それを使う', () => {
    const s = claude({ actuals: { '2026-11': 3525 } });
    expect(yenCharge(s, '2026-11-06', fx({ manualRate: 999 }))).toEqual({ yen: 3525, actual: true, estimate: false, rate: null });
  });

  it('円のサブスクはそのまま', () => {
    expect(yenCharge(claude({ currency: undefined, amount: 980 }), '2026-11-06', fx()).yen).toBe(980);
  });
});

describe('集計への反映', () => {
  const settings = { ...emptyData().settings, fx: fx({ rates: { '2026-10-06': 150, '2026-11-06': 160.266 }, latest: { date: '2026-11-16', rate: 155 } }) };

  it('月ごとに、その月の請求日のレートで換算する (過去の月は動かない)', () => {
    const data = { ...emptyData(), settings, subscriptions: [claude()] };
    expect(monthSummary(data, '2026-10').subscriptions).toBe(3300);
    expect(monthSummary(data, '2026-11').subscriptions).toBe(3525);
    expect(monthSummary(data, '2026-12').subscriptions).toBe(3410); // 22 × 155 の見込み
  });

  it('年払いを月割りにするときは、その年の請求日のレートで', () => {
    const y = claude({ amount: 120, cycle: 'yearly', startDate: '2025-11-06' });
    const s = { ...settings, fx: fx({ rates: { '2025-11-06': 150, '2026-11-06': 160 } }) };
    expect(amountInMonth(y, '2026-10', s)).toBe(1500); // 2025/11 の請求 18,000 ÷ 12
    expect(amountInMonth(y, '2026-11', s)).toBe(1600); // 2026/11 の請求 19,200 ÷ 12
  });

  it('カードの引き落とし額も円に換算する', () => {
    const data = {
      ...emptyData(),
      settings: { ...settings, paymentMethods: ['JCB'], cardRules: { JCB: { closingDay: 15, payDay: 10, payMonths: 1 as const } } },
      subscriptions: [claude({ payment: 'JCB' })],
    };
    const [st] = statements(data, ['2026-12'], '2026-11-17');
    expect(st.amount).toBe(3525);
  });
});

describe('レートの取得', () => {
  it('取りに行くのは、今日より前でまだレートがない請求日だけ', () => {
    expect(missingRateDates(['2026-11-06', '2026-10-06', '2026-11-17', '2026-10-06'], fx({ rates: { '2026-10-06': 150 } }), '2026-11-17')).toEqual(['2026-11-06']);
  });

  it('最新のレートと、請求日のレート (土日は前の営業日) を入れる', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const body = url.includes('latest')
        ? { date: '2026-11-16', rates: { JPY: 155.1 } }
        : { rates: { '2026-10-30': { JPY: 152 }, '2026-11-06': { JPY: 157.74 } } };
      return { ok: true, json: async () => body } as Response;
    });
    // 2026-11-01 は日曜 → 10/30 (金) のレート
    const next = await fetchRates(fx(), ['2026-11-01', '2026-11-06'], '2026-11-17', fetchFn as unknown as typeof fetch);
    expect(next.latest).toEqual({ date: '2026-11-16', rate: 155.1 });
    expect(next.rates).toEqual({ '2026-11-01': 152, '2026-11-06': 157.74 });
    expect(fetchFn.mock.calls[1][0]).toContain('/2026-10-25..2026-11-06?base=USD&symbols=JPY');
  });

  it('取得に失敗したらエラー', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 500 }) as Response);
    await expect(fetchRates(fx(), [], '2026-11-17', fetchFn as unknown as typeof fetch)).rejects.toThrow();
  });
});
