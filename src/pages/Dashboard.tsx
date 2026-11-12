import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { categoryTotals, friendBalances, monthSummary, monthlyTrend, reviewCandidates } from '../lib/calc';
import { addMonths, formatYm, today, ymOf } from '../lib/date';
import { formatYen } from '../lib/format';
import { CategoryBars, TrendChart } from '../components/Charts';
import type { Tab } from '../App';

export function Dashboard({ go }: { go: (t: Tab) => void }) {
  const { data } = useStore();
  const [ym, setYm] = useState(ymOf(today()));
  const cur = monthSummary(data, ym);
  const prev = monthSummary(data, addMonths(ym, -1));
  const diff = cur.total - prev.total;
  const balances = friendBalances(data.friends, data.expenses, data.repayments);
  const owe = balances.filter((b) => b.balance < 0).reduce((s, b) => s - b.balance, 0);
  const lent = balances.filter((b) => b.balance > 0).reduce((s, b) => s + b.balance, 0);
  const reviews = reviewCandidates(data.subscriptions, data.settings, today()).filter((c) => c.reasons.some((r) => r.kind !== 'noUsage'));

  return (
    <div className="page">
      <div className="month-nav">
        <button className="icon-btn" onClick={() => setYm(addMonths(ym, -1))} aria-label="前の月">‹</button>
        <h1>{formatYm(ym)}</h1>
        <button className="icon-btn" onClick={() => setYm(addMonths(ym, 1))} aria-label="次の月">›</button>
      </div>

      <section className="card hero">
        <div className="label">今月の支出合計</div>
        <div className="big num">{formatYen(cur.total)}</div>
        <div className={diff > 0 ? 'delta up' : 'delta down'}>
          前月比 {diff >= 0 ? '+' : '−'}{formatYen(Math.abs(diff))}
        </div>
        <div className="split">
          <div><span className="dot c1" />サブスク・固定費 <b className="num">{formatYen(cur.subscriptions)}</b></div>
          <div><span className="dot c2" />単発支出 <b className="num">{formatYen(cur.expenses)}</b></div>
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

      <section className="card">
        <h2>カテゴリ別</h2>
        <CategoryBars data={categoryTotals(data, ym)} />
      </section>

      <section className="card">
        <h2>月別推移(直近6ヶ月)</h2>
        <TrendChart data={monthlyTrend(data, ym, 6)} />
        <p className="note">年払いのサブスクは月額に換算(÷12)して表示しています</p>
      </section>
    </div>
  );
}
