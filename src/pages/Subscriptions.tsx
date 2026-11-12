import { useEffect, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { isActiveOn, monthlyAmount, nextBillingDate, reviewCandidates, sortSubscriptions } from '../lib/calc';
import { today } from '../lib/date';
import { formatYen } from '../lib/format';
import type { Subscription } from '../types';
import { SubIcon } from '../components/SubIcon';
import { SubscriptionForm } from '../components/SubscriptionForm';
import { SubscriptionDetail } from './SubscriptionDetail';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

export function Subscriptions() {
  const { data, update } = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Subscription | 'new' | null>(null);
  const t = today();
  const sorted = sortSubscriptions(data.subscriptions, t);
  const active = sorted.filter((s) => isActiveOn(s, t));
  const ended = sorted.filter((s) => !isActiveOn(s, t));
  const monthly = active.reduce((s, x) => s + monthlyAmount(x), 0);
  const reviews = reviewCandidates(data.subscriptions, data.settings, t);
  // ❗ は「未使用」「高コスト」の深刻な理由がある場合のみ (未入力だけでは付けない)
  const flagged = new Set(reviews.filter((c) => c.reasons.some((r) => r.kind !== 'noUsage')).map((c) => c.sub.id));
  const selected = data.subscriptions.find((s) => s.id === selectedId);

  // 詳細を開いたら履歴を積み、スマホの「戻る」で一覧に戻れるようにする
  useEffect(() => {
    const onPop = () => setSelectedId(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const open = (id: string) => {
    history.pushState({ subDetail: id }, '');
    setSelectedId(id);
    window.scrollTo(0, 0);
  };
  const back = () => {
    if (history.state?.subDetail) history.back();
    else setSelectedId(null);
  };

  const save = (s: Subscription) => {
    update((d) => ({
      ...d,
      subscriptions: d.subscriptions.some((x) => x.id === s.id)
        ? d.subscriptions.map((x) => (x.id === s.id ? s : x))
        : [...d.subscriptions, s],
    }));
    setEditing(null);
  };
  const remove = (id: string) => {
    if (!confirm('このサブスクを削除しますか?(過去の月の集計からも消えます。解約なら「解約日」を入れてください)')) return;
    update((d) => ({ ...d, subscriptions: d.subscriptions.filter((x) => x.id !== id) }));
    setEditing(null);
    if (selectedId === id) back();
  };
  const markUsed = (id: string) =>
    update((d) => ({ ...d, subscriptions: d.subscriptions.map((s) => (s.id === id ? { ...s, lastUsedAt: t } : s)) }));

  const form = editing && (
    <SubscriptionForm
      initial={editing === 'new' ? undefined : editing}
      categories={data.settings.categories}
      onClose={() => setEditing(null)}
      onSave={save}
      onDelete={remove}
    />
  );

  if (selected) {
    return (
      <>
        <SubscriptionDetail
          sub={selected}
          review={reviews.find((c) => c.sub.id === selected.id)}
          onBack={back}
          onEdit={() => setEditing(selected)}
          onMarkUsed={() => markUsed(selected.id)}
        />
        {form}
      </>
    );
  }

  const row = (s: Subscription) => {
    const on = isActiveOn(s, t);
    const next = on ? nextBillingDate(s, t) : null;
    return (
      <li key={s.id}>
        <button className={on ? 'sub-row' : 'sub-row ended'} onClick={() => open(s.id)}>
          <SubIcon name={s.name} domain={s.domain} />
          <span className="grow">
            <span className="sub-name">
              {s.name}
              {flagged.has(s.id) && <span className="flag" title="見直し候補">❗</span>}
            </span>
            <span className="sub-sub">{on ? (next === t ? '今日請求' : next ? `次回 ${md(next)}` : '') : '解約済み'}</span>
          </span>
          <span className="num sub-amount">
            {formatYen(s.amount)}<small>/{s.cycle === 'monthly' ? '月' : '年'}</small>
          </span>
          <span className="chev" aria-hidden>›</span>
        </button>
      </li>
    );
  };

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
        <div className="note">
          {active.length}件が契約中
          {flagged.size > 0 && <span className="flag-note"> ・ ❗見直し候補 {flagged.size}件</span>}
        </div>
      </section>

      <div className="toolbar">
        <h2>契約中</h2>
        <button className="btn primary" onClick={() => setEditing('new')}>+ 追加</button>
      </div>
      {active.length === 0 && <p className="empty">サブスクや家賃・通信費など、毎月かかるものを登録しましょう</p>}
      {active.length > 0 && <ul className="card list sub-list">{active.map(row)}</ul>}

      {ended.length > 0 && (
        <>
          <h2 className="section-title">解約済み</h2>
          <ul className="card list sub-list">{ended.map(row)}</ul>
        </>
      )}
      {form}
    </div>
  );
}
