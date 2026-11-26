import { useEffect, useRef, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { borrowedOf, categoryBreakdown, countedInMonths, expensesInMonths, paymentBreakdown, sortGroups, NO_PAYMENT_LABEL, type CategoryGroup, type LedgerItem } from '../lib/calc';
import { today, ymOf } from '../lib/date';
import { formatYen, uid } from '../lib/format';
import type { Expense, Friend, Settlement } from '../types';
import { Modal } from '../components/Modal';
import { SubIcon } from '../components/SubIcon';
import { PeriodNav, usePeriod } from '../components/PeriodNav';
import { statements, type Statement } from '../lib/card';
import { frequentShops, guessShopCategory, matchPayment, type FrequentShop, type PayDraft } from '../lib/quickadd';

type View = 'category' | 'date' | 'payment';
const VIEWS: [View, string][] = [['category', '分類別'], ['date', '日付順'], ['payment', '支払い別']];
const VIEW_KEY = 'kakeibo.expenses.view';
const loadView = (): View => {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'date' || v === 'payment' ? v : 'category';
  } catch { return 'category'; }
};
const BASIS_KEY = 'kakeibo.expenses.payBasis';
const loadBasis = (): 'use' | 'withdraw' => {
  try { return localStorage.getItem(BASIS_KEY) === 'withdraw' ? 'withdraw' : 'use'; } catch { return 'use'; }
};
/** 引き落としは先の予定も見たいので、今年でも12ヶ月すべて */
const allMonthsOf = (year: number) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;

export function Expenses({ goSettings, draft, clearDraft, formRequested, clearFormRequest }: {
  goSettings: () => void;
  draft?: PayDraft | null;
  clearDraft?: () => void;
  formRequested?: boolean;
  clearFormRequest?: () => void;
}) {
  const { data, update, cloud } = useStore();
  const [period, actions] = usePeriod();
  const [editing, setEditingState] = useState<Expense | 'new' | null>(draft || formRequested ? 'new' : null);
  // ホームの「+」や、アプリを開いたときの合図で記録画面を開く (別の記録を編集中なら邪魔しない)。合図は一度で消す
  useEffect(() => {
    if (!formRequested) return;
    setEditingState((cur) => cur ?? 'new');
    clearFormRequest?.();
  }, [formRequested]); // eslint-disable-line react-hooks/exhaustive-deps
  const setEditing = (v: Expense | 'new' | null) => {
    if (v === null) clearDraft?.();
    setEditingState(v);
  };
  const [view, setViewState] = useState<View>(loadView);
  const setView = (v: View) => {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* 保存できなくても表示は切り替える */ }
  };
  const months = period.months;
  const isYear = period.kind === 'year';
  const groups = sortGroups(categoryBreakdown(data, months), data.settings.categories);
  const payGroups = paymentBreakdown(data, months);
  const periodTotal = groups.reduce((s, g) => s + g.amount, 0);
  const list = expensesInMonths(data.expenses, months).sort((a, b) => b.date.localeCompare(a.date));
  // 友達が立て替えてくれた分は返したときに数えるので、記録の合計ではなく数える額の合計
  const counted = countedInMonths(data, months);
  const total = counted.reduce((s, c) => s + c.amount, 0);
  const repaidTotal = counted.filter((c) => c.repaid).reduce((s, c) => s + c.amount, 0);
  const friendName = (id: string) => data.friends.find((f) => f.id === id)?.name ?? '(削除済み)';
  const [payBasis, setPayBasisState] = useState<'use' | 'withdraw'>(loadBasis);
  const setPayBasis = (v: 'use' | 'withdraw') => {
    setPayBasisState(v);
    try { localStorage.setItem(BASIS_KEY, v); } catch { /* 保存できなくても切り替える */ }
  };
  const hasRules = Object.keys(data.settings.cardRules ?? {}).length > 0;
  const stmts = view === 'payment' && payBasis === 'withdraw' ? statements(data, isYear ? allMonthsOf(period.year) : months, today()) : [];
  const yearCards = [...new Set(stmts.map((s) => s.card))].map((card) => ({ card, list: stmts.filter((s) => s.card === card) }));
  const lastPayment = [...data.expenses].sort((a, b) => b.date.localeCompare(a.date)).find((e) => e.payment)?.payment;

  const save = (e: Expense, newFriends: Friend[]) => {
    update((d) => ({
      ...d,
      friends: [...d.friends, ...newFriends],
      expenses: d.expenses.some((x) => x.id === e.id) ? d.expenses.map((x) => (x.id === e.id ? e : x)) : [...d.expenses, e],
    }));
    if (!isYear) actions.setYm(ymOf(e.date));
    // 受け取り箱から開いた支払いなら、記録したので受け取り箱から消す
    if (editing === 'new' && draft?.inboxId != null) cloud.removeInbox(draft.inboxId);
    setEditing(null);
  };

  return (
    <div className="page">
      <PeriodNav period={period} actions={actions} suffix="の記録" />
      <div className="seg view-toggle" role="tablist">
        {VIEWS.map(([v, l]) => (
          <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{l}</button>
        ))}
      </div>

      {view === 'category' && (
        <>
          <div className="toolbar">
            <div>合計 <b className="num">{formatYen(periodTotal)}</b></div>
            <button className="btn primary" onClick={() => setEditing('new')}>+ 記録する</button>
          </div>
          {groups.length > 1 && (
            <div className="sort-row">
              <span className="muted">設定の分類の順に並んでいます</span>
              <button className="link small-link" onClick={goSettings}>順番を変える</button>
            </div>
          )}
          {groups.length === 0 && <p className="empty">この期間の記録はまだありません</p>}
          {groups.map((g) => (
            <CategoryCard key={`${period.label}-${g.category}`} group={g} share={periodTotal > 0 ? g.amount / periodTotal : 0} onEdit={setEditing}
              multi={isYear} defaultOpen={!isYear} />
          ))}
          {groups.some((g) => g.items.some((i) => i.kind === 'sub')) && <p className="note">サブスクの編集はサブスクのタブから</p>}
        </>
      )}

      {view === 'payment' && (
        <>
          <div className="seg two small pay-basis">
            <button className={payBasis === 'use' ? 'on' : ''} aria-pressed={payBasis === 'use'} onClick={() => setPayBasis('use')}>使った月</button>
            <button className={payBasis === 'withdraw' ? 'on' : ''} aria-pressed={payBasis === 'withdraw'} onClick={() => setPayBasis('withdraw')}>引き落とし日</button>
          </div>
          {payBasis === 'use' ? (
            <>
              <div className="toolbar">
                <div>支払い方法別 <b className="num">{formatYen(periodTotal)}</b></div>
                <button className="btn primary" onClick={() => setEditing('new')}>+ 記録する</button>
              </div>
              {payGroups.length === 0 && <p className="empty">この期間の記録はまだありません</p>}
              {payGroups.map((g) => (
                <CategoryCard key={`${period.label}-${g.category}`} group={g} share={periodTotal > 0 ? g.amount / periodTotal : 0} onEdit={setEditing}
                  multi={isYear} defaultOpen={false} showCategory />
              ))}
              {payGroups.length > 0 && (
                <p className="note">
                  サブスクの分も含めた、カードごとの合計です。{payGroups.some((g) => g.category === NO_PAYMENT_LABEL) && '「未設定」は記録やサブスクの編集で支払い方法を選ぶと振り分けられます。'}
                  カードは<button className="link small-link" onClick={goSettings}>設定</button>で追加できます
                </p>
              )}
            </>
          ) : (
            <>
              <div className="toolbar">
                <div>{isYear ? `${period.year}年` : 'この月'}の引き落とし <b className="num">{formatYen(stmts.reduce((s, x) => s + x.amount, 0))}</b></div>
              </div>
              {!hasRules && (
                <p className="empty">
                  <button className="link" onClick={goSettings}>設定</button>の「支払い方法」でカードの締め日と支払日を入れると、引き落とし額が出ます
                </p>
              )}
              {hasRules && stmts.length === 0 && <p className="empty">この期間の引き落としはありません</p>}
              {isYear
                ? yearCards.map((c) => <YearCardSummary key={c.card} card={c.card} list={c.list} />)
                : stmts.map((st) => <StatementCard key={`${st.card}-${st.payDate}`} st={st} onEdit={setEditing} />)}
              {hasRules && stmts.length > 0 && (
                <p className="note">利用日と締め日から計算した額です。サブスクは請求日に全額で数えます。実際の請求額はカード会社の明細で確認してください</p>
              )}
            </>
          )}
        </>
      )}

      {view === 'date' && (
        <>
          <div className="toolbar">
            <div>
              記録した支出 <b className="num">{formatYen(total)}</b>({list.length}件)
              {repaidTotal > 0 && <small className="muted"> 友達に返した立て替え {formatYen(repaidTotal)} を含む</small>}
            </div>
            <button className="btn primary" onClick={() => setEditing('new')}>+ 記録する</button>
          </div>
          {list.length === 0 && <p className="empty">この期間の記録はまだありません</p>}
          {list.length > 0 && (
            <ul className="card list expenses">
              {list.map((e) => (
                <li key={e.id} onClick={() => setEditing(e)} className="clickable">
                  <div className="row">
                    <span className="date">{md(e.date)}</span>
                    <span className="grow">
                      <span className="chip">{e.category}</span> {e.memo}
                      {e.payment && <small> · {e.payment}</small>}
                    </span>
                    <b className={borrowedOf(e) >= e.amount ? 'num muted' : 'num'}>{formatYen(e.amount)}</b>
                  </div>
                  <SettleLine expense={e} friendName={friendName} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <button className="fab" onClick={() => setEditing('new')} aria-label="支出を記録">+</button>

      {editing && (
        <ExpenseForm
          initial={editing === 'new' ? undefined : editing}
          draft={editing === 'new' && draft ? {
            amount: draft.amount,
            date: draft.date,
            memo: draft.shop,
            payment: matchPayment(draft.card, data.settings.paymentMethods),
            category: guessShopCategory(draft.shop, data.expenses, data.settings.categories),
          } : undefined}
          categories={data.settings.categories}
          shops={editing === 'new' ? frequentShops(data.expenses, today()) : []}
          payments={data.settings.paymentMethods}
          defaultPayment={lastPayment}
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
          {s.type === 'friendPaid' ? `${friendName(s.friendId)}が立て替え(借り ${formatYen(s.amount)}・返したときに計上)` : `${friendName(s.friendId)}に貸し ${formatYen(s.amount)}`}
        </span>
      ))}
    </div>
  );
}

/** 分類1つ分: 見出しに合計・割合・予算の残り、下にいつ何に払ったかの明細 */
function CategoryCard({ group, share, onEdit, multi, defaultOpen, showCategory }: {
  group: CategoryGroup;
  share: number;
  onEdit: (e: Expense) => void;
  multi: boolean; // 複数月 (年表示)
  defaultOpen: boolean;
  showCategory?: boolean; // 明細に分類も出す (支払い別のとき)
}) {
  const [open, setOpen] = useState(defaultOpen);
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
          {group.items.map((item, i) => (
            <LedgerRow key={item.kind === 'sub' ? `s-${item.sub.id}` : `${item.expense.id}-${i}`} item={item} onEdit={onEdit} multi={multi} showCategory={showCategory} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LedgerRow({ item, onEdit, multi, showCategory }: { item: LedgerItem; onEdit: (e: Expense) => void; multi: boolean; showCategory?: boolean }) {
  if (item.kind === 'sub') {
    const s = item.sub;
    return (
      <li className="row">
        <span className="date">{multi ? `${item.count}回` : item.date ? md(item.date) : '月割'}</span>
        <SubIcon name={s.name} domain={s.domain} size={22} />
        <span className="grow ellipsis">
          {s.name}
          {s.currency === 'USD' ? <small> ${s.amount}</small> : s.cycle === 'yearly' && <small> 年払い {formatYen(s.amount)}</small>}
        </span>
        <span className="num">{item.estimate && <small>約</small>}{formatYen(item.amount)}</span>
      </li>
    );
  }
  const e = item.expense;
  return (
    <li className="row clickable" onClick={() => onEdit(e)}>
      <span className="date">{md(item.date)}</span>
      <span className="grow ellipsis">
        {showCategory && <span className="chip">{e.category}</span>} {e.memo || (showCategory ? '' : <span className="muted">(メモなし)</span>)}
        {item.repaid
          ? <small> 返済分({md(e.date)}の立て替え)</small>
          : e.settlements?.length ? <small> {e.settlements[0].type === 'friendPaid' ? '立て替えてもらった' : '立て替えた'}</small> : null}
      </span>
      <span className="num">{formatYen(item.amount)}</span>
    </li>
  );
}

/** カード1枚の1回分の引き落とし */
function StatementCard({ st, onEdit }: { st: Statement; onEdit: (e: Expense) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card cat-card">
      <button className="cat-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="grow">
          <span className="cat-name">{st.card}{st.open && <span className="chip estimate">見込み</span>}</span>
          <span className="cat-meta">{md(st.payDate)} 引き落とし · {md(st.closeDate)} 締め · {st.items.length}件</span>
        </span>
        <b className="num cat-total">{formatYen(st.amount)}</b>
        <span className="chev" aria-hidden>{open ? '⌃' : '⌄'}</span>
      </button>
      {open && (
        <ul className="list cat-items">
          {st.items.map((item) => (
            <LedgerRow key={item.kind === 'sub' ? `s-${item.sub.id}-${item.date}` : item.expense.id} item={item} onEdit={onEdit} multi={false} showCategory />
          ))}
        </ul>
      )}
    </section>
  );
}

/** 年表示: カードごとに、月ごとの引き落とし額を並べる */
function YearCardSummary({ card, list }: { card: string; list: Statement[] }) {
  const total = list.reduce((s, x) => s + x.amount, 0);
  return (
    <section className="card cat-card">
      <div className="cat-head">
        <span className="grow">
          <span className="cat-name">{card}</span>
          <span className="cat-meta">{list.length}回の引き落とし</span>
        </span>
        <b className="num cat-total">{formatYen(total)}</b>
      </div>
      <ul className="list cat-items">
        {list.map((st) => (
          <li key={st.payDate} className="row">
            <span className="date">{md(st.payDate)}</span>
            <span className="grow">{st.items.length}件{st.open && <span className="chip estimate">見込み</span>}</span>
            <span className="num">{formatYen(st.amount)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

type PayMode = 'self' | 'iPaid' | 'friendPaid';

function ExpenseForm({ initial, draft, categories, shops, payments, defaultPayment, friends, onSave, onClose, onDelete }: {
  initial?: Expense;
  /** ショートカットから開いたときの入力済みの値 */
  draft?: Partial<Expense>;
  categories: string[];
  /** よく使うメモ (新しく記録するときだけ) */
  shops: FrequentShop[];
  payments: string[];
  defaultPayment?: string;
  friends: Friend[];
  onSave: (e: Expense, newFriends: Friend[]) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const { cloud } = useStore();
  // ホーム画面のアプリではなく Safari で開いていて、同期もしていない (ホーム画面のアプリに記録が届かない)
  const standalone = (navigator as { standalone?: boolean }).standalone || matchMedia('(display-mode: standalone)').matches;
  const unsynced = !standalone && (cloud.status === 'signedOut' || cloud.status === 'disabled');
  const initMode: PayMode = initial?.settlements?.[0]?.type ?? 'self';
  const [date, setDate] = useState(initial?.date ?? draft?.date ?? today());
  const [category, setCategory] = useState(initial?.category ?? draft?.category ?? categories[0] ?? 'その他');
  const [memo, setMemo] = useState(initial?.memo ?? draft?.memo ?? '');
  const [payment, setPayment] = useState(initial ? initial.payment ?? '' : draft?.payment ?? (defaultPayment && payments.includes(defaultPayment) ? defaultPayment : ''));
  const [mode, setMode] = useState<PayMode>(initMode);
  const amountRef = useRef<HTMLInputElement>(null);
  const [mine, setMine] = useState(initial ? String(initial.amount) : draft?.amount ? String(draft.amount) : '');
  const [total, setTotal] = useState(initial?.total != null ? String(initial.total) : '');
  const [allFriends, setAllFriends] = useState(friends);
  const [newFriends, setNewFriends] = useState<Friend[]>([]);
  const [selected, setSelected] = useState<string[]>(initial?.settlements?.map((s) => s.friendId) ?? []);
  const [newName, setNewName] = useState('');
  const [showFriends, setShowFriends] = useState(initMode !== 'self');

  const mineN = Number(mine) || 0;
  // 自分が立て替えたときだけ、お会計の合計を聞く (自分の分を除いた額を友達への貸しにする)
  const totalN = mode === 'iPaid' ? Number(total) || 0 : mineN;
  const others = Math.max(0, totalN - mineN);

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

  /** iPaid: 自分以外の分を選んだ友達で均等に分ける / friendPaid: 自分の負担分をその友達に借りる */
  const settlements: Settlement[] =
    mode === 'self' || selected.length === 0
      ? []
      : mode === 'friendPaid'
        ? [{ friendId: selected[0], type: 'friendPaid', amount: mineN }]
        : selected.map((id, i) => {
            const base = Math.floor(others / selected.length);
            return { friendId: id, type: 'iPaid' as const, amount: base + (i < others - base * selected.length ? 1 : 0) };
          });

  const invalid = mineN < 0 || (mode !== 'iPaid' && mineN <= 0) || (mode === 'iPaid' && totalN < mineN) || (mode !== 'self' && selected.length === 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    onSave(
      {
        id: initial?.id ?? uid(),
        date,
        amount: mineN,
        total: mode === 'iPaid' && totalN !== mineN ? totalN : undefined,
        category,
        memo: memo.trim() || undefined,
        payment: payment || undefined,
        settlements: settlements.length ? settlements : undefined,
      },
      newFriends,
    );
  };

  return (
    <Modal title={initial ? '記録を編集' : '支出を記録'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {draft && !draft.amount && <p className="note over">払ったときに金額が届いていなかったので(QUICPay・iD など)、金額を入れてください</p>}
        {draft && <p className="note">Apple Pay の支払いから入力しました。{draft.memo && 'メモにはお店の名前が入っています。'}下の「よく使うメモ」のボタンか手入力で、使ったもの(漫画・ランチなど)に置き換えられます。分類を確かめて保存してください</p>}
        {draft && unsynced && <p className="note over">Safari で開いています。ホーム画面のアプリとはデータが別なので、設定の「クラウド同期」にログインしておくと、ここで保存した記録がアプリにも届きます</p>}
        <label>金額(円){mode === 'iPaid' && '・自分の分'}
          <input ref={amountRef} required type="number" inputMode="numeric" min="0" value={mine} autoFocus={!initial && !draft?.amount} onChange={(e) => setMine(e.target.value)} />
        </label>
        {shops.length > 0 && (
          <div className="field">
            <span className="field-label">{draft ? 'よく使うメモ(タップでメモと分類を置き換えます)' : 'よく使うメモ(タップで分類・支払い方法も入ります)'}</span>
            <div className="chips shop-chips">
              {shops.map((s) => (
                <button type="button" key={s.shop} className={memo === s.shop ? 'chip on' : 'chip'} aria-pressed={memo === s.shop}
                  onClick={() => {
                    setMemo(s.shop);
                    if (categories.includes(s.category)) setCategory(s.category);
                    // Apple Pay から開いたときは、実際に払ったカードのままにする
                    if (!draft) setPayment(s.payment ?? '');
                    amountRef.current?.focus();
                  }}>{s.shop}</button>
              ))}
            </div>
          </div>
        )}
        <div className="grid2">
          <label>日付<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>カテゴリ
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {(categories.includes(category) ? categories : [...categories, category]).map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        {payments.length > 0 && (
          <div className="field">
            <span className="field-label">支払い方法</span>
            <div className="chips">
              {(payment && !payments.includes(payment) ? [...payments, payment] : payments).map((p) => (
                <button type="button" key={p} className={payment === p ? 'chip on' : 'chip'} aria-pressed={payment === p}
                  onClick={() => setPayment(payment === p ? '' : p)}>{p}</button>
              ))}
            </div>
          </div>
        )}
        <label>メモ<input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="例: 漫画 / ランチ / 100均" /></label>

        {!showFriends ? (
          <button type="button" className="link small-link left-align" onClick={() => setShowFriends(true)}>友達と立て替えがあった ›</button>
        ) : (
          <fieldset>
            <legend>立て替え</legend>
            <div className="seg">
              {([['self', 'なし'], ['iPaid', '自分が立て替え'], ['friendPaid', '友達が立て替え']] as const).map(([v, l]) => (
                <button type="button" key={v} className={mode === v ? 'on' : ''}
                  onClick={() => { setMode(v); if (v === 'friendPaid') setSelected(selected.slice(0, 1)); }}>{l}</button>
              ))}
            </div>
            {mode === 'iPaid' && (
              <label>お会計の合計(円)
                <input type="number" inputMode="numeric" min="0" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="友達の分も含めた額" />
              </label>
            )}
            {mode !== 'self' && (
              <>
                <p className="note">{mode === 'iPaid' ? '立て替えた相手(複数選べます)' : '払ってくれた友達(自分の分は、友達に返したときに支出に計上します)'}</p>
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
        )}

        {mode === 'iPaid' && totalN > 0 && totalN < mineN && <p className="error">自分の分がお会計の合計を超えています</p>}
        <div className="actions">
          {initial && <button type="button" className="btn danger" onClick={() => onDelete(initial.id)}>削除</button>}
          <button type="submit" className="btn primary" disabled={invalid}>保存</button>
        </div>
      </form>
    </Modal>
  );
}
