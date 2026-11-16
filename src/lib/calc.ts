import type { AppData, Expense, Friend, Repayment, Settings, Subscription } from '../types';
import { addMonths, clampDay, daysBetween, monthEnd, monthStart, ymOf } from './date';

export const SUBSCRIPTION_LABEL = 'サブスク・固定費';

/** 月額換算 (年払いは 12 で割る) */
export function monthlyAmount(sub: Subscription): number {
  return sub.cycle === 'yearly' ? sub.amount / 12 : sub.amount;
}

export function yearlyAmount(sub: Subscription): number {
  return sub.cycle === 'yearly' ? sub.amount : sub.amount * 12;
}

/** 指定月に契約が有効か (開始日〜解約日の間に月がかかっているか) */
export function isActiveInMonth(sub: Subscription, ym: string): boolean {
  if (sub.startDate > monthEnd(ym)) return false;
  if (sub.endDate && sub.endDate < monthStart(ym)) return false;
  return true;
}

export function isActiveOn(sub: Subscription, date: string): boolean {
  return sub.startDate <= date && (!sub.endDate || sub.endDate >= date);
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

export function subscriptionTotalForMonth(subs: Subscription[], ym: string): number {
  return subs.filter((s) => isActiveInMonth(s, ym)).reduce((sum, s) => sum + monthlyAmount(s), 0);
}

export function expensesInMonth(expenses: Expense[], ym: string): Expense[] {
  return expenses.filter((e) => ymOf(e.date) === ym);
}

export interface MonthSummary {
  ym: string;
  subscriptions: number;
  expenses: number;
  total: number;
}

export function monthSummary(data: Pick<AppData, 'subscriptions' | 'expenses'>, ym: string): MonthSummary {
  const subscriptions = subscriptionTotalForMonth(data.subscriptions, ym);
  const expenses = expensesInMonth(data.expenses, ym).reduce((s, e) => s + e.amount, 0);
  return { ym, subscriptions, expenses, total: subscriptions + expenses };
}

/** 直近 n ヶ月の推移 (古い順) */
export function monthlyTrend(data: Pick<AppData, 'subscriptions' | 'expenses'>, endYm: string, n: number): MonthSummary[] {
  return Array.from({ length: n }, (_, i) => monthSummary(data, addMonths(endYm, i - n + 1)));
}

export interface CategoryTotal {
  category: string;
  amount: number;
  budget?: number;
}

/** カテゴリ別合計 (サブスクは1つの棒にまとめる)。金額の大きい順 */
export function categoryTotals(data: AppData, ym: string): CategoryTotal[] {
  const map = new Map<string, number>();
  for (const e of expensesInMonth(data.expenses, ym)) {
    map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
  }
  const subs = subscriptionTotalForMonth(data.subscriptions, ym);
  if (subs > 0) map.set(SUBSCRIPTION_LABEL, (map.get(SUBSCRIPTION_LABEL) ?? 0) + subs);
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount, budget: data.settings.budgets[category] }))
    .sort((a, b) => b.amount - a.amount);
}

/** 1時間あたりのコスト。利用時間が未入力なら null、0 時間なら Infinity */
export function costPerHour(sub: Subscription): number | null {
  if (sub.usageHoursPerMonth == null) return null;
  if (sub.usageHoursPerMonth <= 0) return Infinity;
  return monthlyAmount(sub) / sub.usageHoursPerMonth;
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

export type ReviewReason =
  | { kind: 'unused'; days: number }
  | { kind: 'neverUsed' }
  | { kind: 'costly'; costPerHour: number }
  | { kind: 'noUsage' };

export interface ReviewCandidate {
  sub: Subscription;
  reasons: ReviewReason[];
  yearlySaving: number;
}

/** 見直し候補: 長期間未使用 / 1時間あたりが高い / 利用時間が未入力 */
export function reviewCandidates(subs: Subscription[], settings: Settings, todayStr: string): ReviewCandidate[] {
  const result: ReviewCandidate[] = [];
  for (const sub of subs) {
    if (!isActiveOn(sub, todayStr)) continue;
    const reasons: ReviewReason[] = [];
    if (sub.lastUsedAt) {
      const days = daysBetween(sub.lastUsedAt, todayStr);
      if (days >= settings.reviewUnusedDays) reasons.push({ kind: 'unused', days });
    } else if (daysBetween(sub.startDate, todayStr) >= settings.reviewUnusedDays) {
      reasons.push({ kind: 'neverUsed' });
    }
    const cph = costPerHour(sub);
    if (cph == null) reasons.push({ kind: 'noUsage' });
    else if (cph > settings.reviewCostPerHour) reasons.push({ kind: 'costly', costPerHour: cph });
    if (reasons.length) result.push({ sub, reasons, yearlySaving: yearlyAmount(sub) });
  }
  // 深刻な理由 (未使用・高コスト) を優先し、節約額の大きい順
  const severity = (c: ReviewCandidate) => (c.reasons.some((r) => r.kind !== 'noUsage') ? 1 : 0);
  return result.sort((a, b) => severity(b) - severity(a) || b.yearlySaving - a.yearlySaving);
}

/** 解約日を含めて表示用にソート: 継続中 → 月額の大きい順 */
export function sortSubscriptions(subs: Subscription[], todayStr: string): Subscription[] {
  return [...subs].sort((a, b) => {
    const aa = isActiveOn(a, todayStr) ? 0 : 1;
    const bb = isActiveOn(b, todayStr) ? 0 : 1;
    return aa - bb || monthlyAmount(b) - monthlyAmount(a);
  });
}


/** 分類別の明細1行。サブスクは今月の請求日 (年払いで今月請求がなければ null = 月割り分) */
export type LedgerItem =
  | { kind: 'expense'; date: string; amount: number; expense: Expense }
  | { kind: 'sub'; date: string | null; amount: number; sub: Subscription };

export interface CategoryGroup extends CategoryTotal {
  items: LedgerItem[];
}

/** その月の請求日。年払いは開始月にだけ請求 */
export function billingDateInMonth(sub: Subscription, ym: string): string | null {
  if (!isActiveInMonth(sub, ym)) return null;
  if (sub.cycle === 'yearly' && sub.startDate.slice(5, 7) !== ym.slice(5, 7)) return null;
  return clampDay(ym, sub.billingDay);
}

/** 分類別の明細。金額は categoryTotals と同じ (サブスクは1つの分類・月額換算)。分類は金額の大きい順、明細は日付順 */
export function categoryBreakdown(data: AppData, ym: string): CategoryGroup[] {
  const map = new Map<string, LedgerItem[]>();
  const push = (cat: string, item: LedgerItem) => map.set(cat, [...(map.get(cat) ?? []), item]);
  for (const e of expensesInMonth(data.expenses, ym)) push(e.category, { kind: 'expense', date: e.date, amount: e.amount, expense: e });
  for (const s of data.subscriptions.filter((x) => isActiveInMonth(x, ym))) {
    push(SUBSCRIPTION_LABEL, { kind: 'sub', date: billingDateInMonth(s, ym), amount: monthlyAmount(s), sub: s });
  }
  return [...map.entries()]
    .map(([category, items]) => ({
      category,
      amount: items.reduce((s, i) => s + i.amount, 0),
      budget: data.settings.budgets[category],
      items: items.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999')),
    }))
    .sort((a, b) => b.amount - a.amount);
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
