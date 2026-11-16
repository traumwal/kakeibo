import { isOn, monthlyAmount, nextBillingDate, usesInLast, yearlyAmount, type ReviewCandidate, type ReviewReason } from '../lib/calc';
import { daysBetween, today } from '../lib/date';
import { formatYen } from '../lib/format';
import type { Subscription, UsageLevel } from '../types';
import { SubIcon } from '../components/SubIcon';
import { Switch } from '../components/Switch';

export function reasonText(r: ReviewReason): string {
  switch (r.kind) {
    case 'unused': return `${r.days}日間「使った」の記録がありません`;
    case 'neverUsed': return '「使った」の記録が一度もありません';
    case 'rarely': return '「ほぼ使わない」になっています';
  }
}

const USAGE: [UsageLevel, string][] = [['often', 'よく使う'], ['sometimes', 'たまに'], ['rarely', 'ほぼ使わない']];
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
const ymd = (d: string) => `${d.slice(0, 4)}/${md(d)}`;

export function SubscriptionDetail({ sub, review, onBack, onEdit, onToggle, onDelete, onMarkUsed, onUsage }: {
  sub: Subscription;
  review?: ReviewCandidate;
  onBack: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onMarkUsed: () => void;
  onUsage: (u: UsageLevel | undefined) => void;
}) {
  const t = today();
  const on = isOn(sub, t);
  const next = nextBillingDate(sub, t);
  const uses = usesInLast(sub, t, 30);

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
      </header>

      <section className="card switch-row">
        <span className="grow">
          <b>{on ? 'オン' : 'オフ'}</b>
          <span className="sub-sub">{on ? '毎月の支出に集計しています' : `${ymd(sub.endDate!)} にオフ。翌月から集計しません`}</span>
        </span>
        <Switch on={on} onChange={onToggle} label="オン/オフ" />
      </section>

      {review && (
        <section className="card review-box serious">
          <h2>❗ 見直し候補です</h2>
          <ul className="reasons">
            {review.reasons.map((r) => <li key={r.kind}>{reasonText(r)}</li>)}
          </ul>
          <p className="saving">オフにすると年間 <b className="num">{formatYen(review.yearlySaving)}</b> 浮きます</p>
        </section>
      )}

      {on && (
        <section className="card">
          <h2>どのくらい使ってる?</h2>
          <div className="seg">
            {USAGE.map(([v, l]) => (
              <button key={v} className={sub.usage === v ? 'on' : ''} aria-pressed={sub.usage === v}
                onClick={() => onUsage(sub.usage === v ? undefined : v)}>{l}</button>
            ))}
          </div>
          <div className="usage-stats">
            <span>直近30日 <b className="num">{uses}回</b></span>
            {uses > 0 && <span>1回あたり <b className="num">{formatYen(monthlyAmount(sub) / uses)}</b></span>}
            <span>最後に使った日 <b>{sub.lastUsedAt ? (sub.lastUsedAt === t ? '今日' : `${daysBetween(sub.lastUsedAt, t)}日前`) : '記録なし'}</b></span>
          </div>
          <button className="btn primary block" onClick={onMarkUsed} disabled={sub.lastUsedAt === t}>
            {sub.lastUsedAt === t ? '今日の利用を記録しました' : '今日使った'}
          </button>
        </section>
      )}

      <section className="card">
        <dl className="facts">
          <dt>年額</dt><dd className="num">{formatYen(yearlyAmount(sub))}</dd>
          {sub.cycle === 'yearly' && (<><dt>月額換算</dt><dd className="num">{formatYen(monthlyAmount(sub))}</dd></>)}
          <dt>次回請求</dt>
          <dd>{on && next ? `${md(next)}(${next === t ? '今日' : `あと${daysBetween(t, next)}日`})` : '—'}</dd>
          <dt>支払い方法</dt><dd>{sub.payment ?? '未設定'}</dd>
          <dt>分類</dt><dd>{sub.category}</dd>
          <dt>開始日</dt><dd>{ymd(sub.startDate)}</dd>
          {sub.memo && (<><dt>メモ</dt><dd>{sub.memo}</dd></>)}
        </dl>
      </section>

      <button className="btn danger block" onClick={onDelete}>このサブスクを削除</button>
    </div>
  );
}
