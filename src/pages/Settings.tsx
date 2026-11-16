import { useRef, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { normalize, SUGGESTED_CATEGORIES } from '../lib/storage';
import { addCategory, moveCategory, removeCategory, renameCategory, usageCount, FALLBACK_CATEGORY } from '../lib/categories';
import type { AppData } from '../types';
import { today } from '../lib/date';
import { CloudSync } from '../components/CloudSync';

export function Settings() {
  const { data, update, replace } = useStore();
  const { settings } = data;
  const [newCat, setNewCat] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const suggestions = SUGGESTED_CATEGORIES.filter((c) => !settings.categories.includes(c));
  const setS = (patch: Partial<typeof settings>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kakeibo-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const d = normalize(JSON.parse(await file.text()));
      if (confirm('今のデータを読み込んだデータで置き換えます。よろしいですか?')) replace(d);
    } catch (e) {
      alert(`読み込みに失敗しました: ${(e as Error).message}`);
    }
  };

  return (
    <div className="page">
      <h1>設定</h1>
      <section className="card">
        <h2>分類と月の予算</h2>
        <p className="note">名前をタップすると変更できます(記録の分類も一緒に変わります)。上にあるものほど、記録するときに選びやすくなります。予算を入れると、超えたときに赤く表示されます</p>
        <ul className="list cat-settings">
          {settings.categories.map((c, i) => (
            <CategoryRow key={c} name={c} data={data} first={i === 0} last={i === settings.categories.length - 1}
              onlyOne={settings.categories.length === 1} update={update} />
          ))}
        </ul>
        <form className="toolbar" onSubmit={(e) => {
          e.preventDefault();
          update((d) => addCategory(d, newCat));
          setNewCat('');
        }}>
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="新しい分類" />
          <button className="btn">追加</button>
        </form>
        {suggestions.length > 0 && (
          <>
            <p className="note">おすすめから追加</p>
            <div className="chips">
              {suggestions.map((c) => (
                <button key={c} type="button" className="chip" onClick={() => update((d) => addCategory(d, c))}>+ {c}</button>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2>サブスクの見直し基準</h2>
        <div className="form">
          <label>1時間あたりのコストがこの額を超えたら(円)
            <input type="number" min="0" value={settings.reviewCostPerHour} onChange={(e) => setS({ reviewCostPerHour: Number(e.target.value) })} />
          </label>
          <label>最後に使ってからこの日数がたったら(日)
            <input type="number" min="1" value={settings.reviewUnusedDays} onChange={(e) => setS({ reviewUnusedDays: Number(e.target.value) })} />
          </label>
        </div>
      </section>

      <CloudSync />

      <section className="card">
        <h2>バックアップ</h2>
        <p className="note">クラウド同期を使わない場合、データはこの端末のブラウザの中にだけ保存されます。機種変更やブラウザのデータ削除に備えて、ときどき書き出しておきましょう。</p>
        <div className="actions">
          <button className="btn" onClick={exportJson}>JSONで書き出す</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>JSONを読み込む</button>
          <input ref={fileRef} type="file" accept="application/json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }} />
        </div>
      </section>
    </div>
  );
}

function CategoryRow({ name, data, first, last, onlyOne, update }: {
  name: string;
  data: AppData;
  first: boolean;
  last: boolean;
  onlyOne: boolean;
  update: (fn: (d: AppData) => AppData) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const budget = data.settings.budgets[name];

  const commit = () => {
    setEditing(false);
    const to = draft.trim();
    if (!to || to === name) return setDraft(name);
    if (data.settings.categories.includes(to) && !confirm(`「${to}」は既にあります。「${name}」の記録を「${to}」にまとめますか?`)) return setDraft(name);
    update((d) => renameCategory(d, name, to));
  };

  const remove = () => {
    const n = usageCount(data, name);
    const target = name === FALLBACK_CATEGORY ? data.settings.categories.find((c) => c !== name) : FALLBACK_CATEGORY;
    const msg = n > 0 ? `「${name}」を削除します。この分類の記録${n}件は「${target}」に移ります。` : `「${name}」を削除しますか?`;
    if (confirm(msg)) update((d) => removeCategory(d, name));
  };

  return (
    <li className="row">
      <span className="reorder">
        <button className="icon-btn" disabled={first} aria-label={`${name}を上へ`} onClick={() => update((d) => moveCategory(d, name, -1))}>↑</button>
        <button className="icon-btn" disabled={last} aria-label={`${name}を下へ`} onClick={() => update((d) => moveCategory(d, name, 1))}>↓</button>
      </span>
      {editing ? (
        <input className="grow" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') { setDraft(name); setEditing(false); }
          }} />
      ) : (
        <button className="link left grow cat-name-btn" onClick={() => { setDraft(name); setEditing(true); }}>{name}</button>
      )}
      <input className="narrow" type="number" inputMode="numeric" min="0" placeholder="予算なし" aria-label={`${name}の月の予算`}
        value={budget ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          update((d) => {
            const budgets = { ...d.settings.budgets };
            if (v === '') delete budgets[name];
            else budgets[name] = Number(v);
            return { ...d, settings: { ...d.settings, budgets } };
          });
        }} />
      <button className="icon-btn" disabled={onlyOne} aria-label={`${name}を削除`} onClick={remove}>×</button>
    </li>
  );
}
