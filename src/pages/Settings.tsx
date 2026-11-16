import { useRef, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { normalize } from '../lib/storage';
import { today } from '../lib/date';
import { CloudSync } from '../components/CloudSync';

export function Settings() {
  const { data, update, replace } = useStore();
  const { settings } = data;
  const [newCat, setNewCat] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
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
        <h2>カテゴリと月の予算</h2>
        <p className="note">予算を入れると、ダッシュボードの棒グラフに目安の線が出て、超えると赤くなります</p>
        <ul className="list">
          {settings.categories.map((c) => (
            <li key={c}>
              <div className="row">
                <span className="grow">{c}</span>
                <input className="narrow" type="number" inputMode="numeric" min="0" placeholder="予算なし"
                  value={settings.budgets[c] ?? ''}
                  onChange={(e) => {
                    const budgets = { ...settings.budgets };
                    if (e.target.value === '') delete budgets[c];
                    else budgets[c] = Number(e.target.value);
                    setS({ budgets });
                  }} />
                <button className="icon-btn" aria-label={`${c}を削除`}
                  onClick={() => setS({ categories: settings.categories.filter((x) => x !== c) })}>×</button>
              </div>
            </li>
          ))}
        </ul>
        <form className="toolbar" onSubmit={(e) => {
          e.preventDefault();
          const c = newCat.trim();
          if (c && !settings.categories.includes(c)) setS({ categories: [...settings.categories, c] });
          setNewCat('');
        }}>
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="新しいカテゴリ" />
          <button className="btn">追加</button>
        </form>
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
