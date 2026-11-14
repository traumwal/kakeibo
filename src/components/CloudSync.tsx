import { useState } from 'react';
import { useStore, type SyncStatus } from '../hooks/useStore';
import { supabase } from '../lib/supabase';

const LABEL: Record<SyncStatus, string> = {
  disabled: '未設定',
  signedOut: 'ログインしていません',
  syncing: '同期中…',
  synced: '同期済み',
  offline: 'オフライン(つながったら同期します)',
  error: '同期できませんでした',
};

const time = (d: Date) => d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

export function CloudSync() {
  const { cloud } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!supabase) {
    return (
      <section className="card">
        <h2>クラウド同期</h2>
        <p className="note">このビルドではクラウド同期が設定されていません(Supabase の URL とキーが必要です)。データはこの端末の中だけに保存されます。</p>
      </section>
    );
  }
  const client = supabase;

  const submit = async (mode: 'signIn' | 'signUp') => {
    setErr(null);
    setInfo(null);
    if (!email.trim() || password.length < 6) {
      setErr('メールアドレスと6文字以上のパスワードを入れてください');
      return;
    }
    setBusy(true);
    const creds = { email: email.trim(), password };
    if (mode === 'signIn') {
      const { error } = await client.auth.signInWithPassword(creds);
      if (error) setErr(error.message === 'Email not confirmed'
        ? 'メールアドレスの確認がまだです。届いたメールのリンクを開いてから、もう一度ログインしてください'
        : 'メールアドレスかパスワードが正しくありません');
    } else {
      const { data, error } = await client.auth.signUp({
        ...creds,
        options: { emailRedirectTo: location.origin + import.meta.env.BASE_URL },
      });
      if (error) setErr(error.message);
      else if (!data.session) setInfo('確認メールを送りました。メールのリンクを開いたあと、ここでログインしてください');
    }
    setBusy(false);
  };

  if (cloud.email) {
    return (
      <section className="card">
        <h2>クラウド同期</h2>
        <p className="row" style={{ margin: 0 }}>
          <span className={`sync-dot ${cloud.status}`} aria-hidden />
          <span className="grow">
            {LABEL[cloud.status]}
            {cloud.status === 'synced' && cloud.lastSyncedAt && <small>({time(cloud.lastSyncedAt)})</small>}
          </span>
        </p>
        {cloud.status === 'error' && cloud.error && <p className="error">{cloud.error}</p>}
        <p className="note">{cloud.email} でログイン中。同じメールアドレスでログインした端末どうしで、データが自動で同期されます。</p>
        <div className="actions">
          <button className="btn" onClick={cloud.syncNow} disabled={cloud.status === 'syncing'}>今すぐ同期</button>
          <button className="btn danger" onClick={() => confirm('ログアウトしますか?(この端末のデータは残ります)') && cloud.signOut()}>ログアウト</button>
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>クラウド同期</h2>
      <p className="note">
        ログインすると、データがクラウドにも保存され、スマホと PC など複数の端末で同じデータを使えます。
        はじめての場合はメールアドレスとパスワードを決めて「新規登録」してください。
      </p>
      <form className="form" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); void submit('signIn'); }}>
        <label>メールアドレス
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>パスワード(6文字以上)
          <input type="password" required minLength={6} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <div className="actions">
          <button type="button" className="btn" disabled={busy} onClick={() => void submit('signUp')}>新規登録</button>
          <button className="btn primary" disabled={busy}>ログイン</button>
        </div>
      </form>
      {info && <p className="note">{info}</p>}
      {err && <p className="error" style={{ marginTop: 8 }}>{err}</p>}
    </section>
  );
}
