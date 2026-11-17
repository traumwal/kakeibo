import { useEffect, useRef, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { currentYen, isOn, markUsed, monthlyAmount, nextBillingDate, reviewCandidates, sortSubscriptions, turnOff, turnOn } from '../lib/calc';
import { SubPrice } from '../components/Money';
import { today } from '../lib/date';
import { formatYen } from '../lib/format';
import type { Subscription, UsageLevel } from '../types';
import { SubIcon } from '../components/SubIcon';
import { SubscriptionForm } from '../components/SubscriptionForm';
import { Switch } from '../components/Switch';
import { SubscriptionDetail } from './SubscriptionDetail';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
const SWIPE_W = 84; // 左にスワイプしたときに出る削除ボタンの幅

export function Subscriptions() {
  const { data, update } = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Subscription | 'new' | null>(null);
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const t = today();
  const fx = data.settings.fx;
  const sorted = sortSubscriptions(data.subscriptions, t, fx);
  const active = sorted.filter((s) => isOn(s, t));
  const off = sorted.filter((s) => !isOn(s, t));
  const monthly = active.reduce((s, x) => s + monthlyAmount(x, fx), 0);
  const reviews = reviewCandidates(data.subscriptions, data.settings, t);
  const flagged = new Set(reviews.map((c) => c.sub.id));
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

  const patch = (id: string, fn: (s: Subscription) => Subscription) =>
    update((d) => ({ ...d, subscriptions: d.subscriptions.map((s) => (s.id === id ? fn(s) : s)) }));
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
    const s = data.subscriptions.find((x) => x.id === id);
    if (!confirm(`「${s?.name ?? ''}」を削除しますか?\n過去の月の集計からも消えます。やめただけなら、スイッチをオフにすると過去の分は残ります。`)) return;
    update((d) => ({ ...d, subscriptions: d.subscriptions.filter((x) => x.id !== id) }));
    setEditing(null);
    setSwipedId(null);
    if (selectedId === id) back();
  };
  const toggle = (s: Subscription) => patch(s.id, (x) => (isOn(x, t) ? turnOff(x, t) : turnOn(x, t)));

  const form = editing && (
    <SubscriptionForm
      initial={editing === 'new' ? undefined : editing}
      categories={data.settings.categories}
      payments={data.settings.paymentMethods}
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
          onToggle={() => toggle(selected)}
          onDelete={() => remove(selected.id)}
          onMarkUsed={() => patch(selected.id, (s) => markUsed(s, t))}
          onUsage={(u: UsageLevel | undefined) => patch(selected.id, (s) => ({ ...s, usage: u }))}
          fx={fx}
          onActual={(ym, yen) => patch(selected.id, (s) => {
            const rest = Object.fromEntries(Object.entries(s.actuals ?? {}).filter(([k]) => k !== ym));
            const actuals = yen == null ? rest : { ...rest, [ym]: yen };
            return { ...s, actuals: Object.keys(actuals).length ? actuals : undefined };
          })}
        />
        {form}
      </>
    );
  }

  const row = (s: Subscription) => {
    const on = isOn(s, t);
    const next = on ? nextBillingDate(s, t) : null;
    return (
      <SwipeRow key={s.id} open={swipedId === s.id} onOpen={(v) => setSwipedId(v ? s.id : null)} onDelete={() => remove(s.id)}>
        <button className={on ? 'sub-row' : 'sub-row ended'} onClick={() => open(s.id)}>
          <SubIcon name={s.name} domain={s.domain} />
          <span className="grow">
            <span className="sub-name">
              {s.name}
              {flagged.has(s.id) && <span className="flag" title="見直し候補">❗</span>}
            </span>
            <span className="sub-sub">{on ? (next === t ? '今日請求' : next ? `次回 ${md(next)}` : '') : 'オフ'}</span>
          </span>
          <SubPrice sub={s} yen={currentYen(s, fx)} className="num sub-amount" />
        </button>
        <Switch on={on} onChange={() => toggle(s)} label={`${s.name}のオン/オフ`} />
      </SwipeRow>
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
          {active.length}件がオン
          {flagged.size > 0 && <span className="flag-note"> ・ ❗見直し候補 {flagged.size}件</span>}
        </div>
      </section>

      <div className="toolbar">
        <h2>オン</h2>
        <button className="btn primary" onClick={() => setEditing('new')}>+ 追加</button>
      </div>
      {active.length === 0 && <p className="empty">サブスクや家賃・通信費など、毎月かかるものを登録しましょう</p>}
      {active.length > 0 && <ul className="card list sub-list">{active.map(row)}</ul>}

      {off.length > 0 && (
        <>
          <h2 className="section-title">オフ(集計しない)</h2>
          <ul className="card list sub-list">{off.map(row)}</ul>
        </>
      )}
      {data.subscriptions.length > 0 && <p className="note">左にスワイプ(パソコンは右クリック)で削除できます</p>}
      {form}
    </div>
  );
}

/** 左にスワイプすると削除ボタンが出る行。パソコンでは右クリックで出す */
function SwipeRow({ open, onOpen, onDelete, children }: {
  open: boolean;
  onOpen: (v: boolean) => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const start = useRef<{ x: number; y: number; dir: 'h' | 'v' | null } | null>(null);
  const [dx, setDx] = useState<number | null>(null);
  const base = open ? -SWIPE_W : 0;
  const offset = dx ?? base;

  return (
    <li className="swipe">
      <button className="swipe-del" onClick={onDelete} tabIndex={open ? 0 : -1} aria-hidden={!open}>削除</button>
      <div
        className={dx == null ? 'swipe-body animate' : 'swipe-body'}
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={(e) => {
          const p = e.touches[0];
          start.current = { x: p.clientX, y: p.clientY, dir: null };
        }}
        onTouchMove={(e) => {
          const s = start.current;
          if (!s) return;
          const p = e.touches[0];
          const mx = p.clientX - s.x;
          const my = p.clientY - s.y;
          if (!s.dir && Math.abs(mx) + Math.abs(my) > 8) s.dir = Math.abs(mx) > Math.abs(my) ? 'h' : 'v';
          if (s.dir === 'h') setDx(Math.min(0, Math.max(-SWIPE_W * 1.3, base + mx)));
        }}
        onTouchEnd={() => {
          const moved = start.current?.dir === 'h';
          start.current = null;
          if (dx != null) onOpen(dx < -SWIPE_W / 2);
          setDx(null);
          if (moved) suppressNextClick();
        }}
        onClickCapture={(e) => {
          // 削除ボタンが出ているときのタップは「閉じる」だけにする
          if (open) {
            e.stopPropagation();
            e.preventDefault();
            onOpen(false);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpen(!open);
        }}
      >
        {children}
      </div>
    </li>
  );
}

/** スワイプの直後に発生するクリック(詳細を開いてしまう)を1回だけ無視する */
function suppressNextClick() {
  const stop = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 400);
}
