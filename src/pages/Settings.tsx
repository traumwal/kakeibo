import { useEffect, useRef, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { normalize, SUGGESTED_CATEGORIES } from '../lib/storage';
import { addCategory, moveCategory, moveTo, removeCategory, renameCategory, setCategoryOrder, usageCount, FALLBACK_CATEGORY } from '../lib/categories';
import type { AppData, CardRule } from '../types';
import { dayLabel, ruleLabel } from '../lib/card';
import { today } from '../lib/date';
import { billingDatesUntil } from '../lib/calc';
import { cardRate, fetchRates, isUsd } from '../lib/fx';
import { CloudSync } from '../components/CloudSync';
import { Switch } from '../components/Switch';
import { loadOpenOnLaunch, saveOpenOnLaunch } from '../lib/launch';
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase';
import { getPayToken } from '../lib/inbox';

export function Settings() {
  const { data, update, replace } = useStore();
  const { settings } = data;
  const [newCat, setNewCat] = useState('');
  const [newPay, setNewPay] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const suggestions = SUGGESTED_CATEGORIES.filter((c) => !settings.categories.includes(c));
  const setS = (patch: Partial<typeof settings>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const drag = useDragOrder(settings.categories, (order) => update((d) => setCategoryOrder(d, order)));

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
        <p className="note">左の ≡ を押したまま上下に動かすと並べ替えられます。この順番が記録タブの並び順になり、上にあるものほど記録するときに選びやすくなります。名前をタップすると変更できます(記録の分類も一緒に変わります)。予算を入れると、超えたときに赤く表示されます</p>
        <ul className="list cat-settings" ref={drag.listRef}>
          {drag.order.map((c) => (
            <CategoryRow key={c} name={c} data={data} dragging={drag.dragging === c} onHandleDown={(e) => drag.start(c, e)}
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
        <h2>毎月の支出の目安</h2>
        <p className="note">ホームのグラフの目盛りと目安の線は、この額を基準にします(2万円なら 1万・2万・3万…)</p>
        <div className="row target-input">
          <input type="number" inputMode="numeric" min="0" step="1000" value={settings.monthlyTarget || ''} placeholder="20000"
            onChange={(e) => setS({ monthlyTarget: Number(e.target.value) || 0 })} />
          <span>円 / 月</span>
        </div>
      </section>

      <section className="card">
        <h2>支払い方法</h2>
        <p className="note">クレジットカードなどを登録すると、記録タブの「支払い別」でカードごとの合計がわかります。カードの締め日と支払日を入れると、引き落とし額も出ます</p>
        <ul className="list cat-settings">
          {settings.paymentMethods.map((p) => (
            <PaymentRow key={p} name={p} rule={settings.cardRules?.[p]}
              onRule={(r) => {
                const cardRules = { ...(settings.cardRules ?? {}) };
                if (r) cardRules[p] = r;
                else delete cardRules[p];
                setS({ cardRules });
              }}
              onRemove={() => {
                if (!confirm(`「${p}」を一覧から消しますか?(記録やサブスクに付けた支払い方法はそのまま残ります)`)) return;
                const cardRules = { ...(settings.cardRules ?? {}) };
                delete cardRules[p];
                setS({ paymentMethods: settings.paymentMethods.filter((x) => x !== p), cardRules });
              }} />
          ))}
        </ul>
        <form className="toolbar" onSubmit={(e) => {
          e.preventDefault();
          const v = newPay.trim();
          if (v && !settings.paymentMethods.includes(v)) setS({ paymentMethods: [...settings.paymentMethods, v] });
          setNewPay('');
        }}>
          <input value={newPay} onChange={(e) => setNewPay(e.target.value)} placeholder="例: 楽天カード" />
          <button className="btn">追加</button>
        </form>
      </section>

      <section className="card">
        <h2>サブスクの見直し基準</h2>
        <div className="form">
          <label>最後に「使った」を押してからこの日数がたったら(日)
            <input type="number" min="1" value={settings.reviewUnusedDays} onChange={(e) => setS({ reviewUnusedDays: Number(e.target.value) })} />
          </label>
        </div>
        <p className="note">「ほぼ使わない」にしたサブスクも見直し候補になります</p>
      </section>

      <section className="card">
        <h2>集計のしかた</h2>
        <div className="form">
          <div className="field">
            <span className="field-label">年払いのサブスク</span>
            <div className="seg two">
              <button type="button" className={settings.yearlyMode === 'spread' ? 'on' : ''} aria-pressed={settings.yearlyMode === 'spread'}
                onClick={() => setS({ yearlyMode: 'spread' })}>毎月に分ける(÷12)</button>
              <button type="button" className={settings.yearlyMode === 'billing' ? 'on' : ''} aria-pressed={settings.yearlyMode === 'billing'}
                onClick={() => setS({ yearlyMode: 'billing' })}>請求した月にまとめる</button>
            </div>
          </div>
        </div>
        <details className="rules">
          <summary>集計のくわしいルール</summary>
          <ul>
            <li>支出は「サブスク・固定費」と「日々の支出」(記録タブで記録したもの)に分けて集計します</li>
            <li>サブスクにも分類(何に使っているか)を付けられます。カテゴリ別では、定期券なら「交通」のように、その分類の中に固定費として入ります(色で分けて表示)。分類の予算にも含まれます。分類を選んでいないサブスクは名前から分類を推測し(「〇〇定期」なら交通)、推測できないものは「サブスク・固定費」にまとめます</li>
            <li>年払いのサブスクは、上の設定に応じて毎月 1/12 ずつ、または請求した月にまとめて計上します。毎月に分けると月ごとの比較がしやすく、まとめると実際にお金が出ていく月がわかります</li>
            <li>サブスクは最初に払った月から計上します。スイッチをオフにした月までは計上し、翌月からは計上しません。あとでオンに戻しても、オフだった月は計上されません</li>
            <li>サブスクを削除すると、過去の月の集計からも消えます</li>
            <li>年の集計は、今年なら今月までです(先の月のサブスクを見込みで足しません)。前年比は前年の同じ月までと比べます</li>
            <li>友達と立て替えた支出は、自分の分だけを支出として計上します。友達が立て替えてくれた分も、その日の支出として計上し、同じ額を「借り」として記録します</li>
            <li>クレジットカードの引き落とし額は、締め日までの利用を締め日の翌月(または翌々月)の支払日にまとめます。サブスクは実際の請求日に全額で数えます(年払いの「毎月に分ける」設定とは関係ありません)。友達が立て替えた分は含めず、自分が立て替えた分はお会計の合計で数えます。締め日前のものは「見込み」です</li>
            <li>ドルのサブスクは、請求日の公表レートに海外手数料を足して円にし、円未満は切り捨てます。まだレートが出ていない請求(今日・先の予定)は今のレートで見込みにし、日がたつと請求日のレートで確定します。サブスクの詳細画面でカードの明細の額を入れると、その額を使います</li>
            <li>カテゴリの予算は月の予算です。年で見るときは12倍(今年は今月までの月数倍)で比べます</li>
          </ul>
        </details>
      </section>

      <LaunchSection />

      <ShortcutSection />

      <FxSection />

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

/** つまみを押したまま上下に動かして並べ替える。動かしている間は見た目だけ入れ替え、離したときに保存する */
function useDragOrder(items: string[], onDrop: (order: string[]) => void) {
  const listRef = useRef<HTMLUListElement>(null);
  const [state, setState] = useState<{ name: string; order: string[] } | null>(null);
  const ref = useRef(state);
  ref.current = state;
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  useEffect(() => {
    if (!state) return;
    const move = (e: PointerEvent) => {
      const s = ref.current;
      const rows = listRef.current ? [...listRef.current.children] as HTMLElement[] : [];
      if (!s || rows.length !== s.order.length) return;
      e.preventDefault();
      // 動かしている行以外で、真ん中が指より上にある行の数 = 入れる位置
      const at = rows.filter((r, i) => s.order[i] !== s.name && r.getBoundingClientRect().top + r.offsetHeight / 2 < e.clientY).length;
      const order = moveTo(s.order, s.name, at);
      if (order.join('\n') !== s.order.join('\n')) setState({ ...s, order });
    };
    const end = () => {
      const s = ref.current;
      setState(null);
      if (s && s.order.join('\n') !== items.join('\n')) dropRef.current(s.order);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [state != null, items]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    listRef,
    order: state?.order ?? items,
    dragging: state?.name ?? null,
    start: (name: string, e: React.PointerEvent) => {
      e.preventDefault();
      setState({ name, order: items });
    },
  };
}

function CategoryRow({ name, data, dragging, onHandleDown, onlyOne, update }: {
  name: string;
  data: AppData;
  dragging: boolean;
  onHandleDown: (e: React.PointerEvent) => void;
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
    const msg = n > 0 ? `「${name}」を削除します。この分類の記録・サブスク${n}件は「${target}」に移ります。` : `「${name}」を削除しますか?`;
    if (confirm(msg)) update((d) => removeCategory(d, name));
  };

  return (
    <li className={dragging ? 'row dragging' : 'row'}>
      <button type="button" className="drag-handle" aria-label={`${name}を並べ替え(上下の矢印キーでも動かせます)`} onPointerDown={onHandleDown}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            update((d) => moveCategory(d, name, e.key === 'ArrowUp' ? -1 : 1));
          }
        }}>≡</button>
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

const DAYS = [...Array.from({ length: 28 }, (_, i) => i + 1), 31];

/** 支払い方法1つ分。カードなら締め日・支払日を設定できる */
function PaymentRow({ name, rule, onRule, onRemove }: {
  name: string;
  rule?: CardRule;
  onRule: (r: CardRule | undefined) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const r = rule ?? { closingDay: 31, payDay: 27, payMonths: 1 as const };
  const set = (patch: Partial<CardRule>) => onRule({ ...r, ...patch });
  return (
    <li className="pay-row">
      <div className="row">
        <button className="link left grow cat-name-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
          {name}
          <small className="pay-rule">{rule ? ruleLabel(rule) : '締め日なし'}</small>
        </button>
        <button className="icon-btn" aria-label={`${name}を削除`} onClick={onRemove}>×</button>
      </div>
      {open && (
        <div className="pay-edit">
          {!rule ? (
            <button className="btn small" onClick={() => onRule(r)}>締め日・支払日を設定する(クレジットカード)</button>
          ) : (
            <>
              <div className="pay-fields">
                <label>締め日
                  <select value={r.closingDay} onChange={(e) => set({ closingDay: Number(e.target.value) })}>
                    {DAYS.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
                  </select>
                </label>
                <label>引き落とし
                  <select value={r.payMonths} onChange={(e) => set({ payMonths: Number(e.target.value) as 1 | 2 })}>
                    <option value={1}>翌月</option>
                    <option value={2}>翌々月</option>
                  </select>
                </label>
                <label>支払日
                  <select value={r.payDay} onChange={(e) => set({ payDay: Number(e.target.value) })}>
                    {DAYS.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
                  </select>
                </label>
              </div>
              <button className="link small-link" onClick={() => onRule(undefined)}>締め日の設定をやめる(現金など)</button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

/** ドル円の換算。レートは自動で取ってくるので、ふだんは手数料だけ合わせればよい */
/** アプリを開いたらすぐ記録画面を出す (端末ごとの設定) */
function LaunchSection() {
  const [on, setOn] = useState(loadOpenOnLaunch);
  return (
    <section className="card">
      <div className="row">
        <h2 className="grow">開いたらすぐ記録</h2>
        <Switch on={on} onChange={() => { saveOpenOnLaunch(!on); setOn(!on); }} label="アプリを開いたらすぐ記録画面を出す" />
      </div>
      <p className="note">オンにすると、アプリを開いたとき(1分以上使っていなかったあとに戻ってきたときも)に記録画面が出ます。払ったあとすぐ記録したいときに便利です。この端末だけの設定です</p>
    </section>
  );
}

/** 値を表示してコピーできる1行 */
function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('これをコピーしてください', value);
    }
  };
  return (
    <div className="row shortcut-url">
      <span className="shortcut-label">{label}</span>
      <code className="grow ellipsis">{value}</code>
      <button type="button" className="btn small" onClick={copy}>{copied ? 'コピーしました' : 'コピー'}</button>
    </div>
  );
}

/** iPhone のショートカットで、Apple Pay で払ったときに記録する設定の手順 */
function ShortcutSection() {
  const { cloud } = useStore();
  const [token, setToken] = useState<string | null>(null);
  const [tokenErr, setTokenErr] = useState<string | null>(null);
  const [test, setTest] = useState<string | null>(null);
  const signedIn = !!supabase && !!cloud.email;

  useEffect(() => {
    if (!supabase || !cloud.email) {
      setToken(null);
      return;
    }
    getPayToken(supabase).then(
      (t) => { setToken(t); setTokenErr(null); },
      () => setTokenErr('合言葉を作れませんでした。Supabase の SQL Editor で supabase/schema.sql の「受け取り箱」の部分をまだ実行していなければ、実行してください'),
    );
  }, [cloud.email]);

  const renew = async () => {
    if (!supabase || !confirm('合言葉を作り直しますか?(今のショートカットの合言葉は使えなくなるので、入れ直してください)')) return;
    try {
      setToken(await getPayToken(supabase, true));
    } catch {
      setTokenErr('作り直せませんでした');
    }
  };

  const endpoint = supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/kakeibo_pay` : '';
  /** ショートカットと同じ送り方で、受け取り箱に送ってみる */
  const sendTest = async () => {
    if (!token || !supabaseAnonKey) return;
    setTest('送信中…');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { apikey: supabaseAnonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pay: '¥1,200\nスターバックス(テスト)\nJCB' }),
      });
      if (!res.ok) throw new Error(String(res.status));
      cloud.syncNow();
      setTest('送りました。ホームに「Apple Pay の支払い」として出ます(× で消せます)');
    } catch {
      setTest('送れませんでした。SQL を実行したか確かめてください');
    }
  };

  return (
    <section className="card">
      <h2>iPhone で支払いと同時に記録</h2>
      <p className="note">
        Apple Pay(ウォレットのカード)で払うと、金額・お店・カードがこのアプリに届くようにできます。iPhone の「ショートカット」アプリで一度だけ設定します。
        ロック中に払っても届き、次にアプリを開くとホームに並ぶので、タップして分類を確かめて保存します
      </p>
      {!supabase && <p className="note over">このビルドではクラウド同期が使えないため、この方法は使えません(下の「Safari で開く方法」を使ってください)</p>}
      {supabase && !signedIn && <p className="note over">上の「クラウド同期」にログインすると、ショートカット用の合言葉がここに出ます</p>}
      {signedIn && (
        <>
          <ol className="steps">
            <li>ショートカットアプリの「オートメーション」で「+」→「ウォレット」を選ぶ</li>
            <li>使うカード(JCB・エポスなど)を選び、「すぐに実行」にして次へ →「新規の空のオートメーション」。Suica・PASMO は選ばないでください(改札を通るたびに動いてしまいます)</li>
            <li>アクション「テキスト」を追加し、3行で「金額」「加盟店」「カード」を入れる(それぞれ「ショートカットの入力」の項目を変数として選ぶ)</li>
            <li>アクション「URLの内容を取得」を追加し、URL に下の「送り先」を貼る</li>
            <li>その「URLの内容を取得」の「&gt;」を開いて、方法を「POST」にする</li>
            <li>「ヘッダ」で「新規ヘッダを追加」→ キーに <code>apikey</code>、値に下の「キー」を貼る</li>
            <li>「本文を要求」を「JSON」にして、「新規フィールドを追加」→「テキスト」を2つ作る。1つ目はキー <code>token</code>・値に下の「合言葉」、2つ目はキー <code>pay</code>・値に手順3の「テキスト」を変数として入れる</li>
            <li>前に作ったオートメーションに「URLエンコード」「URLを開く」があれば消す(ロック中は Safari を開けないため、エラーになります)</li>
          </ol>
          {tokenErr && <p className="error">{tokenErr}</p>}
          {endpoint && <CopyRow label="送り先" value={endpoint} />}
          {supabaseAnonKey && <CopyRow label="キー" value={supabaseAnonKey} />}
          {token && <CopyRow label="合言葉" value={token} />}
          <div className="actions">
            <button type="button" className="btn" disabled={!token} onClick={sendTest}>試しに送る</button>
            <button type="button" className="btn" disabled={!token} onClick={renew}>合言葉を作り直す</button>
          </div>
          {test && <p className="note">{test}</p>}
          <p className="note">
            合言葉を知っている人は、あなたの受け取り箱に支払いを送れます(データを見ることはできません)。人に見せてしまったら作り直してください。
            カードは名前に「JCB」「エポス」などが入っていれば、上の支払い方法に自動で合わせます。分類は、同じお店で前に選んだものを使います。0円の支払いは記録しません
          </p>
        </>
      )}
      <LegacyShortcut />
    </section>
  );
}

/** 前のやり方: Safari で記録画面を開く (ロックを解除しているときだけ動く) */
function LegacyShortcut() {
  const base = new URL(import.meta.env.BASE_URL, location.origin).href;
  const url = `${base}?pay=`;
  const sample = url + encodeURIComponent('¥1,200\nスターバックス\nJCB');
  return (
    <details className="rules">
      <summary>Safari で開く方法(ロックを解除しているときだけ)</summary>
      <p className="note">クラウド同期を使わない場合の方法です。iPhone がロックされたまま払うと、iOS が Safari を開かせないため「オートメーションの実行に問題がありました」になります</p>
      <ol className="steps">
        <li>上の手順1〜3と同じ</li>
        <li>アクション「URLエンコード」を追加する(入力は上のテキスト)</li>
        <li>アクション「URLを開く」を追加し、下のアドレスを貼って、そのすぐ後ろに「URLエンコードされたテキスト」を変数として入れる</li>
      </ol>
      <CopyRow label="アドレス" value={url} />
      <p className="note"><a href={sample}>試しに開く</a>(1,200円・スターバックス・JCB で記録画面が開きます)。ホーム画面のアプリと Safari ではデータが別々なので、両方でクラウド同期にログインしておくと記録がアプリにも届きます</p>
    </details>
  );
}

function FxSection() {
  const { data, update } = useStore();
  const fx = data.settings.fx;
  const [status, setStatus] = useState<string | null>(null);
  const setFx = (patch: Partial<typeof fx>) => update((d) => ({ ...d, settings: { ...d.settings, fx: { ...d.settings.fx, ...patch } } }));
  const refresh = async () => {
    setStatus('取得中…');
    try {
      const t = today();
      const dates = data.subscriptions.filter(isUsd).flatMap((s) => billingDatesUntil(s, t));
      const next = await fetchRates(fx, dates, t);
      update((d) => ({ ...d, settings: { ...d.settings, fx: { ...d.settings.fx, latest: next.latest, rates: { ...next.rates, ...d.settings.fx.rates } } } }));
      setStatus('更新しました');
    } catch (e) {
      setStatus((e as Error).message || '取得できませんでした');
    }
  };
  const base = fx.latest?.rate ?? fx.manualRate;
  return (
    <section className="card">
      <h2>ドル円の換算</h2>
      <p className="note">ドルのサブスクは、請求日の公表レート(欧州中央銀行)にカードの海外手数料を足して円にします。一度換算した過去の請求は、あとでレートが動いても変わりません</p>
      <div className="fx-now">
        <span>今のレート</span>
        <b className="num">1ドル = {base.toFixed(2)}円</b>
        <small>{fx.latest ? `(${fx.latest.date} 公表)` : '(未取得・下の手入力のレート)'}</small>
      </div>
      <div className="fx-now">
        <span>手数料込み</span>
        <b className="num">{cardRate(fx, base).toFixed(3)}円</b>
      </div>
      <div className="actions left">
        <button className="btn small" onClick={refresh}>今すぐ更新</button>
        {status && <small>{status}</small>}
      </div>
      <div className="form fx-form">
        <label>カードの海外事務手数料(%)
          <input type="number" inputMode="decimal" min="0" step="0.01" value={fx.feePercent} onChange={(e) => setFx({ feePercent: Number(e.target.value) || 0 })} />
        </label>
        <label>レートを取得できないときのレート(円)
          <input type="number" inputMode="decimal" min="1" step="0.01" value={fx.manualRate} onChange={(e) => setFx({ manualRate: Number(e.target.value) || 150 })} />
        </label>
      </div>
      <p className="note">手数料の目安: JCB 1.6%、Visa・Mastercard 1.63〜2.2%(カード会社によって違います)。レートの取得で送るのは「ドル→円」と日付だけで、金額などは送りません</p>
    </section>
  );
}
