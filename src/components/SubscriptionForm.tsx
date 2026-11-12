import { useState } from 'react';
import { today } from '../lib/date';
import { uid } from '../lib/format';
import { cleanDomain, guessDomain } from '../lib/logo';
import type { Subscription } from '../types';
import { Modal } from './Modal';
import { SubIcon } from './SubIcon';

export function SubscriptionForm({ initial, categories, onSave, onClose, onDelete }: {
  initial?: Subscription;
  categories: string[];
  onSave: (s: Subscription) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const t = today();
  const [f, setF] = useState({
    name: initial?.name ?? '',
    domain: initial?.domain ?? '',
    amount: initial ? String(initial.amount) : '',
    cycle: initial?.cycle ?? 'monthly',
    billingDay: String(initial?.billingDay ?? Number(t.slice(8))),
    category: initial?.category ?? 'サブスク',
    startDate: initial?.startDate ?? t,
    endDate: initial?.endDate ?? '',
    usage: initial?.usageHoursPerMonth != null ? String(initial.usageHoursPerMonth) : '',
    memo: initial?.memo ?? '',
  });
  // 自動で入れたドメインは、名前を変えたら追従させる (手で入力したものは上書きしない)
  const [autoDomain, setAutoDomain] = useState(!initial?.domain);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const onName = (name: string) => {
    setF((p) => ({ ...p, name, domain: autoDomain ? guessDomain(name) ?? '' : p.domain }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: initial?.id ?? uid(),
      name: f.name.trim(),
      domain: cleanDomain(f.domain) || undefined,
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
        <label>名前<input required value={f.name} onChange={(e) => onName(e.target.value)} placeholder="例: Netflix" /></label>
        <div className="domain-row">
          <SubIcon name={f.name} domain={cleanDomain(f.domain) || undefined} size={40} />
          <label className="grow">サービスのURL(ロゴ表示用・任意)
            <input value={f.domain} inputMode="url" autoCapitalize="off" placeholder="例: netflix.com"
              onChange={(e) => { setAutoDomain(false); set('domain')(e); }} />
          </label>
        </div>
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
