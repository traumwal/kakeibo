import type { FxSettings, Subscription } from '../types';
import { addMonths, daysBetween, parseDate, ymOf } from './date';

export const isUsd = (sub: Pick<Subscription, 'currency'>) => sub.currency === 'USD';

/** その日の公表レート。fixed: その日のレートで確定 / latest: 最新のレートで見込み / manual: 手入力のレート */
export function rateOn(fx: FxSettings, date: string | null): { rate: number; source: 'fixed' | 'latest' | 'manual' } {
  if (date && fx.rates[date]) return { rate: fx.rates[date], source: 'fixed' };
  if (fx.latest) return { rate: fx.latest.rate, source: 'latest' };
  return { rate: fx.manualRate > 0 ? fx.manualRate : 150, source: 'manual' };
}

/** 手数料込みのカードの換算レート */
export const cardRate = (fx: FxSettings, base: number) => base * (1 + (fx.feePercent || 0) / 100);

export interface YenCharge {
  yen: number;
  /** 明細を見て手で入れた額 */
  actual: boolean;
  /** 最新のレートや手入力のレートで出した見込みの額 */
  estimate: boolean;
  /** 使ったカードの換算レート (手数料込み)。円のサブスク・手入力の額は null */
  rate: number | null;
}

/** 1回の請求の円の額。date は請求日 (null なら最新のレートで見込み)。円未満は切り捨て (カード会社の請求に合わせる) */
export function yenCharge(sub: Subscription, date: string | null, fx: FxSettings): YenCharge {
  if (!isUsd(sub)) return { yen: sub.amount, actual: false, estimate: false, rate: null };
  const actual = date ? sub.actuals?.[ymOf(date)] : undefined;
  if (actual != null) return { yen: actual, actual: true, estimate: false, rate: null };
  const r = rateOn(fx, date);
  const rate = cardRate(fx, r.rate);
  // 22 × 160.266 = 3525.85… のような浮動小数の誤差で1円ずれないよう、少しだけ足してから切り捨てる
  return { yen: Math.floor(sub.amount * rate + 1e-6), actual: false, estimate: r.source !== 'fixed', rate };
}

/** レートを取りに行く必要がある請求日 (今日より前で、まだレートがないもの) */
export function missingRateDates(billingDates: string[], fx: FxSettings, todayStr: string): string[] {
  return [...new Set(billingDates)].filter((d) => d < todayStr && !fx.rates[d]).sort();
}

const API = 'https://api.frankfurter.dev/v1';
const shift = (date: string, days: number) => {
  const d = parseDate(date);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * 公表レート (欧州中央銀行) を取得して fx を更新する。送るのは「USD→JPY」と日付だけ。
 * 土日・祝日は公表がないので、その前の営業日のレートを使う。
 */
export async function fetchRates(fx: FxSettings, dates: string[], todayStr: string, fetchFn: typeof fetch = fetch): Promise<FxSettings> {
  const get = async (path: string) => {
    const res = await fetchFn(`${API}/${path}${path.includes('?') ? '&' : '?'}base=USD&symbols=JPY`);
    if (!res.ok) throw new Error(`為替レートを取得できませんでした (${res.status})`);
    return res.json();
  };
  const latestJson = await get('latest');
  const latestRate = Number(latestJson?.rates?.JPY);
  const next: FxSettings = { ...fx, rates: { ...fx.rates } };
  if (latestRate > 0) next.latest = { date: String(latestJson.date ?? todayStr), rate: latestRate };

  const missing = missingRateDates(dates, fx, todayStr);
  if (missing.length) {
    // 最初の日の1週間前から取れば、土日や連休でも前の営業日が入る
    const range = await get(`${shift(missing[0], -7)}..${missing[missing.length - 1]}`);
    const days = Object.entries((range?.rates ?? {}) as Record<string, { JPY?: number }>)
      .map(([d, v]) => [d, Number(v?.JPY)] as const)
      .filter(([, v]) => v > 0)
      .sort(([a], [b]) => a.localeCompare(b));
    for (const date of missing) {
      const prev = days.filter(([d]) => d <= date).pop();
      if (prev && daysBetween(prev[0], date) <= 7) next.rates[date] = prev[1];
    }
  }
  return next;
}

/** 前回の取得から日付が変わっていたら取りに行く */
export const needsRefresh = (fx: FxSettings, checkedOn: string | null, todayStr: string, dates: string[]) =>
  checkedOn !== todayStr || missingRateDates(dates, fx, todayStr).length > 0;

/** 直近 n ヶ月 (と来月) の月 */
export const recentMonths = (todayStr: string, back: number, ahead = 1) =>
  Array.from({ length: back + ahead + 1 }, (_, i) => addMonths(ymOf(todayStr), i - back));
