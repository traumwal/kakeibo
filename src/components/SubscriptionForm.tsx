import { useState } from 'react';
import { today } from '../lib/date';
import { uid } from '../lib/format';
import { cleanDomain, guessDomain } from '../lib/logo';
import { guessCategory, subCategoryLabel, subCategoryOptions, UNCLASSIFIED_SUB } from '../lib/categories';
import type { Subscription } from '../types';
import { Modal } from './Modal';
import { SubIcon } from './SubIcon';

export function SubscriptionForm({ initial, categories, payments, onSave, onClose, onDelete }: {
  initial?: Subscription;
  categories: string[];
  payments: string[];
  onSave: (s: Subscription) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const t = today();
  const [f, setF] = useState({
    name: initial?.name ?? '',
    domain: initial?.domain ?? '',
    amount: initial ? String(initial.amount) : '',
    currency: initial?.currency ?? 'JPY',
    cycle: initial?.cycle ?? 'monthly',
    billingDay: String(initial?.billingDay ?? Number(t.slice(8))),
    // 分類を選んでいない以前のサブスクは、名前から推測した分類を最初から選んでおく
    category: initial && initial.category !== UNCLASSIFIED_SUB ? initial.category : guessCategory(initial?.name ?? '') ?? UNCLASSIFIED_SUB,
    startDate: initial?.startDate ?? t,
    payment: initial?.payment ?? '',
    memo: initial?.memo ?? '',
  });
  // 自動で入れたドメインは、名前を変えたら追従させる (手で入力したものは上書きしない)
  const [autoDomain, setAutoDomain] = useState(!initial?.domain);
  // 分類も、自分で選ぶまでは名前から推測する
  const [autoCategory, setAutoCategory] = useState(!initial || initial.category === UNCLASSIFIED_SUB);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const onName = (name: string) => {
    setF((p) => ({
      ...p,
      name,
      domain: autoDomain ? guessDomain(name) ?? '' : p.domain,
      category: autoCategory ? guessCategory(name) ?? UNCLASSIFIED_SUB : p.category,
    }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...initial,
      id: initial?.id ?? uid(),
      name: f.name.trim(),
      domain: cleanDomain(f.domain) || undefined,
      amount: Number(f.amount),
      currency: f.currency === 'USD' ? 'USD' : undefined,
      cycle: f.cycle as Subscription['cycle'],
      billingDay: Math.min(31, Math.max(1, Number(f.billingDay) || 1)),
      category: f.category,
      startDate: f.startDate,
      payment: f.payment || undefined,
      memo: f.memo.trim() || undefined,
    });
  };

  return (
    <Modal title={initial ? 'サブスクを編集' : 'サブスクを追加'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>名前<input required value={f.name} onChange={(e) => onName(e.target.value)} placeholder="例: Netflix" /></label>
        <div className="domain-row">
          <SubIcon name={f.name} domain={cleanDomain(f.domain) || undefined} size={40} />
          <label className="grow">サービスのURL(ロゴ表示用・任意)
            <input value={f.domain} inputMode="url" autoCapitalize="off" placeholder="例: netflix.com"
              onChange={(e) => { setAutoDomain(false); set('domain')(e); }} />
          </label>
        </div>
        <div className="grid2">
          <label>金額
            <span className="amount-input">
              <select value={f.currency} onChange={set('currency')} aria-label="通貨">
                <option value="JPY">円</option>
                <option value="USD">ドル</option>
              </select>
              <input required type="number" inputMode="decimal" min="0" step={f.currency === 'USD' ? '0.01' : '1'} value={f.amount}
                onChange={set('amount')} placeholder={f.currency === 'USD' ? '例: 20' : '例: 980'} />
            </span>
          </label>
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
            <select value={f.category} onChange={(e) => { setAutoCategory(false); set('category')(e); }}>
              {subCategoryOptions(categories, f.category).map((c) => <option key={c} value={c}>{subCategoryLabel(c)}</option>)}
            </select>
          </label>
        </div>
        <div className="grid2">
          <label>開始日<input required type="date" value={f.startDate} onChange={set('startDate')} /></label>
          <label>支払い方法
            <select value={f.payment} onChange={set('payment')}>
              <option value="">未設定</option>
              {(f.payment && !payments.includes(f.payment) ? [...payments, f.payment] : payments).map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <p className="note">分類は「何に使っているか」です。定期券なら「交通」、動画や音楽は「趣味・娯楽」、ChatGPT などは「AI・ツール」。カテゴリ別のグラフでは、その分類に固定費として入ります</p>
        {f.cycle === 'yearly' && <p className="note">年払いは開始日の月に請求される扱いです</p>}
        {f.currency === 'USD' && (
          <p className="note">円の額は請求日のレート(カードの海外手数料込み)で自動で換算します。カードの明細が来たら、詳細画面で実際の額に直せます</p>
        )}
        <label>メモ<input value={f.memo} onChange={set('memo')} /></label>
        <div className="actions">
          {initial && <button type="button" className="btn danger" onClick={() => onDelete(initial.id)}>削除</button>}
          <button type="submit" className="btn primary">保存</button>
        </div>
      </form>
    </Modal>
  );
}
