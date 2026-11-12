import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import {
  costPerHour, isActiveOn, monthlyAmount, nextBillingDate, reviewCandidates, sortSubscriptions, yearlyAmount,
  type ReviewReason,
} from '../lib/calc';
import { daysBetween, today } from '../lib/date';
import { formatYen, uid } from '../lib/format';
import type { Subscription } from '../types';
import { Modal } from '../components/Modal';

function reasonText(r: ReviewReason): string {
  switch (r.kind) {
    case 'unused': return `${r.days}日間使っていません`;
    case 'neverUsed': return '「使った」の記録が一度もありません';
    case 'costly': return `1時間あたり ${formatYen(r.costPerHour)} とコストが高めです`;
    case 'noUsage': return '月の利用時間が未入力です';
  }
}

export function Subscriptions() {
  const { data, update } = useStore();
  const [editing, setEditing] = useState<Subscription | 'new' | null>(null);
  const t = today();
  const active = data.subscriptions.filter((s) => isActiveOn(s, t));
  const monthly = active.reduce((s, x) => s + monthlyAmount(x), 0);
  const reviews = reviewCandidates(data.subscriptions, data.settings, t);

  const markUsed = (id: string) =>
    update((d) => ({ ...d, subscriptions: d.subscriptions.map((s) => (s.id === id ? { ...s, lastUsedAt: t } : s)) }));

  return (
    <div className="page">
      <h1>サブスク・固定費</h1>
      <section className="card hero">
        <div className="split">
          <div>
            <div className="label">月額合計</div>
            <div className="big num">{formatYen(monthly)}</div>
          </div>
          <div>
            <div className="label">年間にすると</div>
            <div className="big num">{formatYen(monthly * 12)}</div>
          </div>
        </div>
        <div className="note">{active.length}件が契約中</div>
      </section>

      {reviews.length > 0 && (
        <section className="card review">
          <h2>見直し候補</h2>
          <ul className="list">
            {reviews.map((c) => (
              <li key={c.sub.id}>
                <div className="row">
                  <b>{c.sub.name}</b>
                  <span className="num">解約すると年間 {formatYen(c.yearlySaving)} 浮く</span>
                </div>
                <ul className="reasons">
                  {c.reasons.map((r) => <li key={r.kind}>{reasonText(r)}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="toolbar">
        <h2>登録一覧</h2>
        <button className="btn primary" onClick={() => setEditing('new')}>+ 追加</button>
      </div>
      {data.subscriptions.length === 0 && <p className="empty">サブスクや家賃・通信費など、毎月かかるものを登録しましょう</p>}
      <div className="sub-grid">
        {sortSubscriptions(data.subscriptions, t).map((s) => {
          const on = isActiveOn(s, t);
          const next = nextBillingDate(s, t);
          const cph = costPerHour(s);
          return (
            <article key={s.id} className={on ? 'card sub' : 'card sub ended'}>
              <div className="row">
                <h3>{s.name}</h3>
                <button className="link" onClick={() => setEditing(s)}>編集</button>
              </div>
              <div className="sub-price num">
                {formatYen(s.amount)}<small>/{s.cycle === 'monthly' ? '月' : '年'}</small>
              </div>
              <dl className="facts">
                <dt>年額</dt><dd className="num">{formatYen(yearlyAmount(s))}</dd>
                {s.cycle === 'yearly' && (<><dt>月額換算</dt><dd className="num">{formatYen(monthlyAmount(s))}</dd></>)}
                <dt>次回請求</dt><dd>{on && next ? `${next.slice(5).replace('-', '/')}(${next === t ? '今日' : `あと${daysBetween(t, next)}日`})` : '解約済み'}</dd>
                <dt>1時間あたり</dt>
                <dd className="num">{cph == null ? '—' : cph === Infinity ? '利用0時間' : formatYen(cph)}</dd>
                <dt>最後に使った日</dt><dd>{s.lastUsedAt ? `${s.lastUsedAt.slice(5).replace('-', '/')}(${s.lastUsedAt === t ? '今日' : `${daysBetween(s.lastUsedAt, t)}日前`})` : '—'}</dd>
              </dl>
              {on && <button className="btn" onClick={() => markUsed(s.id)}>今日使った</button>}
            </article>
          );
        })}
      </div>

      {editing && (
        <SubscriptionForm
          initial={editing === 'new' ? undefined : editing}
          categories={data.settings.categories}
          onClose={() => setEditing(null)}
          onSave={(s) => {
            update((d) => ({
              ...d,
              subscriptions: d.subscriptions.some((x) => x.id === s.id)
                ? d.subscriptions.map((x) => (x.id === s.id ? s : x))
                : [...d.subscriptions, s],
            }));
            setEditing(null);
          }}
          onDelete={(id) => {
            if (!confirm('このサブスクを削除しますか?(過去の月の集計からも消えます。解約なら「解約日」を入れてください)')) return;
            update((d) => ({ ...d, subscriptions: d.subscriptions.filter((x) => x.id !== id) }));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function SubscriptionForm({ initial, categories, onSave, onClose, onDelete }: {
  initial?: Subscription;
  categories: string[];
  onSave: (s: Subscription) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const t = today();
  const [f, setF] = useState({
    name: initial?.name ?? '',
    amount: initial ? String(initial.amount) : '',
    cycle: initial?.cycle ?? 'monthly',
    billingDay: String(initial?.billingDay ?? Number(t.slice(8))),
    category: initial?.category ?? 'サブスク',
    startDate: initial?.startDate ?? t,
    endDate: initial?.endDate ?? '',
    usage: initial?.usageHoursPerMonth != null ? String(initial.usageHoursPerMonth) : '',
    memo: initial?.memo ?? '',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: initial?.id ?? uid(),
      name: f.name.trim(),
      amount: Number(f.amount),
      cycle: f.cycle as Subscription['cycle'],
      billingDay: Math.min(31, Math.max(1, Number(f.billingDay) || 1)),
      category: f.category,
      startDate: f.startDate,
      endDate: f.endDate || undefined,
      usageHoursPerMonth: f.usage === '' ? undefined : Number(f.usage),
      lastUsedAt: initial?.lastUsedAt,
      memo: f.memo.trim() || undefined,
    });
  };

  return (
    <Modal title={initial ? 'サブスクを編集' : 'サブスクを追加'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>名前<input required value={f.name} onChange={set('name')} placeholder="例: Netflix" /></label>
        <div className="grid2">
          <label>金額(円)<input required type="number" inputMode="numeric" min="0" value={f.amount} onChange={set('amount')} /></label>
          <label>支払い周期
            <select value={f.cycle} onChange={set('cycle')}>
              <option value="monthly">毎月</option>
              <option value="yearly">毎年</option>
            </select>
          </label>
        </div>
        <div className="grid2">
          <label>請求日<input type="number" min="1" max="31" value={f.billingDay} onChange={set('billingDay')} /></label>
          <label>分類
            <select value={f.category} onChange={set('category')}>
              {['サブスク', '家賃', '通信費', '光熱費', '保険', ...categories].filter((v, i, a) => a.indexOf(v) === i).map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <div className="grid2">
          <label>開始日<input required type="date" value={f.startDate} onChange={set('startDate')} /></label>
          <label>解約日<input type="date" value={f.endDate} onChange={set('endDate')} /></label>
        </div>
        {f.cycle === 'yearly' && <p className="note">年払いは開始日の月の請求日に請求される扱いです</p>}
        <label>月の利用時間(時間・任意)
          <input type="number" inputMode="decimal" min="0" step="0.5" value={f.usage} onChange={set('usage')} placeholder="例: 12" />
        </label>
        <p className="note">
          ブラウザからは他のアプリの利用時間を自動で取得できません。iPhoneは「設定 → スクリーンタイム」、Androidは「設定 → Digital Wellbeing」で確認した値を入れると、1時間あたりのコストが計算されます。
        </p>
        <label>メモ<input value={f.memo} onChange={set('memo')} /></label>
        <div className="actions">
          {initial && <button type="button" className="btn danger" onClick={() => onDelete(initial.id)}>削除</button>}
          <button type="submit" className="btn primary">保存</button>
        </div>
      </form>
    </Modal>
  );
}
