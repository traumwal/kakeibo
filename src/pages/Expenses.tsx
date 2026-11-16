import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { categoryBreakdown, expensesInMonth, sortGroups, type CategoryGroup, type GroupSort, type LedgerItem } from '../lib/calc';
import { addMonths, formatYm, today, ymOf } from '../lib/date';
import { formatYen, uid } from '../lib/format';
import type { Expense, Friend, Settlement } from '../types';
import { Modal } from '../components/Modal';
import { SubIcon } from '../components/SubIcon';

type View = 'category' | 'date';
const VIEW_KEY = 'kakeibo.expenses.view';
const loadView = (): View => {
  try { return localStorage.getItem(VIEW_KEY) === 'date' ? 'date' : 'category'; } catch { return 'category'; }
};
const SORT_KEY = 'kakeibo.expenses.sort';
const SORTS: [GroupSort, string][] = [['custom', '自分の順'], ['count', '回数順'], ['amount', '金額順']];
const loadSort = (): GroupSort => {
  try {
    const v = localStorage.getItem(SORT_KEY);
    return v === 'count' || v === 'amount' ? v : 'custom';
  } catch { return 'custom'; }
};
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;

export function Expenses({ goSettings }: { goSettings: () => void }) {
  const { data, update } = useStore();
  const [ym, setYm] = useState(ymOf(today()));
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const [view, setViewState] = useState<View>(loadView);
  const setView = (v: View) => {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* 保存できなくても表示は切り替える */ }
  };
  const [sort, setSortState] = useState<GroupSort>(loadSort);
  const setSort = (v: GroupSort) => {
    setSortState(v);
    try { localStorage.setItem(SORT_KEY, v); } catch { /* 保存できなくても並びは変える */ }
  };
  const groups = sortGroups(categoryBreakdown(data, ym), sort, data.settings.categories);
  const monthTotal = groups.reduce((s, g) => s + g.amount, 0);
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
      <div className="seg two view-toggle" role="tablist">
        <button role="tab" aria-selected={view === 'category'} className={view === 'category' ? 'on' : ''} onClick={() => setView('category')}>分類別</button>
        <button role="tab" aria-selected={view === 'date'} className={view === 'date' ? 'on' : ''} onClick={() => setView('date')}>日付順</button>
      </div>

      {view === 'category' ? (
        <>
          <div className="toolbar">
            <div>今月の支出 <b className="num">{formatYen(monthTotal)}</b></div>
            <button className="btn primary" onClick={() => setEditing('new')}>+ 記録する</button>
          </div>
          {groups.length > 1 && (
            <div className="sort-row">
              <span className="muted">並び</span>
              <div className="seg three small">
                {SORTS.map(([v, l]) => (
                  <button key={v} className={sort === v ? 'on' : ''} aria-pressed={sort === v} onClick={() => setSort(v)}>{l}</button>
                ))}
              </div>
              {sort === 'custom' && <button className="link small-link" onClick={goSettings}>順番を変える</button>}
            </div>
          )}
          {groups.length === 0 && <p className="empty">この月の記録はまだありません</p>}
          {groups.map((g) => (
            <CategoryCard key={g.category} group={g} share={monthTotal > 0 ? g.amount / monthTotal : 0} onEdit={setEditing} />
          ))}
          {groups.some((g) => g.items.some((i) => i.kind === 'sub')) && (
            <p className="note">サブスクは請求日に計上。年払いは月額に換算(÷12)しています。編集はサブスクのタブから</p>
          )}
        </>
      ) : (
        <>
          <div className="toolbar">
            <div>単発支出 <b className="num">{formatYen(total)}</b>({list.length}件)</div>
            <button className="btn primary" onClick={() => setEditing('new')}>+ 記録する</button>
          </div>
          {list.length === 0 && <p className="empty">この月の記録はまだありません</p>}
          <ul className="card list expenses">
            {list.map((e) => (
              <li key={e.id} onClick={() => setEditing(e)} className="clickable">
                <div className="row">
                  <span className="date">{md(e.date)}</span>
                  <span className="grow">
                    <span className="chip">{e.category}</span> {e.memo}
                  </span>
                  <b className="num">{formatYen(e.amount)}</b>
                </div>
                <SettleLine expense={e} friendName={friendName} />
              </li>
            ))}
          </ul>
        </>
      )}
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

function SettleLine({ expense, friendName }: { expense: Expense; friendName: (id: string) => string }) {
  if (!expense.settlements?.length) return null;
  return (
    <div className="settle">
      {expense.settlements.map((s) => (
        <span key={s.friendId} className={s.type === 'friendPaid' ? 'owe' : 'lent'}>
          {s.type === 'friendPaid' ? `${friendName(s.friendId)}が立て替え(借り ${formatYen(s.amount)})` : `${friendName(s.friendId)}に貸し ${formatYen(s.amount)}`}
        </span>
      ))}
    </div>
  );
}

/** 分類1つ分: 見出しに合計・割合・予算の残り、下にいつ何に払ったかの明細 */
function CategoryCard({ group, share, onEdit }: { group: CategoryGroup; share: number; onEdit: (e: Expense) => void }) {
  const [open, setOpen] = useState(true);
  const { budget, amount } = group;
  const over = budget != null && amount > budget;
  return (
    <section className="card cat-card">
      <button className="cat-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="grow">
          <span className="cat-name">{group.category}</span>
          <span className="cat-meta">
            {group.items.length}件 · {Math.round(share * 100)}%
            {budget != null && (
              <span className={over ? 'over' : ''}> · {over ? `予算を${formatYen(amount - budget)}超過` : `予算の残り ${formatYen(budget - amount)}`}</span>
            )}
          </span>
        </span>
        <b className={over ? 'num cat-total over' : 'num cat-total'}>{formatYen(amount)}</b>
        <span className="chev" aria-hidden>{open ? '⌃' : '⌄'}</span>
      </button>
      {budget != null && (
        <div className="hbar-track cat-bar">
          <div className={over ? 'hbar-fill over' : 'hbar-fill'} style={{ width: `${Math.min(100, (amount / budget) * 100)}%` }} />
        </div>
      )}
      {open && (
        <ul className="list cat-items">
          {group.items.map((item) => <LedgerRow key={item.kind === 'sub' ? `s-${item.sub.id}` : item.expense.id} item={item} onEdit={onEdit} />)}
        </ul>
      )}
    </section>
  );
}

function LedgerRow({ item, onEdit }: { item: LedgerItem; onEdit: (e: Expense) => void }) {
  if (item.kind === 'sub') {
    const s = item.sub;
    return (
      <li className="row">
        <span className="date">{item.date ? md(item.date) : '月割'}</span>
        <SubIcon name={s.name} domain={s.domain} size={22} />
        <span className="grow ellipsis">{s.name}{s.cycle === 'yearly' && <small> 年払い {formatYen(s.amount)}</small>}</span>
        <span className="num">{formatYen(item.amount)}</span>
      </li>
    );
  }
  const e = item.expense;
  return (
    <li className="row clickable" onClick={() => onEdit(e)}>
      <span className="date">{md(e.date)}</span>
      <span className="grow ellipsis">
        {e.memo || <span className="muted">(メモなし)</span>}
        {e.settlements?.length ? <small> {e.settlements[0].type === 'friendPaid' ? '立て替えてもらった' : '立て替えた'}</small> : null}
      </span>
      <span className="num">{formatYen(e.amount)}</span>
    </li>
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
              {(categories.includes(category) ? categories : [...categories, category]).map((c) => <option key={c}>{c}</option>)}
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
