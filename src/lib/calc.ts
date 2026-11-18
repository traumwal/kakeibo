import type { AppData, BillingShift, Expense, Friend, FxSettings, Period, Repayment, Settings, Subscription, YearlyMode } from '../types';
import { yenCharge } from './fx';
import { effectiveSubCategory, ESSENTIAL_SUB_CATEGORIES, UNCLASSIFIED_SUB } from './categories';
import { addMonths, clampDay, daysBetween, monthEnd, monthStart, ymOf } from './date';

export const SUBSCRIPTION_LABEL = 'サブスク・固定費';
/** サブスク・固定費以外の、記録した支出 */
export const VARIABLE_LABEL = '日々の支出';
/** 支払い方法が未設定の記録 */
export const NO_PAYMENT_LABEL = '未設定';

type CalcData = Pick<AppData, 'subscriptions' | 'expenses' | 'settings'>;

const NO_FX: FxSettings = { rates: {}, manualRate: 150, feePercent: 0 };

/** 集計の設定 (年払いの計上方法とドル円の換算) */
export type AmountOpts = { yearlyMode: YearlyMode; fx: FxSettings };
const DEFAULT_OPTS: AmountOpts = { yearlyMode: 'spread', fx: NO_FX };

/** 1回の請求の円の額。ドルは最新のレートで見込み */
export const currentYen = (sub: Subscription, fx: FxSettings = NO_FX) => yenCharge(sub, null, fx).yen;

/** 月額換算 (年払いは 12 で割る)。ドルは最新のレートで換算 */
export function monthlyAmount(sub: Subscription, fx: FxSettings = NO_FX): number {
  const yen = currentYen(sub, fx);
  return sub.cycle === 'yearly' ? yen / 12 : yen;
}

export function yearlyAmount(sub: Subscription, fx: FxSettings = NO_FX): number {
  const yen = currentYen(sub, fx);
  return sub.cycle === 'yearly' ? yen : yen * 12;
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
  let ym = ymOf(from) < ymOf(sub.startDate) ? ymOf(sub.startDate) : ymOf(from);
  for (let i = 0; i < 25; i++, ym = addMonths(ym, 1)) {
    const d = billingDatesInMonth(sub, ym).find((x) => x >= from);
    if (d) return d;
  }
  return null;
}

const sortedShifts = (sub: Subscription): BillingShift[] => [...(sub.shifts ?? [])].sort((a, b) => a.to.localeCompare(b.to));

/** 請求日をずらした記録で区切った、請求のきまり。lo より後・hi より前の日だけ、day の日に請求 (年払いは anchor の月) */
interface Segment { day: number; anchor?: string; lo?: string; hi?: string }

function segmentsOf(sub: Subscription): Segment[] {
  const segs: Segment[] = [];
  let lo: string | undefined;
  for (const s of sortedShifts(sub)) {
    segs.push({ day: s.prevDay, anchor: lo, lo, hi: s.from < s.to ? s.from : s.to });
    lo = s.to;
  }
  segs.push({ day: sub.billingDay, anchor: lo, lo });
  return segs;
}

/** その月の請求日すべて (古い順)。年払いはその期間の開始月 (ずらしたあとはずらした月) にだけ請求 */
export function billingDatesInMonth(sub: Subscription, ym: string): string[] {
  const p = periodInMonth(sub, ym);
  if (!p) return [];
  const out = new Set<string>();
  for (const s of sub.shifts ?? []) if (ymOf(s.to) === ym) out.add(s.to);
  for (const seg of segmentsOf(sub)) {
    if (sub.cycle === 'yearly') {
      const anchor = seg.anchor && seg.anchor >= p.start ? seg.anchor : p.start;
      if (anchor.slice(5, 7) !== ym.slice(5, 7)) continue;
    }
    const d = clampDay(ym, seg.day);
    if ((seg.lo && d <= seg.lo) || (seg.hi && d >= seg.hi)) continue;
    out.add(d);
  }
  return [...out].sort();
}

/** その月の請求日 (2回あるときは後のほう)。請求がなければ null */
export function billingDateInMonth(sub: Subscription, ym: string): string | null {
  const ds = billingDatesInMonth(sub, ym);
  return ds.length ? ds[ds.length - 1] : null;
}

/** 年払いで、その月が含まれる1年分の請求日 (その月以前で直近の請求。期間の最初より前なら最初の請求) */
function yearlyBillingFor(sub: Subscription, ym: string): string | null {
  const p = periodInMonth(sub, ym);
  if (!p) return null;
  const startYm = ymOf(p.start);
  for (let m = ym, i = 0; m >= startYm && i < 24; m = addMonths(m, -1), i++) {
    const d = billingDateInMonth(sub, m);
    if (d) return d;
  }
  return clampDay(startYm, sub.billingDay);
}

/** date の前後の、今の予定の請求日 (date ちょうどの予定は next) */
export function scheduledAround(sub: Subscription, date: string): { prev: string | null; next: string | null } {
  let prev: string | null = null;
  let next: string | null = null;
  const ym = ymOf(date);
  for (let i = 0; i <= 24 && (!prev || !next); i++) {
    if (!prev) prev = billingDatesInMonth(sub, addMonths(ym, -i)).filter((d) => d < date).pop() ?? null;
    if (!next) next = billingDatesInMonth(sub, addMonths(ym, i)).find((d) => d >= date) ?? null;
  }
  return { prev, next };
}

/** to に請求があったとき、どの予定の分か (近いほう) */
export function defaultShiftFrom(sub: Subscription, to: string): string | null {
  const { prev, next } = scheduledAround(sub, to);
  if (!prev || !next) return prev ?? next;
  return daysBetween(prev, to) <= daysBetween(to, next) ? prev : next;
}

/** from の予定だった請求を to にずらす。以後は to の日を請求日にする */
export function shiftBilling(sub: Subscription, from: string, to: string): Subscription {
  if (from === to) return sub;
  return { ...sub, billingDay: Number(to.slice(8, 10)), shifts: [...sortedShifts(sub), { from, to, prevDay: sub.billingDay }] };
}

/** 最初に払った日 (今の期間の、最初の請求日)。ずらした記録があれば、ずらす前の請求日で数える */
export function firstPayDate(sub: Subscription): string {
  return clampDay(ymOf(sub.startDate), sortedShifts(sub)[0]?.prevDay ?? sub.billingDay);
}

/** 開始日を最初に払った日にそろえる (以前は開始日と請求日を別々に入れていたため) */
export function alignStartDate(sub: Subscription): Subscription {
  if (typeof sub.startDate !== 'string' || typeof sub.billingDay !== 'number') return sub;
  const first = firstPayDate(sub);
  return first === sub.startDate ? sub : { ...sub, startDate: first };
}

/** 最後にずらしたのを取り消す */
export function undoLastShift(sub: Subscription): Subscription {
  const shifts = sortedShifts(sub);
  const last = shifts.pop();
  if (!last) return sub;
  return { ...sub, billingDay: last.prevDay, shifts: shifts.length ? shifts : undefined };
}

/** その月に計上する円の額。年払いは設定に応じて 月割り(÷12) か 請求月にまとめて。ドルは請求日のレートで換算 */
export function amountInMonth(sub: Subscription, ym: string, opts: AmountOpts = DEFAULT_OPTS): number {
  if (!isActiveInMonth(sub, ym)) return 0;
  if (sub.cycle === 'yearly' && opts.yearlyMode === 'spread') {
    return yenCharge(sub, yearlyBillingFor(sub, ym), opts.fx).yen / 12;
  }
  return billingDatesInMonth(sub, ym).reduce((sum, d) => sum + yenCharge(sub, d, opts.fx).yen, 0);
}

export function subscriptionTotalForMonth(subs: Subscription[], ym: string, opts: AmountOpts = DEFAULT_OPTS): number {
  return subs.reduce((sum, s) => sum + amountInMonth(s, ym, opts), 0);
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
  const subscriptions = subscriptionTotalForMonth(data.subscriptions, ym, data.settings);
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
  /** そのうちサブスク・固定費の分 (定期券なら「交通」の中の固定分) */
  fixed: number;
  budget?: number;
}

/** 集計でサブスクを入れる分類。分類を選んでいないものは名前から推測し (定期券 → 交通)、わからなければ「サブスク・固定費」にまとめる */
export function subGroupOf(sub: Subscription): string {
  const c = effectiveSubCategory(sub);
  return c === UNCLASSIFIED_SUB ? SUBSCRIPTION_LABEL : c;
}

/** 分類別合計 (サブスクは選んだ分類に入れる。定期券なら「交通」)。金額の大きい順。複数月なら予算も月数倍 */
export function categoryTotals(data: CalcData, yms: string | string[]): CategoryTotal[] {
  return categoryBreakdown(data, yms).map(({ category, amount, fixed, budget }) => ({ category, amount, fixed, budget }));
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
    } else if (!sub.usage && !ESSENTIAL_SUB_CATEGORIES.includes(effectiveSubCategory(sub)) && daysBetween(sub.startDate, todayStr) >= settings.reviewUnusedDays) {
      // 「よく使う」「たまに」と答えていれば、記録がないだけでは候補にしない。定期券・家賃なども記録がないだけでは候補にしない
      reasons.push({ kind: 'neverUsed' });
    }
    if (reasons.length) result.push({ sub, reasons, yearlySaving: yearlyAmount(sub, settings.fx) });
  }
  return result.sort((a, b) => b.yearlySaving - a.yearlySaving);
}

/** オン → 月額の大きい順 */
export function sortSubscriptions(subs: Subscription[], todayStr: string, fx: FxSettings = NO_FX): Subscription[] {
  return [...subs].sort((a, b) => {
    const aa = isOn(a, todayStr) ? 0 : 1;
    const bb = isOn(b, todayStr) ? 0 : 1;
    return aa - bb || monthlyAmount(b, fx) - monthlyAmount(a, fx);
  });
}

/** 明細1行。サブスクは1ヶ月ならその月の請求日 (請求がなければ null = 月割り分)、複数月なら null で count に回数 */
export type LedgerItem =
  | { kind: 'expense'; date: string; amount: number; expense: Expense }
  | { kind: 'sub'; date: string | null; amount: number; sub: Subscription; count: number; estimate?: boolean };

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
    let estimate = false;
    for (const ym of yms) {
      const a = amountInMonth(s, ym, data.settings);
      amount += a;
      if (a > 0) count++;
      if (a > 0 && s.currency === 'USD') {
        const d = s.cycle === 'yearly' && data.settings.yearlyMode === 'spread' ? yearlyBillingFor(s, ym) : billingDateInMonth(s, ym);
        if (yenCharge(s, d, data.settings.fx).estimate) estimate = true;
      }
    }
    if (amount <= 0) continue;
    const date = yms.length === 1 ? billingDateInMonth(s, yms[0]) : null;
    items.push({ kind: 'sub', date, amount, sub: s, count, estimate });
  }
  return items;
}

function toGroups(map: Map<string, LedgerItem[]>, budgetOf: (name: string) => number | undefined): CategoryGroup[] {
  return [...map.entries()]
    .map(([category, items]) => ({
      category,
      amount: items.reduce((s, i) => s + i.amount, 0),
      fixed: items.reduce((s, i) => s + (i.kind === 'sub' ? i.amount : 0), 0),
      budget: budgetOf(category),
      items: items.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999')),
    }))
    .sort((a, b) => b.amount - a.amount);
}

/** 分類別の明細 (サブスクは選んだ分類に入る。未分類は「サブスク・固定費」)。分類は金額の大きい順、明細は日付順 */
export function categoryBreakdown(data: CalcData, yms: string | string[]): CategoryGroup[] {
  const months = toList(yms);
  const map = new Map<string, LedgerItem[]>();
  const push = (cat: string, item: LedgerItem) => map.set(cat, [...(map.get(cat) ?? []), item]);
  for (const e of expensesInMonths(data.expenses, months)) push(e.category, { kind: 'expense', date: e.date, amount: e.amount, expense: e });
  for (const item of subItems(data, months)) push(item.kind === 'sub' ? subGroupOf(item.sub) : SUBSCRIPTION_LABEL, item);
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

/** 設定の分類の順に並べる (設定にない分類はその後ろ、サブスク・固定費は最後。同じ順位のときは金額の大きい順) */
export function sortGroups(groups: CategoryGroup[], order: string[]): CategoryGroup[] {
  const rank = (g: CategoryGroup) => {
    const i = order.indexOf(g.category);
    return i >= 0 ? i : g.category === SUBSCRIPTION_LABEL ? order.length + 1 : order.length;
  };
  return [...groups].sort((a, b) => rank(a) - rank(b) || b.amount - a.amount);
}

/** グラフの目盛り: 目安の半分きざみ (2万なら 0, 1万, 2万, …)。目盛りが多すぎるときは間隔を倍にする */
export function axisTicks(maxValue: number, target: number): number[] {
  let step = target > 0 ? target / 2 : 10000;
  const top0 = Math.max(target, maxValue * 1.08);
  while (Math.ceil(top0 / step) > 6) step *= 2;
  const top = Math.ceil(top0 / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/** 今日までの請求日すべて (古い順)。ドルのレートを取りに行く日を決めるのに使う */
export function billingDatesUntil(sub: Subscription, todayStr: string): string[] {
  const first = ymOf([...(sub.history ?? []).map((p) => p.start), sub.startDate].sort()[0]);
  const out: string[] = [];
  for (let ym = first; ym <= ymOf(todayStr); ym = addMonths(ym, 1)) {
    for (const d of billingDatesInMonth(sub, ym)) if (d <= todayStr) out.push(d);
  }
  return out;
}
