import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { expensesInMonth } from '../lib/calc';
import { addMonths, formatYm, today, ymOf } from '../lib/date';
import { formatYen, uid } from '../lib/format';
import type { Expense, Friend, Settlement } from '../types';
import { Modal } from '../components/Modal';

export function Expenses() {
  const { data, update } = useStore();
  const [ym, setYm] = useState(ymOf(today()));
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const list = expensesInMonth(data.expenses, ym).sort((a, b) => b.date.localeCompare(a.date));
  const total = list.reduce((s, e) => s + e.amount, 0);
  const friendName = (id: string) => data.friends.find((f) => f.id === id)?.name ?? '(削除済み)';

  const save = (e: Expense, newFriends: Friend[]) => {
    update((d) => ({
      ...d,
      friends: [...d.friends, ...newFriends],
      expenses: d.expenses.some((x) => x.id === e.id) ? d.expenses.map((x) => (x.id === e.id ? e : x)) : [...d.expenses, e],
    }));
    setYm(ymOf(e.date));
    setEditing(null);
  };

  return (
    <div className="page">
      <div className="month-nav">
        <button className="icon-btn" onClick={() => setYm(addMonths(ym, -1))} aria-label="前の月">‹</button>
        <h1>{formatYm(ym)}の記録</h1>
        <button className="icon-btn" onClick={() => setYm(addMonths(ym, 1))} aria-label="次の月">›</button>
      </div>
      <div className="toolbar">
        <div>単発支出 <b className="num">{formatYen(total)}</b>({list.length}件)</div>
        <button className="btn primary" onClick={() => setEditing('new')}>+ 記録する</button>
      </div>
      {list.length === 0 && <p className="empty">この月の記録はまだありません</p>}
      <ul className="card list expenses">
        {list.map((e) => (
          <li key={e.id} onClick={() => setEditing(e)} className="clickable">
            <div className="row">
              <span className="date">{Number(e.date.slice(5, 7))}/{Number(e.date.slice(8))}</span>
              <span className="grow">
                <span className="chip">{e.category}</span> {e.memo}
              </span>
              <b className="num">{formatYen(e.amount)}</b>
            </div>
            {e.settlements?.length ? (
              <div className="settle">
                {e.settlements.map((s) => (
                  <span key={s.friendId} className={s.type === 'friendPaid' ? 'owe' : 'lent'}>
                    {s.type === 'friendPaid' ? `${friendName(s.friendId)}が立て替え(借り ${formatYen(s.amount)})` : `${friendName(s.friendId)}に貸し ${formatYen(s.amount)}`}
                  </span>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <button className="fab" onClick={() => setEditing('new')} aria-label="支出を記録">+</button>

      {editing && (
        <ExpenseForm
          initial={editing === 'new' ? undefined : editing}
          categories={data.settings.categories}
          friends={data.friends}
          onClose={() => setEditing(null)}
          onSave={save}
          onDelete={(id) => {
            if (!confirm('この記録を削除しますか?')) return;
            update((d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== id) }));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

type PayMode = 'self' | 'iPaid' | 'friendPaid';

function ExpenseForm({ initial, categories, friends, onSave, onClose, onDelete }: {
  initial?: Expense;
  categories: string[];
  friends: Friend[];
  onSave: (e: Expense, newFriends: Friend[]) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const initMode: PayMode = initial?.settlements?.[0]?.type ?? 'self';
  const [date, setDate] = useState(initial?.date ?? today());
  const [category, setCategory] = useState(initial?.category ?? categories[0] ?? 'その他');
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [mode, setMode] = useState<PayMode>(initMode);
  const [total, setTotal] = useState(String(initial?.total ?? initial?.amount ?? ''));
  const [people, setPeople] = useState('1');
  const [mine, setMine] = useState(initial ? String(initial.amount) : '');
  const [allFriends, setAllFriends] = useState(friends);
  const [newFriends, setNewFriends] = useState<Friend[]>([]);
  const [selected, setSelected] = useState<string[]>(initial?.settlements?.map((s) => s.friendId) ?? []);
  const [newName, setNewName] = useState('');

  const totalN = Number(total) || 0;
  const mineN = mine === '' ? totalN : Number(mine) || 0;
  const others = Math.max(0, totalN - mineN);

  const splitEvenly = () => {
    const n = Math.max(1, Number(people) || 1);
    setMine(String(Math.ceil(totalN / n)));
  };

  const addFriend = () => {
    const name = newName.trim();
    if (!name) return;
    const f = { id: uid(), name };
    setAllFriends([...allFriends, f]);
    setNewFriends([...newFriends, f]);
    setSelected(mode === 'friendPaid' ? [f.id] : [...selected, f.id]);
    setNewName('');
  };

  const toggle = (id: string) => {
    if (mode === 'friendPaid') setSelected([id]);
    else setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  /** iPaid: 自分以外の分を選んだ友達で均等に割る / friendPaid: 自分の負担分をその友達に借りる */
  const settlements: Settlement[] =
    mode === 'self' || selected.length === 0
      ? []
      : mode === 'friendPaid'
        ? [{ friendId: selected[0], type: 'friendPaid', amount: mineN }]
        : selected.map((id, i) => {
            const base = Math.floor(others / selected.length);
            return { friendId: id, type: 'iPaid' as const, amount: base + (i < others - base * selected.length ? 1 : 0) };
          });

  const invalid = totalN <= 0 || mineN < 0 || mineN > totalN || (mode !== 'self' && selected.length === 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    onSave(
      {
        id: initial?.id ?? uid(),
        date,
        amount: mineN,
        total: totalN !== mineN ? totalN : undefined,
        category,
        memo: memo.trim() || undefined,
        settlements: settlements.length ? settlements : undefined,
      },
      newFriends,
    );
  };

  return (
    <Modal title={initial ? '記録を編集' : '支出を記録'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="grid2">
          <label>日付<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>カテゴリ
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <label>お会計の合計(円)
          <input required type="number" inputMode="numeric" min="1" value={total} autoFocus={!initial}
            onChange={(e) => setTotal(e.target.value)} />
        </label>
        <div className="grid2 align-end">
          <label>人数<input type="number" min="1" inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value)} /></label>
          <button type="button" className="btn" onClick={splitEvenly}>割り勘する</button>
        </div>
        <label>自分の負担額(円)
          <input type="number" inputMode="numeric" min="0" value={mine} placeholder={total || '合計と同じ'} onChange={(e) => setMine(e.target.value)} />
        </label>

        <fieldset>
          <legend>誰が払った?</legend>
          <div className="seg">
            {([['self', '自分の分だけ'], ['iPaid', '自分が立て替え'], ['friendPaid', '友達が立て替え']] as const).map(([v, l]) => (
              <button type="button" key={v} className={mode === v ? 'on' : ''}
                onClick={() => { setMode(v); if (v === 'friendPaid') setSelected(selected.slice(0, 1)); }}>{l}</button>
            ))}
          </div>
          {mode !== 'self' && (
            <>
              <p className="note">{mode === 'iPaid' ? '立て替えた相手(複数選べます)' : '払ってくれた友達'}</p>
              <div className="chips">
                {allFriends.map((f) => (
                  <button type="button" key={f.id} className={selected.includes(f.id) ? 'chip on' : 'chip'} onClick={() => toggle(f.id)}>{f.name}</button>
                ))}
              </div>
              <div className="grid2 align-end">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="友達を追加"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFriend(); } }} />
                <button type="button" className="btn" onClick={addFriend}>追加</button>
              </div>
              {settlements.length > 0 && (
                <div className="preview">
                  {settlements.map((s) => (
                    <div key={s.friendId}>
                      {allFriends.find((f) => f.id === s.friendId)?.name}:
                      {s.type === 'iPaid' ? ` 貸し ${formatYen(s.amount)}` : ` 借り ${formatYen(s.amount)}`}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </fieldset>

        <label>メモ<input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="例: 焼肉 / 店名など" /></label>
        {mineN > totalN && <p className="error">自分の負担額が合計を超えています</p>}
        <div className="actions">
          {initial && <button type="button" className="btn danger" onClick={() => onDelete(initial.id)}>削除</button>}
          <button type="submit" className="btn primary" disabled={invalid}>保存({formatYen(mineN)}を支出に計上)</button>
        </div>
      </form>
    </Modal>
  );
}
