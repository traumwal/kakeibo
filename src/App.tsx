import { useEffect, useState } from 'react';
import { useStore } from './hooks/useStore';
import { Dashboard } from './pages/Dashboard';
import { Subscriptions } from './pages/Subscriptions';
import { Expenses } from './pages/Expenses';
import { Friends } from './pages/Friends';
import { Settings } from './pages/Settings';
import { FxUpdater } from './components/FxUpdater';
import { isPayLink, parsePayParams, type PayDraft } from './lib/quickadd';

export type Tab = 'home' | 'subs' | 'expenses' | 'friends' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'ホーム', icon: '▤' },
  { id: 'subs', label: 'サブスク', icon: '↻' },
  { id: 'expenses', label: '記録', icon: '✎' },
  { id: 'friends', label: '貸し借り', icon: '⇄' },
  { id: 'settings', label: '設定', icon: '⚙' },
];

export default function App() {
  // iPhone のショートカット (Apple Pay) から ?pay=... で開かれたら、入力済みの記録画面を開く
  // 金額がない・0円の支払い (定期の区間内で改札を通ったときなど) は記録画面を開かずに知らせるだけ
  const [fromLink] = useState(() => isPayLink(location.search));
  const [draft, setDraft] = useState<PayDraft | null>(() => {
    const d = parsePayParams(location.search);
    return d?.amount ? d : null;
  });
  const [notice, setNotice] = useState<string | null>(() => (fromLink && !draft ? '0円(または金額なし)の支払いなので記録しませんでした' : null));
  const [tab, setTab] = useState<Tab>(() => (draft ? 'expenses' : 'home'));
  useEffect(() => {
    // 再読み込みでもう一度開かないように、URL から消しておく
    if (fromLink) history.replaceState(history.state, '', location.pathname);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  const { saveError } = useStore();
  return (
    <div className="app">
      <FxUpdater />
      {notice && <div className="toast" role="status" onClick={() => setNotice(null)}>{notice}</div>}
      {saveError && <div className="banner">データを保存できませんでした(プライベートブラウズや容量不足の可能性があります)</div>}
      <main>
        {tab === 'home' && <Dashboard go={setTab} />}
        {tab === 'subs' && <Subscriptions />}
        {tab === 'expenses' && <Expenses draft={draft} clearDraft={() => setDraft(null)} goSettings={() => { setTab('settings'); window.scrollTo(0, 0); }} />}
        {tab === 'friends' && <Friends />}
        {tab === 'settings' && <Settings />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => { setTab(t.id); window.scrollTo(0, 0); }}>
            <span className="tab-icon" aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
