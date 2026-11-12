import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { friendBalances } from '../lib/calc';
import { today } from '../lib/date';
import { formatYen, uid } from '../lib/format';
import type { Friend } from '../types';
import { Modal } from '../components/Modal';

export function Friends() {
  const { data, update } = useStore();
  const [settling, setSettling] = useState<{ friend: Friend; balance: number } | null>(null);
  const [detail, setDetail] = useState<Friend | null>(null);
  const [name, setName] = useState('');
  const balances = friendBalances(data.friends, data.expenses, data.repayments);
  const owe = balances.filter((b) => b.balance < 0).reduce((s, b) => s - b.balance, 0);
  const lent = balances.filter((b) => b.balance > 0).reduce((s, b) => s + b.balance, 0);

  const addFriend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    update((d) => ({ ...d, friends: [...d.friends, { id: uid(), name: name.trim() }] }));
    setName('');
  };

  return (
    <div className="page">
      <h1>友達との貸し借り</h1>
      <section className="card hero">
        <div className="split">
          <div>
            <div className="label">借りている合計</div>
            <div className="big num owe">{formatYen(owe)}</div>
          </div>
          <div>
            <div className="label">貸している合計</div>
            <div className="big num lent">{formatYen(lent)}</div>
          </div>
        </div>
        <p className="note">立て替えてもらった分は早めに返して、「隠れた出費」がたまらないようにしましょう</p>
      </section>

      <ul className="card list">
        {balances.length === 0 && <li className="empty">支出を記録するときに友達を追加できます</li>}
        {[...balances].sort((a, b) => a.balance - b.balance).map(({ friend, balance }) => (
          <li key={friend.id}>
            <div className="row">
              <button className="link grow left" onClick={() => setDetail(friend)}>{friend.name}</button>
              <span className={balance < 0 ? 'num owe' : balance > 0 ? 'num lent' : 'num muted'}>
                {balance < 0 ? `借り ${formatYen(-balance)}` : balance > 0 ? `貸し ${formatYen(balance)}` : '精算済み'}
              </span>
              {balance !== 0 && <button className="btn small" onClick={() => setSettling({ friend, balance })}>精算</button>}
            </div>
          </li>
        ))}
      </ul>

      <form className="toolbar" onSubmit={addFriend}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="友達の名前" />
        <button className="btn">友達を追加</button>
      </form>

      {settling && (
        <SettleForm
          friend={settling.friend}
          balance={settling.balance}
          onClose={() => setSettling(null)}
          onSave={(amount, date) => {
            update((d) => ({
              ...d,
              repayments: [...d.repayments, {
                id: uid(), friendId: settling.friend.id, date, amount,
                direction: settling.balance < 0 ? 'paidBack' : 'receivedBack',
              }],
            }));
            setSettling(null);
          }}
        />
      )}
      {detail && <FriendHistory friend={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function SettleForm({ friend, balance, onSave, onClose }: {
  friend: Friend; balance: number; onSave: (amount: number, date: string) => void; onClose: () => void;
}) {
  const [amount, setAmount] = useState(String(Math.abs(balance)));
  const [date, setDate] = useState(today());
  return (
    <Modal title={balance < 0 ? `${friend.name}に返す` : `${friend.name}から返してもらう`} onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (Number(amount) > 0) onSave(Number(amount), date); }}>
        <label>金額(円)<input type="number" inputMode="numeric" min="1" required value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label>日付<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <p className="note">返済は支出には計上されません(支出は記録したときの自分の負担額で計上済みです)</p>
        <div className="actions"><button className="btn primary">記録する</button></div>
      </form>
    </Modal>
  );
}

function FriendHistory({ friend, onClose }: { friend: Friend; onClose: () => void }) {
  const { data, update } = useStore();
  type Row = { id: string; date: string; text: string; delta: number; repaymentId?: string };
  const rows: Row[] = [];
  for (const e of data.expenses) {
    for (const s of e.settlements ?? []) {
      if (s.friendId !== friend.id) continue;
      rows.push({
        id: `${e.id}-${s.friendId}`, date: e.date,
        text: `${e.memo ?? e.category}(${s.type === 'iPaid' ? '自分が立て替え' : '友達が立て替え'})`,
        delta: s.type === 'iPaid' ? s.amount : -s.amount,
      });
    }
  }
  for (const r of data.repayments) {
    if (r.friendId !== friend.id) continue;
    rows.push({ id: r.id, date: r.date, text: r.direction === 'paidBack' ? '返した' : '返してもらった', delta: r.direction === 'paidBack' ? r.amount : -r.amount, repaymentId: r.id });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));

  const removeFriend = () => {
    if (!confirm(`${friend.name}を削除しますか?(返済の記録も消えます。支出の記録は残ります)`)) return;
    update((d) => ({ ...d, friends: d.friends.filter((f) => f.id !== friend.id), repayments: d.repayments.filter((r) => r.friendId !== friend.id) }));
    onClose();
  };

  return (
    <Modal title={`${friend.name}との履歴`} onClose={onClose}>
      <ul className="list">
        {rows.length === 0 && <li className="empty">履歴はありません</li>}
        {rows.map((r) => (
          <li key={r.id}>
            <div className="row">
              <span className="date">{r.date.slice(5).replace('-', '/')}</span>
              <span className="grow">{r.text}</span>
              <span className={r.delta < 0 ? 'num owe' : 'num lent'}>{r.delta > 0 ? '+' : '−'}{formatYen(Math.abs(r.delta))}</span>
              {r.repaymentId && (
                <button className="icon-btn" aria-label="削除" onClick={() => update((d) => ({ ...d, repayments: d.repayments.filter((x) => x.id !== r.repaymentId) }))}>×</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="note">+ は貸し(返してもらう)、− は借り(返す)方向です</p>
      <div className="actions"><button className="btn danger" onClick={removeFriend}>この友達を削除</button></div>
    </Modal>
  );
}
