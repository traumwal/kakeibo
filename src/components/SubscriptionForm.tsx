import { useState } from 'react';
import { clampDay, today, ymOf } from '../lib/date';
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
  // 最初に払った日。ずらした記録があれば、ずらす前の請求日で数える
  const shifts = [...(initial?.shifts ?? [])].sort((a, b) => a.to.localeCompare(b.to));
  const firstPay0 = initial ? clampDay(ymOf(initial.startDate), shifts[0]?.prevDay ?? initial.billingDay) : t;
  const [f, setF] = useState({
    name: initial?.name ?? '',
    domain: initial?.domain ?? '',
    amount: initial ? String(initial.amount) : '',
    currency: initial?.currency ?? 'JPY',
    cycle: initial?.cycle ?? 'monthly',
    firstPay: firstPay0,
    // 分類を選んでいない以前のサブスクは、名前から推測した分類を最初から選んでおく
    category: initial && initial.category !== UNCLASSIFIED_SUB ? initial.category : guessCategory(initial?.name ?? '') ?? UNCLASSIFIED_SUB,
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

  /** 最初に払った日から開始日と請求日を決める。日付を変えていなければ今のまま (31日払いの2月始まりなどを崩さない) */
  const dates = (): Pick<Subscription, 'startDate' | 'billingDay' | 'shifts'> => {
    if (initial && f.firstPay === firstPay0) return { startDate: initial.startDate, billingDay: initial.billingDay, shifts: initial.shifts };
    const day = Number(f.firstPay.slice(8, 10));
    if (shifts.length) return { startDate: f.firstPay, billingDay: initial!.billingDay, shifts: [{ ...shifts[0], prevDay: day }, ...shifts.slice(1)] };
    return { startDate: f.firstPay, billingDay: day, shifts: undefined };
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
      category: f.category,
      ...dates(),
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
          <label>{initial?.history?.length ? '再開して最初に払った日' : '最初に払った日'}
            <input required type="date" value={f.firstPay} onChange={set('firstPay')} />
          </label>
          <label>支払い方法
            <select value={f.payment} onChange={set('payment')}>
              <option value="">未設定</option>
              {(f.payment && !payments.includes(f.payment) ? [...payments, f.payment] : payments).map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
        </div>
        {f.firstPay && !shifts.length && (
          <p className="note">
            {f.cycle === 'yearly'
              ? `毎年${Number(f.firstPay.slice(5, 7))}月${Number(f.firstPay.slice(8, 10))}日に請求します。`
              : `毎月${Number(f.firstPay.slice(8, 10))}日に請求します。`}
            ずっと前から使っていて覚えていなければ、最近払った日を入れてください(その月から集計します)
          </p>
        )}
        <label>分類
          <select value={f.category} onChange={(e) => { setAutoCategory(false); set('category')(e); }}>
            {subCategoryOptions(categories, f.category).map((c) => <option key={c} value={c}>{subCategoryLabel(c)}</option>)}
          </select>
        </label>
        <p className="note">分類は「何に使っているか」です。定期券なら「交通」、動画や音楽は「趣味・娯楽」、ChatGPT などは「AI・ツール」。カテゴリ別のグラフでは、その分類に固定費として入ります</p>
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
