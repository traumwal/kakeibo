import type { CardRule, Subscription } from '../types';
import { billingDateInMonth, type LedgerItem } from './calc';
import { addMonths, clampDay, ymOf } from './date';
import type { AppData } from '../types';

type CardData = Pick<AppData, 'subscriptions' | 'expenses' | 'settings'>;

/** その利用日が入る締め日 (締め日を過ぎていたら翌月の締め日) */
export function closingDateFor(rule: CardRule, chargeDate: string): string {
  const ym = ymOf(chargeDate);
  const close = clampDay(ym, rule.closingDay);
  return chargeDate <= close ? close : clampDay(addMonths(ym, 1), rule.closingDay);
}

/** その利用分が引き落とされる日 */
export function withdrawalDate(rule: CardRule, chargeDate: string): string {
  const close = closingDateFor(rule, chargeDate);
  return clampDay(addMonths(ymOf(close), rule.payMonths), rule.payDay);
}

/** サブスクの実際の請求 (年払いは請求月に全額)。月割りの設定とは関係なく、カードに請求される額 */
function subCharges(sub: Subscription, yms: string[]): LedgerItem[] {
  const out: LedgerItem[] = [];
  for (const ym of yms) {
    const date = billingDateInMonth(sub, ym);
    if (date) out.push({ kind: 'sub', date, amount: sub.amount, sub, count: 1 });
  }
  return out;
}

/** カードに請求される利用。友達が立て替えた分は除き、自分が立て替えた分はお会計の合計で数える */
function cardCharges(data: CardData, card: string, yms: string[]): LedgerItem[] {
  const set = new Set(yms);
  const items: LedgerItem[] = [];
  for (const e of data.expenses) {
    if (e.payment !== card || !set.has(ymOf(e.date))) continue;
    if (e.settlements?.some((s) => s.type === 'friendPaid')) continue;
    const iPaid = e.settlements?.some((s) => s.type === 'iPaid');
    items.push({ kind: 'expense', date: e.date, amount: iPaid ? e.total ?? e.amount : e.amount, expense: e });
  }
  for (const s of data.subscriptions) if (s.payment === card) items.push(...subCharges(s, yms));
  return items;
}

export interface Statement {
  card: string;
  payDate: string;
  closeDate: string;
  amount: number;
  items: LedgerItem[];
  /** まだ締め日前 (これから増える見込み) */
  open: boolean;
}

/** 指定した月に引き落とされる明細 (締め日・支払日を設定したカードのみ)。引き落とし日順 */
export function statements(data: CardData, payYms: string[], todayStr: string): Statement[] {
  const result: Statement[] = [];
  const rules = data.settings.cardRules ?? {};
  for (const card of data.settings.paymentMethods) {
    const rule = rules[card];
    if (!rule || payYms.length === 0) continue;
    // 引き落とし月の (payMonths + 1) ヶ月前までの利用が対象になりうる
    const first = addMonths(payYms[0], -(rule.payMonths + 1));
    const last = payYms[payYms.length - 1];
    const yms: string[] = [];
    for (let ym = first; ym <= last; ym = addMonths(ym, 1)) yms.push(ym);
    const byPay = new Map<string, LedgerItem[]>();
    for (const item of cardCharges(data, card, yms)) {
      const pay = withdrawalDate(rule, item.date!);
      if (!payYms.includes(ymOf(pay))) continue;
      byPay.set(pay, [...(byPay.get(pay) ?? []), item]);
    }
    for (const [payDate, items] of byPay) {
      const closeDate = closingDateFor(rule, items[0].date!);
      result.push({
        card,
        payDate,
        closeDate,
        amount: items.reduce((s, i) => s + i.amount, 0),
        items: items.sort((a, b) => a.date!.localeCompare(b.date!)),
        open: closeDate >= todayStr,
      });
    }
  }
  return result.sort((a, b) => a.payDate.localeCompare(b.payDate) || b.amount - a.amount);
}

/** カードごとの次回の引き落とし (今日以降で最初のもの) */
export function upcomingWithdrawals(data: CardData, todayStr: string): Statement[] {
  const ym = ymOf(todayStr);
  const list = statements(data, [ym, addMonths(ym, 1), addMonths(ym, 2), addMonths(ym, 3)], todayStr);
  const seen = new Set<string>();
  return list.filter((s) => {
    if (s.payDate < todayStr || seen.has(s.card)) return false;
    seen.add(s.card);
    return true;
  });
}

/** 表示用: 「末日」「15日」 */
export const dayLabel = (d: number) => (d >= 31 ? '末日' : `${d}日`);
export const ruleLabel = (r: CardRule) => `${dayLabel(r.closingDay)}締め・${r.payMonths === 1 ? '翌月' : '翌々月'}${dayLabel(r.payDay)}払い`;
