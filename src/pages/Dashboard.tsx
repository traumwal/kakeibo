import { useStore } from '../hooks/useStore';
import { categoryTotals, friendBalances, monthSummary, monthlyTrend, monthsOfYear, reviewCandidates, sumSummaries, SUBSCRIPTION_LABEL, VARIABLE_LABEL, yearTrend } from '../lib/calc';
import { addMonths, daysBetween, today, ymOf } from '../lib/date';
import { formatYen } from '../lib/format';
import { CategoryBars, TrendChart } from '../components/Charts';
import { PeriodNav, usePeriod } from '../components/PeriodNav';
import type { Tab } from '../App';
import { upcomingWithdrawals } from '../lib/card';
import { isUsd, yenCharge } from '../lib/fx';
import { billingDatesUntil } from '../lib/calc';
import type { PayDraft } from '../lib/quickadd';

const isOnNow = (s: { endDate?: string }) => !s.endDate || s.endDate > today();

const hm = (d: Date) => d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function Dashboard({ go, onAdd, onOpenPay }: { go: (t: Tab) => void; onAdd: () => void; onOpenPay: (d: PayDraft) => void }) {
  const { data, cloud } = useStore();
  const inbox = cloud.inbox;
  const [period, actions] = usePeriod();
  const nowYm = ymOf(today());
  const target = data.settings.monthlyTarget;
  const isMonth = period.kind === 'month';

  const cur = sumSummaries(period.months.map((ym) => monthSummary(data, ym)));
  // 年表示は前年の同じ期間 (今年が11月までなら前年も11月まで) と比べる
  const prevMonths = isMonth ? [addMonths(period.ym, -1)] : monthsOfYear(period.year - 1, nowYm).slice(0, period.months.length || 12);
  const prev = sumSummaries(prevMonths.map((ym) => monthSummary(data, ym)));
  const diff = cur.total - prev.total;
  const monthCount = Math.max(1, period.months.length);
  const avg = cur.total / monthCount;
  const targetTotal = target * monthCount;

  const balances = friendBalances(data.friends, data.expenses, data.repayments);
  const owe = balances.filter((b) => b.balance < 0).reduce((s, b) => s - b.balance, 0);
  const lent = balances.filter((b) => b.balance > 0).reduce((s, b) => s + b.balance, 0);
  const reviews = reviewCandidates(data.subscriptions, data.settings, today());
  const upcoming = upcomingWithdrawals(data, today());
  // ドルのサブスクで、この2週間に請求があり、まだ明細の額を入れていないもの
  const toConfirm = data.subscriptions.filter((s) => isUsd(s) && isOnNow(s)).flatMap((s) =>
    billingDatesUntil(s, today())
      .filter((d) => daysBetween(d, today()) <= 14 && s.actuals?.[d.slice(0, 7)] == null)
      .map((d) => ({ sub: s, date: d, yen: yenCharge(s, d, data.settings.fx).yen })));

  return (
    <div className="page">
      <PeriodNav period={period} actions={actions} />

      {inbox.length > 0 && (
        <section className="card">
          <h2>Apple Pay の支払い(未記録 {inbox.length}件)</h2>
          <ul className="list">
            {inbox.map((p) => (
              <li key={p.inboxId} className="row clickable" onClick={() => onOpenPay(p)}>
                <span className="grow">
                  <b>{p.shop ?? 'お店の名前なし'}</b>
                  <span className="sub-sub">{hm(p.at)}{p.card && ` · ${p.card}`}</span>
                </span>
                <b className="num">{formatYen(p.amount ?? 0)}</b>
                <button
                  className="icon-btn"
                  aria-label="記録しないで消す"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('この支払いを記録しないで消しますか?')) cloud.removeInbox(p.inboxId);
                  }}
                >×</button>
              </li>
            ))}
          </ul>
          <p className="note">タップすると入力済みの記録画面が開きます。保存すると、ここから消えます</p>
        </section>
      )}

      <section className="card hero">
        <div className="label">{isMonth ? '今月の支出合計' : `${period.year}年の支出合計`}</div>
        <div className="big num">{formatYen(cur.total)}</div>
        <div className={diff > 0 ? 'delta up' : 'delta down'}>
          {isMonth ? '前月比' : '前年同期比'} {diff >= 0 ? '+' : '−'}{formatYen(Math.abs(diff))}
        </div>
        {target > 0 && (
          <div className="target-line">
            {isMonth
              ? cur.total <= target
                ? <>目安 {formatYen(target)} まであと <b className="num">{formatYen(target - cur.total)}</b></>
                : <span className="over">目安 {formatYen(target)} を <b className="num">{formatYen(cur.total - target)}</b> 超えています</span>
              : <>月平均 <b className={avg > target ? 'num over' : 'num'}>{formatYen(avg)}</b>(目安 {formatYen(target)})</>}
            <div className="hbar-track">
              <div className={cur.total > targetTotal ? 'hbar-fill over' : 'hbar-fill'} style={{ width: `${Math.min(100, (cur.total / targetTotal) * 100)}%` }} />
            </div>
          </div>
        )}
        <div className="split">
          <div><span className="dot c1" />{SUBSCRIPTION_LABEL} <b className="num">{formatYen(cur.subscriptions)}</b></div>
          <div><span className="dot c2" />{VARIABLE_LABEL} <b className="num">{formatYen(cur.expenses)}</b></div>
        </div>
      </section>

      {(owe > 0 || lent > 0 || reviews.length > 0) && (
        <section className="tiles">
          {owe > 0 && (
            <button className="tile warn" onClick={() => go('friends')}>
              <span className="label">友達に借りている</span>
              <span className="num">{formatYen(owe)}</span>
            </button>
          )}
          {lent > 0 && (
            <button className="tile" onClick={() => go('friends')}>
              <span className="label">友達に貸している</span>
              <span className="num">{formatYen(lent)}</span>
            </button>
          )}
          {reviews.length > 0 && (
            <button className="tile warn" onClick={() => go('subs')}>
              <span className="label">見直し候補のサブスク</span>
              <span className="num">{reviews.length}件</span>
            </button>
          )}
        </section>
      )}

      {toConfirm.length > 0 && (
        <section className="card">
          <h2>ドルの請求額を確認</h2>
          <ul className="list">
            {toConfirm.map(({ sub, date, yen }) => (
              <li key={sub.id + date} className="row clickable" onClick={() => go('subs')}>
                <span className="grow">
                  <b>{sub.name}</b>
                  <span className="sub-sub">{Number(date.slice(5, 7))}/{Number(date.slice(8))} 請求 · ${sub.amount}</span>
                </span>
                <span className="num">約{formatYen(yen)}</span>
              </li>
            ))}
          </ul>
          <p className="note">カードの明細が来たら、サブスクの詳細画面で実際の額に直せます(直さなければ自動の換算のまま)</p>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="card">
          <h2>次の引き落とし</h2>
          <ul className="list">
            {upcoming.map((u) => {
              const days = daysBetween(today(), u.payDate);
              return (
                <li key={u.card} className="row clickable" onClick={() => go('expenses')}>
                  <span className="grow">
                    <b>{u.card}</b>
                    <span className="sub-sub">
                      {Number(u.payDate.slice(5, 7))}/{Number(u.payDate.slice(8))}({days === 0 ? '今日' : `あと${days}日`})
                      {u.open && <span className="chip estimate">見込み</span>}
                    </span>
                  </span>
                  <b className="num">{formatYen(u.amount)}</b>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>カテゴリ別</h2>
        <CategoryBars data={categoryTotals(data, period.months)} />
      </section>

      <section className="card">
        <h2>推移</h2>
        <TrendChart data={isMonth ? monthlyTrend(data, period.ym, 6) : yearTrend(data, period.year, nowYm)} target={target} />
      </section>
      <button className="fab" onClick={onAdd} aria-label="支出を記録">+</button>
    </div>
  );
}
