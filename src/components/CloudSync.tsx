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
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!supabase) {
    return (
      <section className="card">
        <h2>クラウド同期</h2>
        <p className="note">このビルドではクラウド同期が設定されていません(Supabase の URL とキーが必要です)。データはこの端末の中だけに保存されます。</p>
      </section>
    );
  }
  const client = supabase;

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const addr = email.trim();
    const { error } = await client.auth.signInWithOtp({
      email: addr,
      options: { emailRedirectTo: location.origin + import.meta.env.BASE_URL },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSentTo(addr);
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sentTo) return;
    setBusy(true);
    setErr(null);
    const { error } = await client.auth.verifyOtp({ email: sentTo, token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setErr('コードが正しくないか、期限が切れています');
    else {
      setSentTo(null);
      setCode('');
    }
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
        パスワードは不要で、メールに届くコードでログインします。
      </p>
      {!sentTo ? (
        <form className="form" onSubmit={sendCode} style={{ marginTop: 12 }}>
          <label>メールアドレス
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <div className="actions">
            <button className="btn primary" disabled={busy}>ログイン用コードを送る</button>
          </div>
        </form>
      ) : (
        <form className="form" onSubmit={verify} style={{ marginTop: 12 }}>
          <label>{sentTo} に届いたコード
            <input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <p className="note" style={{ margin: 0 }}>メール内のリンクをこのブラウザで開いてもログインできます。</p>
          <div className="actions">
            <button type="button" className="btn" onClick={() => { setSentTo(null); setCode(''); setErr(null); }}>戻る</button>
            <button className="btn primary" disabled={busy}>ログイン</button>
          </div>
        </form>
      )}
      {err && <p className="error" style={{ marginTop: 8 }}>{err}</p>}
    </section>
  );
}
