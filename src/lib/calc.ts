import type { AppData, Expense, Friend, Period, Repayment, Settings, Subscription, YearlyMode } from '../types';
import { addMonths, clampDay, daysBetween, monthEnd, monthStart, ymOf } from './date';

export const SUBSCRIPTION_LABEL = 'サブスク・固定費';
/** サブスク・固定費以外の、記録した支出 */
export const VARIABLE_LABEL = '日々の支出';
/** 支払い方法が未設定の記録 */
export const NO_PAYMENT_LABEL = '未設定';

type CalcData = Pick<AppData, 'subscriptions' | 'expenses' | 'settings'>;

/** 月額換算 (年払いは 12 で割る) */
export function monthlyAmount(sub: Subscription): number {
  return sub.cycle === 'yearly' ? sub.amount / 12 : sub.amount;
}

export function yearlyAmount(sub: Subscription): number {
  return sub.cycle === 'yearly' ? sub.amount : sub.amount * 12;
}

/** 過去の期間も含めた、オンだった期間すべて (最後が今の期間) */
function periodsOf(sub: Subscription): { start: string; end?: string }[] {
  return [...(sub.history ?? []), { start: sub.startDate, end: sub.endDate }];
}

/** 指定月にかかっている期間 (開始日〜オフにした日の間に月がかかっているか) */
function periodInMonth(sub: Subscription, ym: string) {
  return periodsOf(sub).find((p) => p.start <= monthEnd(ym) && (!p.end || p.end >= monthStart(ym)));
}

export function isActiveInMonth(sub: Subscription, ym: string): boolean {
  return periodInMonth(sub, ym) != null;
}

/** スイッチがオンか (オフにした日の翌日からオフ扱い。オフにした月の分は集計に残る) */
export function isOn(sub: Subscription, date: string): boolean {
  return !sub.endDate || sub.endDate > date;
}

/** オフにする */
export function turnOff(sub: Subscription, date: string): Subscription {
  return { ...sub, endDate: date < sub.startDate ? sub.startDate : date };
}

/** オンに戻す。同じ月のうちに戻したらオフをなかったことにし、それより後なら今の期間を履歴に残して今日から再開 */
export function turnOn(sub: Subscription, date: string): Subscription {
  if (!sub.endDate) return sub;
  if (ymOf(sub.endDate) >= ymOf(date)) return { ...sub, endDate: undefined };
  const history: Period[] = [...(sub.history ?? []), { start: sub.startDate, end: sub.endDate }];
  return { ...sub, history, startDate: date, endDate: undefined };
}

/** 次回の請求日 (基準日を含む) */
export function nextBillingDate(sub: Subscription, from: string): string | null {
  if (sub.endDate && sub.endDate < from) return null;
  const fromYm = ymOf(from);
  if (sub.cycle === 'monthly') {
    let ym = fromYm;
    let d = clampDay(ym, sub.billingDay);
    if (d < from) {
      ym = addMonths(ym, 1);
      d = clampDay(ym, sub.billingDay);
    }
    return d < sub.startDate ? clampDay(ymOf(sub.startDate), sub.billingDay) : d;
  }
  const month = sub.startDate.slice(5, 7);
  let year = Number(from.slice(0, 4));
  let d = clampDay(`${year}-${month}`, sub.billingDay);
  if (d < from) {
    year += 1;
    d = clampDay(`${year}-${month}`, sub.billingDay);
  }
  return d;
}

/** その月の請求日。年払いはその期間の開始月にだけ請求 */
export function billingDateInMonth(sub: Subscription, ym: string): string | null {
  const p = periodInMonth(sub, ym);
  if (!p) return null;
  if (sub.cycle === 'yearly' && p.start.slice(5, 7) !== ym.slice(5, 7)) return null;
  return clampDay(ym, sub.billingDay);
}

/** その月に計上する額。年払いは設定に応じて 月割り(÷12) か 請求月にまとめて */
export function amountInMonth(sub: Subscription, ym: string, mode: YearlyMode = 'spread'): number {
  if (!isActiveInMonth(sub, ym)) return 0;
  if (sub.cycle === 'monthly') return sub.amount;
  if (mode === 'spread') return sub.amount / 12;
  return billingDateInMonth(sub, ym) ? sub.amount : 0;
}

export function subscriptionTotalForMonth(subs: Subscription[], ym: string, mode: YearlyMode = 'spread'): number {
  return subs.reduce((sum, s) => sum + amountInMonth(s, ym, mode), 0);
}

export function expensesInMonth(expenses: Expense[], ym: string): Expense[] {
  return expenses.filter((e) => ymOf(e.date) === ym);
}

export function expensesInMonths(expenses: Expense[], yms: string[]): Expense[] {
  const set = new Set(yms);
  return expenses.filter((e) => set.has(ymOf(e.date)));
}

/** その年の集計対象の月。今年は今月まで (先の月のサブスクを見込みで足さない)、来年以降は空 */
export function monthsOfYear(year: number, todayYm: string): string[] {
  const all = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  return all.filter((ym) => ym <= todayYm);
}

export interface MonthSummary {
  ym: string;
  subscriptions: number;
  expenses: number;
  total: number;
}

export function monthSummary(data: CalcData, ym: string): MonthSummary {
  const subscriptions = subscriptionTotalForMonth(data.subscriptions, ym, data.settings.yearlyMode);
  const expenses = expensesInMonth(data.expenses, ym).reduce((s, e) => s + e.amount, 0);
  return { ym, subscriptions, expenses, total: subscriptions + expenses };
}

export function sumSummaries(list: MonthSummary[], ym = ''): MonthSummary {
  return list.reduce(
    (a, m) => ({ ym, subscriptions: a.subscriptions + m.subscriptions, expenses: a.expenses + m.expenses, total: a.total + m.total }),
    { ym, subscriptions: 0, expenses: 0, total: 0 },
  );
}

/** 直近 n ヶ月の推移 (古い順) */
export function monthlyTrend(data: CalcData, endYm: string, n: number): MonthSummary[] {
  return Array.from({ length: n }, (_, i) => monthSummary(data, addMonths(endYm, i - n + 1)));
}

/** 1年分の月別 (1月〜12月)。まだ来ていない月は 0 */
export function yearTrend(data: CalcData, year: number, todayYm: string): MonthSummary[] {
  return Array.from({ length: 12 }, (_, i) => {
    const ym = `${year}-${String(i + 1).padStart(2, '0')}`;
    return ym <= todayYm ? monthSummary(data, ym) : { ym, subscriptions: 0, expenses: 0, total: 0 };
  });
}

export interface CategoryTotal {
  category: string;
  amount: number;
  budget?: number;
}

/** 分類別合計 (サブスクは1つの棒にまとめる)。金額の大きい順。複数月なら予算も月数倍 */
export function categoryTotals(data: CalcData, yms: string | string[]): CategoryTotal[] {
  return categoryBreakdown(data, yms).map(({ category, amount, budget }) => ({ category, amount, budget }));
}

export interface FriendBalance {
  friend: Friend;
  /** 正: 友達に貸している (返してもらう) / 負: 友達に借りている (返す) */
  balance: number;
}

export function friendBalances(friends: Friend[], expenses: Expense[], repayments: Repayment[]): FriendBalance[] {
  const map = new Map<string, number>(friends.map((f) => [f.id, 0]));
  for (const e of expenses) {
    for (const s of e.settlements ?? []) {
      if (!map.has(s.friendId)) continue;
      map.set(s.friendId, map.get(s.friendId)! + (s.type === 'iPaid' ? s.amount : -s.amount));
    }
  }
  for (const r of repayments) {
    if (!map.has(r.friendId)) continue;
    map.set(r.friendId, map.get(r.friendId)! + (r.direction === 'paidBack' ? r.amount : -r.amount));
  }
  return friends.map((friend) => ({ friend, balance: map.get(friend.id)! }));
}

/** 直近 days 日の「今日使った」の回数 */
export function usesInLast(sub: Subscription, todayStr: string, days = 30): number {
  return (sub.usedDates ?? []).filter((d) => d <= todayStr && daysBetween(d, todayStr) < days).length;
}

/** 「今日使った」を記録。90日より前の記録は捨てる */
export function markUsed(sub: Subscription, todayStr: string): Subscription {
  const kept = (sub.usedDates ?? []).filter((d) => d !== todayStr && daysBetween(d, todayStr) < 90);
  return { ...sub, lastUsedAt: todayStr, usedDates: [...kept, todayStr] };
}

export type ReviewReason =
  | { kind: 'unused'; days: number }
  | { kind: 'neverUsed' }
  | { kind: 'rarely' };

export interface ReviewCandidate {
  sub: Subscription;
  reasons: ReviewReason[];
  yearlySaving: number;
}

/** 見直し候補: 長期間「使った」の記録がない / 「ほぼ使わない」と答えた */
export function reviewCandidates(subs: Subscription[], settings: Settings, todayStr: string): ReviewCandidate[] {
  const result: ReviewCandidate[] = [];
  for (const sub of subs) {
    if (!isOn(sub, todayStr)) continue;
    const reasons: ReviewReason[] = [];
    if (sub.usage === 'rarely') reasons.push({ kind: 'rarely' });
    if (sub.lastUsedAt) {
      const days = daysBetween(sub.lastUsedAt, todayStr);
      if (days >= settings.reviewUnusedDays) reasons.push({ kind: 'unused', days });
    } else if (!sub.usage && daysBetween(sub.startDate, todayStr) >= settings.reviewUnusedDays) {
      // 「よく使う」「たまに」と答えていれば、記録がないだけでは候補にしない
      reasons.push({ kind: 'neverUsed' });
    }
    if (reasons.length) result.push({ sub, reasons, yearlySaving: yearlyAmount(sub) });
  }
  return result.sort((a, b) => b.yearlySaving - a.yearlySaving);
}

/** オン → 月額の大きい順 */
export function sortSubscriptions(subs: Subscription[], todayStr: string): Subscription[] {
  return [...subs].sort((a, b) => {
    const aa = isOn(a, todayStr) ? 0 : 1;
    const bb = isOn(b, todayStr) ? 0 : 1;
    return aa - bb || monthlyAmount(b) - monthlyAmount(a);
  });
}

/** 明細1行。サブスクは1ヶ月ならその月の請求日 (請求がなければ null = 月割り分)、複数月なら null で count に回数 */
export type LedgerItem =
  | { kind: 'expense'; date: string; amount: number; expense: Expense }
  | { kind: 'sub'; date: string | null; amount: number; sub: Subscription; count: number };

export interface CategoryGroup extends CategoryTotal {
  items: LedgerItem[];
}

const toList = (yms: string | string[]) => (Array.isArray(yms) ? yms : [yms]);

/** 期間内のサブスクの明細 (1サブスク1行にまとめる) */
function subItems(data: CalcData, yms: string[]): LedgerItem[] {
  const items: LedgerItem[] = [];
  for (const s of data.subscriptions) {
    let amount = 0;
    let count = 0;
    for (const ym of yms) {
      const a = amountInMonth(s, ym, data.settings.yearlyMode);
      amount += a;
      if (a > 0) count++;
    }
    if (amount <= 0) continue;
    const date = yms.length === 1 ? billingDateInMonth(s, yms[0]) : null;
    items.push({ kind: 'sub', date, amount, sub: s, count });
  }
  return items;
}

function toGroups(map: Map<string, LedgerItem[]>, budgetOf: (name: string) => number | undefined): CategoryGroup[] {
  return [...map.entries()]
    .map(([category, items]) => ({
      category,
      amount: items.reduce((s, i) => s + i.amount, 0),
      budget: budgetOf(category),
      items: items.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999')),
    }))
    .sort((a, b) => b.amount - a.amount);
}

/** 分類別の明細 (サブスクは1つの分類)。分類は金額の大きい順、明細は日付順 */
export function categoryBreakdown(data: CalcData, yms: string | string[]): CategoryGroup[] {
  const months = toList(yms);
  const map = new Map<string, LedgerItem[]>();
  const push = (cat: string, item: LedgerItem) => map.set(cat, [...(map.get(cat) ?? []), item]);
  for (const e of expensesInMonths(data.expenses, months)) push(e.category, { kind: 'expense', date: e.date, amount: e.amount, expense: e });
  for (const item of subItems(data, months)) push(SUBSCRIPTION_LABEL, item);
  const budgets = data.settings.budgets;
  return toGroups(map, (c) => (budgets[c] != null ? budgets[c] * months.length : undefined));
}

/** 支払い方法別の明細 (サブスクも含む)。金額の大きい順、未設定は最後 */
export function paymentBreakdown(data: CalcData, yms: string | string[]): CategoryGroup[] {
  const months = toList(yms);
  const map = new Map<string, LedgerItem[]>();
  const push = (key: string | undefined, item: LedgerItem) => {
    const k = key || NO_PAYMENT_LABEL;
    map.set(k, [...(map.get(k) ?? []), item]);
  };
  for (const e of expensesInMonths(data.expenses, months)) push(e.payment, { kind: 'expense', date: e.date, amount: e.amount, expense: e });
  for (const item of subItems(data, months)) push(item.kind === 'sub' ? item.sub.payment : undefined, item);
  const groups = toGroups(map, () => undefined);
  return [...groups.filter((g) => g.category !== NO_PAYMENT_LABEL), ...groups.filter((g) => g.category === NO_PAYMENT_LABEL)];
}

/** custom: 設定の分類の順 (サブスク・設定にない分類は後ろ) / count: 記録の回数が多い順 / amount: 金額の大きい順 */
export type GroupSort = 'custom' | 'count' | 'amount';

export function sortGroups(groups: CategoryGroup[], mode: GroupSort, order: string[]): CategoryGroup[] {
  const rank = (g: CategoryGroup) => {
    const i = order.indexOf(g.category);
    return i >= 0 ? i : g.category === SUBSCRIPTION_LABEL ? order.length + 1 : order.length;
  };
  const cmp: Record<GroupSort, (a: CategoryGroup, b: CategoryGroup) => number> = {
    custom: (a, b) => rank(a) - rank(b),
    count: (a, b) => b.items.length - a.items.length,
    amount: () => 0,
  };
  // 同じ順位のときは金額の大きい順
  return [...groups].sort((a, b) => cmp[mode](a, b) || b.amount - a.amount);
}

/** グラフの目盛り: 目安の半分きざみ (2万なら 0, 1万, 2万, …)。目盛りが多すぎるときは間隔を倍にする */
export function axisTicks(maxValue: number, target: number): number[] {
  let step = target > 0 ? target / 2 : 10000;
  const top0 = Math.max(target, maxValue * 1.08);
  while (Math.ceil(top0 / step) > 6) step *= 2;
  const top = Math.ceil(top0 / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}
