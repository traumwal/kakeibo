import { useState } from 'react';
import { CATALOG, planSubName, searchCatalog, type CatalogPlan, type CatalogService } from '../lib/catalog';
import { formatYen } from '../lib/format';
import type { Subscription } from '../types';
import { Modal } from './Modal';
import { SubIcon } from './SubIcon';

/** フォームに最初から入れておく値 */
export type SubPreset = Pick<Subscription, 'name' | 'domain' | 'category' | 'cycle'> & Partial<Pick<Subscription, 'amount' | 'currency'>>;

const price = (p: CatalogPlan) =>
  `${p.currency === 'USD' ? `$${p.amount}` : formatYen(p.amount)} / ${p.cycle === 'yearly' ? '年' : '月'}`;

/** 「+ 追加」で開く、よくあるサブスクの一覧。サービス → プランを選ぶと入力済みのフォームを開く */
export function SubscriptionPicker({ registered, onPick, onCustom, onClose }: {
  registered: Set<string>; // 登録済みのドメイン
  onPick: (p: SubPreset) => void;
  onCustom: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [service, setService] = useState<CatalogService | null>(null);

  const pick = (s: CatalogService, p?: CatalogPlan) =>
    onPick({
      name: p ? planSubName(s, p) : s.name,
      domain: s.domain,
      category: s.category,
      cycle: p?.cycle ?? 'monthly',
      amount: p?.amount,
      currency: p?.currency,
    });

  const choose = (s: CatalogService) => {
    if (s.plans.length === 0) pick(s); // 家賃などは金額を自分で入れる
    else if (s.plans.length === 1) pick(s, s.plans[0]);
    else setService(s);
  };

  if (service) {
    return (
      <Modal title={service.name} onClose={onClose}>
        <button className="btn picker-back" onClick={() => setService(null)}>‹ 一覧に戻る</button>
        <p className="note">プランを選んでください</p>
        <ul className="card list picker-list">
          {service.plans.map((p) => (
            <li key={p.name}>
              <button className="sub-row" onClick={() => pick(service, p)}>
                <SubIcon name={service.name} domain={service.domain} size={36} />
                <span className="grow sub-name">{p.name}</span>
                <span className="num">{price(p)}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="note">金額は目安です。値上げなどで違っていたら、次の画面で直せます</p>
      </Modal>
    );
  }

  const row = (s: CatalogService) => (
    <li key={s.name}>
      <button className="sub-row" onClick={() => choose(s)}>
        <SubIcon name={s.name} domain={s.domain} size={36} />
        <span className="grow">
          <span className="sub-name">{s.name}</span>
          <span className="sub-sub">
            {s.plans.length === 0 ? '金額は自分で入力'
              : s.plans.length === 1 ? price(s.plans[0])
              : `${s.plans.length}プラン ・ ${price(s.plans.reduce((a, b) => (a.amount <= b.amount ? a : b)))}〜`}
          </span>
        </span>
        {s.domain && registered.has(s.domain) && <span className="chip">登録済み</span>}
      </button>
    </li>
  );

  const results = query.trim() ? searchCatalog(query) : null;

  return (
    <Modal title="サブスクを追加" onClose={onClose}>
      <input className="picker-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="サービスを探す (例: ネトフリ、Spotify)" aria-label="サービスを探す" />
      <button className="btn picker-custom" onClick={onCustom}>+ 一覧にないものを自分で入力する</button>
      {results ? (
        results.length ? <ul className="card list picker-list">{results.map(row)}</ul>
          : <p className="empty">見つかりませんでした。上のボタンから自分で入力できます</p>
      ) : CATALOG.map((g) => (
        <div key={g.group}>
          <div className="sub-group-head"><span>{g.group}</span></div>
          <ul className="card list picker-list">{g.services.map(row)}</ul>
        </div>
      ))}
    </Modal>
  );
}
