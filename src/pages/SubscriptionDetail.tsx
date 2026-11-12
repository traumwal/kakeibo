import { costPerHour, isActiveOn, monthlyAmount, nextBillingDate, yearlyAmount, type ReviewCandidate, type ReviewReason } from '../lib/calc';
import { daysBetween, today } from '../lib/date';
import { formatYen } from '../lib/format';
import type { Subscription } from '../types';
import { SubIcon } from '../components/SubIcon';

export function reasonText(r: ReviewReason): string {
  switch (r.kind) {
    case 'unused': return `${r.days}日間使っていません`;
    case 'neverUsed': return '「使った」の記録が一度もありません';
    case 'costly': return `1時間あたり ${formatYen(r.costPerHour)} とコストが高めです`;
    case 'noUsage': return '月の利用時間が未入力です';
  }
}

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
const ymd = (d: string) => `${d.slice(0, 4)}/${md(d)}`;

export function SubscriptionDetail({ sub, review, onBack, onEdit, onMarkUsed }: {
  sub: Subscription;
  review?: ReviewCandidate;
  onBack: () => void;
  onEdit: () => void;
  onMarkUsed: () => void;
}) {
  const t = today();
  const on = isActiveOn(sub, t);
  const next = nextBillingDate(sub, t);
  const cph = costPerHour(sub);
  const serious = review?.reasons.some((r) => r.kind !== 'noUsage');

  return (
    <div className="page">
      <div className="detail-nav">
        <button className="link back" onClick={onBack}>‹ サブスク一覧</button>
        <button className="link" onClick={onEdit}>編集</button>
      </div>

      <header className="detail-head">
        <SubIcon name={sub.name} domain={sub.domain} size={72} />
        <h1>{sub.name}</h1>
        <div className="sub-price num">
          {formatYen(sub.amount)}<small>/{sub.cycle === 'monthly' ? '月' : '年'}</small>
        </div>
        {!on && <span className="chip">解約済み</span>}
      </header>

      {review && (
        <section className={serious ? 'card review-box serious' : 'card review-box'}>
          <h2>{serious ? '❗ 見直し候補です' : 'ひとこと'}</h2>
          <ul className="reasons">
            {review.reasons.map((r) => <li key={r.kind}>{reasonText(r)}</li>)}
          </ul>
          {serious && <p className="saving">解約すると年間 <b className="num">{formatYen(review.yearlySaving)}</b> 浮きます</p>}
        </section>
      )}

      <section className="card">
        <dl className="facts">
          <dt>年額</dt><dd className="num">{formatYen(yearlyAmount(sub))}</dd>
          {sub.cycle === 'yearly' && (<><dt>月額換算</dt><dd className="num">{formatYen(monthlyAmount(sub))}</dd></>)}
          <dt>次回請求</dt>
          <dd>{on && next ? `${md(next)}(${next === t ? '今日' : `あと${daysBetween(t, next)}日`})` : '—'}</dd>
          <dt>1時間あたり</dt>
          <dd className="num">
            {cph == null ? '未入力' : cph === Infinity ? '利用0時間' : formatYen(cph)}
            {sub.usageHoursPerMonth != null && <small>(月{sub.usageHoursPerMonth}時間)</small>}
          </dd>
          <dt>最後に使った日</dt>
          <dd>{sub.lastUsedAt ? `${md(sub.lastUsedAt)}(${sub.lastUsedAt === t ? '今日' : `${daysBetween(sub.lastUsedAt, t)}日前`})` : '記録なし'}</dd>
          <dt>分類</dt><dd>{sub.category}</dd>
          <dt>開始日</dt><dd>{ymd(sub.startDate)}</dd>
          {sub.endDate && (<><dt>解約日</dt><dd>{ymd(sub.endDate)}</dd></>)}
          {sub.memo && (<><dt>メモ</dt><dd>{sub.memo}</dd></>)}
        </dl>
      </section>

      {on && (
        <button className="btn primary block" onClick={onMarkUsed} disabled={sub.lastUsedAt === t}>
          {sub.lastUsedAt === t ? '今日の利用を記録しました' : '今日使った'}
        </button>
      )}
    </div>
  );
}
