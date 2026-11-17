import { effectiveSubCategory, isAutoSubCategory, subCategoryLabel } from '../lib/categories';
import { useState } from 'react';
import { billingDateInMonth, currentYen, isOn, monthlyAmount, nextBillingDate, usesInLast, yearlyAmount, type ReviewCandidate, type ReviewReason } from '../lib/calc';
import { isUsd, recentMonths, yenCharge } from '../lib/fx';
import { SubPrice, formatUsd } from '../components/Money';
import { daysBetween, today } from '../lib/date';
import { formatYen } from '../lib/format';
import type { FxSettings, Subscription, UsageLevel } from '../types';
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

export function SubscriptionDetail({ sub, review, onBack, onEdit, onToggle, onDelete, onMarkUsed, onUsage, fx, onActual }: {
  sub: Subscription;
  review?: ReviewCandidate;
  onBack: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onMarkUsed: () => void;
  onUsage: (u: UsageLevel | undefined) => void;
  fx: FxSettings;
  onActual: (ym: string, yen: number | null) => void;
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
        <SubPrice sub={sub} yen={currentYen(sub, fx)} className="sub-price num" />
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
            {uses > 0 && <span>1回あたり <b className="num">{formatYen(monthlyAmount(sub, fx) / uses)}</b></span>}
            <span>最後に使った日 <b>{sub.lastUsedAt ? (sub.lastUsedAt === t ? '今日' : `${daysBetween(sub.lastUsedAt, t)}日前`) : '記録なし'}</b></span>
          </div>
          <button className="btn primary block" onClick={onMarkUsed} disabled={sub.lastUsedAt === t}>
            {sub.lastUsedAt === t ? '今日の利用を記録しました' : '今日使った'}
          </button>
        </section>
      )}

      {isUsd(sub) && <UsdCharges sub={sub} fx={fx} onActual={onActual} />}

      <section className="card">
        <dl className="facts">
          <dt>年額</dt><dd className="num">{isUsd(sub) && '約'}{formatYen(yearlyAmount(sub, fx))}</dd>
          {sub.cycle === 'yearly' && (<><dt>月額換算</dt><dd className="num">{formatYen(monthlyAmount(sub, fx))}</dd></>)}
          <dt>次回請求</dt>
          <dd>{on && next ? `${md(next)}(${next === t ? '今日' : `あと${daysBetween(t, next)}日`})` : '—'}</dd>
          <dt>支払い方法</dt><dd>{sub.payment ?? '未設定'}</dd>
          <dt>分類</dt><dd>{subCategoryLabel(effectiveSubCategory(sub))}{isAutoSubCategory(sub) && <small className="muted">(名前から自動)</small>}</dd>
          <dt>開始日</dt><dd>{ymd(sub.startDate)}</dd>
          {sub.memo && (<><dt>メモ</dt><dd>{sub.memo}</dd></>)}
        </dl>
      </section>

      <button className="btn danger block" onClick={onDelete}>このサブスクを削除</button>
    </div>
  );
}

/** ドルのサブスクの、請求ごとの円の額。今日までの請求はカードの明細の額で上書きできる */
function UsdCharges({ sub, fx, onActual }: { sub: Subscription; fx: FxSettings; onActual: (ym: string, yen: number | null) => void }) {
  const t = today();
  const rows = recentMonths(t, sub.cycle === 'yearly' ? 12 : 5, sub.cycle === 'yearly' ? 12 : 1)
    .map((ym) => ({ ym, date: billingDateInMonth(sub, ym) }))
    .filter((r): r is { ym: string; date: string } => r.date != null)
    .reverse();
  if (rows.length === 0) return null;
  return (
    <section className="card">
      <h2>請求ごとの円の額</h2>
      <ul className="list charges">
        {rows.map(({ ym, date }) => {
          const c = yenCharge(sub, date, fx);
          const auto = yenCharge({ ...sub, actuals: undefined }, date, fx);
          const future = date > t;
          return (
            <li key={ym} className="row">
              <span className="grow">
                <b>{ymd(date)}</b>{future && <span className="chip estimate">予定</span>}
                <span className="sub-sub">
                  {c.actual
                    ? `明細の額(自動の換算では ${formatYen(auto.yen)})`
                    : `${formatUsd(sub.amount)} × ${auto.rate!.toFixed(3)}円${auto.estimate ? '(今のレートで見込み)' : ''}`}
                </span>
              </span>
              {future ? (
                <b className="num">約{formatYen(c.yen)}</b>
              ) : (
                <ActualInput key={`${ym}-${sub.actuals?.[ym] ?? ''}`} value={sub.actuals?.[ym]} placeholder={auto.yen} onCommit={(v) => onActual(ym, v)} />
              )}
            </li>
          );
        })}
      </ul>
      <p className="note">
        自動の換算は、請求日の公表レートにカードの海外手数料({fx.feePercent}%)を足したものです。カードの明細が来たら、右の欄に実際の請求額を入れると、その額で集計します(空にすると自動の換算に戻ります)
      </p>
    </section>
  );
}

function ActualInput({ value, placeholder, onCommit }: { value?: number; placeholder: number; onCommit: (v: number | null) => void }) {
  const [draft, setDraft] = useState(value != null ? String(value) : '');
  const commit = () => {
    const v = draft.trim() === '' ? null : Math.round(Number(draft));
    if (v != null && !(v >= 0)) return setDraft(value != null ? String(value) : '');
    if (v !== (value ?? null)) onCommit(v);
  };
  return (
    <span className={value != null ? 'actual-input set' : 'actual-input'}>
      <span>¥</span>
      <input type="number" inputMode="numeric" min="0" value={draft} placeholder={placeholder.toLocaleString()} aria-label="実際の請求額(円)"
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
    </span>
  );
}
