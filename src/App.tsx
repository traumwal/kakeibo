import { useState } from 'react';
import { useStore } from './hooks/useStore';
import { Dashboard } from './pages/Dashboard';
import { Subscriptions } from './pages/Subscriptions';
import { Expenses } from './pages/Expenses';
import { Friends } from './pages/Friends';
import { Settings } from './pages/Settings';
import { FxUpdater } from './components/FxUpdater';

export type Tab = 'home' | 'subs' | 'expenses' | 'friends' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'ホーム', icon: '▤' },
  { id: 'subs', label: 'サブスク', icon: '↻' },
  { id: 'expenses', label: '記録', icon: '✎' },
  { id: 'friends', label: '貸し借り', icon: '⇄' },
  { id: 'settings', label: '設定', icon: '⚙' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const { saveError } = useStore();
  return (
    <div className="app">
      <FxUpdater />
      {saveError && <div className="banner">データを保存できませんでした(プライベートブラウズや容量不足の可能性があります)</div>}
      <main>
        {tab === 'home' && <Dashboard go={setTab} />}
        {tab === 'subs' && <Subscriptions />}
        {tab === 'expenses' && <Expenses goSettings={() => { setTab('settings'); window.scrollTo(0, 0); }} />}
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
