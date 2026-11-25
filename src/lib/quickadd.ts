import type { Expense } from '../types';
import { normalizeName } from './logo';

/** iPhone のショートカット (Apple Pay で払ったとき) から渡される支払いの情報 */
export interface PayDraft {
  amount?: number;
  shop?: string;
  card?: string;
  /** 払った日 (受け取り箱から開いたとき。なければ今日) */
  date?: string;
  /** 受け取り箱の id (保存したら受け取り箱から消す) */
  inboxId?: number;
}

/** 「¥1,200」「1,200円」「JPY 1200.00」などから円の額を取り出す */
export function parseAmount(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const m = text.normalize('NFKC').replace(/[,\s]/g, '').match(/\d+(\.\d+)?/);
  if (!m) return undefined;
  const n = Math.round(Number(m[0]));
  return n > 0 ? n : undefined;
}

/** ショートカットから開かれたか (?pay= か ?amount= がある) */
export const isPayLink = (search: string) => {
  const q = new URLSearchParams(search);
  return q.has('pay') || q.has('amount');
};

/**
 * URL の ? 以降から支払いの情報を読む。
 * ショートカットでは「金額・加盟店・カード」を改行でつないで1つにし、URLエンコードして pay= に入れる。
 * amount= / shop= / card= を別々に渡してもよい
 */
export function parsePayParams(search: string): PayDraft | null {
  const q = new URLSearchParams(search);
  if (!q.has('pay') && !q.has('amount')) return null;
  const lines = splitPay(q.get('pay') ?? '');
  const draft: PayDraft = {
    amount: parseAmount(q.get('amount') ?? lines[0]),
    shop: (q.get('shop') ?? lines[1] ?? '').trim() || undefined,
    card: (q.get('card') ?? lines[2] ?? '').trim() || undefined,
  };
  return draft.amount || draft.shop ? draft : null;
}

const splitPay = (text: string) => text.split(/\r?\n/).map((s) => s.trim());

/** 「金額\n加盟店\nカード」の3行 (受け取り箱に届いたもの) を読む */
export function parsePayText(text: string): PayDraft {
  const [amount, shop, card] = splitPay(text);
  return { amount: parseAmount(amount), shop: shop || undefined, card: card || undefined };
}

/**
 * はっきり0円の支払い (定期の区間内で改札を通ったときなど) か。
 * 金額が空のもの (QUICPay・iD は払った瞬間にはまだ金額が届かない) は0円とは見なさない
 */
export function isZeroPay(text: string): boolean {
  const amount = splitPay(text)[0] ?? '';
  return /\d/.test(amount.normalize('NFKC')) && !parseAmount(amount);
}

/** カードのブランド・会社名 (ウォレットのカード名と、支払い方法の名前のどちらにも出てきそうな語) */
const CARD_WORDS = [['jcb'], ['epos', 'エポス'], ['visa'], ['master', 'マスター'], ['amex', 'アメックス', 'americanexpress'], ['楽天', 'rakuten'], ['三井住友', 'smbc'], ['dカード', 'dcard'], ['paypay'], ['イオン', 'aeon'], ['セゾン', 'saison'], ['ビュー', 'view']];

/** ウォレットのカード名を、設定の支払い方法に合わせる。合うものがなければそのままの名前 */
export function matchPayment(card: string | undefined, methods: string[]): string | undefined {
  if (!card) return undefined;
  const c = normalizeName(card);
  const norm = methods.map((m) => [m, normalizeName(m)] as const);
  const hit =
    norm.find(([, m]) => m === c) ??
    norm.find(([, m]) => m.length >= 2 && (c.includes(m) || m.includes(c))) ??
    norm.find(([, m]) => CARD_WORDS.some((ws) => ws.some((w) => c.includes(normalizeName(w))) && ws.some((w) => m.includes(normalizeName(w)))));
  return hit ? hit[0] : card.trim();
}

/** お店の名前 → 分類の候補 (前にあるものほど優先。設定にある分類だけを使う) */
const SHOP_RULES: [string[], string[]][] = [
  [['カフェ', '外食'], ['スターバックス', 'starbucks', 'スタバ', 'ドトール', 'doutor', 'タリーズ', 'tullys', 'コメダ', 'komeda', 'カフェ', 'cafe', 'coffee', 'コーヒー', 'エクセルシオール', 'サンマルク']],
  [['外食'], ['マクドナルド', 'mcdonald', 'すき家', 'sukiya', '吉野家', 'yoshinoya', '松屋', 'matsuya', 'ガスト', 'サイゼリヤ', 'saizeriya', 'くら寿司', 'スシロー', 'sushiro', '丸亀', 'ココイチ', 'coco壱', 'ケンタッキー', 'kfc', 'モスバーガー', '王将', '大戸屋', 'ラーメン', '食堂', 'レストラン', 'restaurant', '居酒屋', 'ubereats', '出前館', '焼肉', 'バーガー']],
  [['食費'], ['セブンイレブン', 'セブン-イレブン', '7-eleven', 'seveneleven', 'ローソン', 'lawson', 'ファミリーマート', 'familymart', 'ミニストップ', 'スーパー', 'イオン', 'aeon', '西友', 'seiyu', 'ライフ', 'イトーヨーカドー', 'マルエツ', 'オーケー', '業務スーパー', 'まいばすけっと', '成城石井', 'ベルク', 'サミット']],
  [['日用品'], ['マツモトキヨシ', 'マツキヨ', 'matsukiyo', 'ウエルシア', 'welcia', 'スギ薬局', 'ツルハ', 'ドラッグ', 'drug', 'ダイソー', 'daiso', 'セリア', 'キャンドゥ', '無印', 'muji', 'ニトリ', 'nitori', 'ドンキホーテ', 'ドン・キホーテ', 'donki', 'ロフト', 'loft', 'ハンズ']],
  [['交通'], ['jr', '駅', 'suica', 'pasmo', 'icoca', 'タクシー', 'taxi', '鉄道', 'メトロ', 'metro', 'バス', 'eneos', '出光', 'idemitsu', 'ガソリン', 'パーキング', 'parking', '駐車']],
  [['衣服・美容'], ['ユニクロ', 'uniqlo', 'gu', 'zara', 'h&m', 'しまむら', '美容', 'ヘアサロン', 'salon']],
  [['医療・健康'], ['病院', 'クリニック', 'clinic', '薬局', '歯科']],
  [['書籍', '教育・自己投資'], ['書店', '紀伊國屋', 'ブックオフ', 'bookoff', 'ジュンク堂', '蔦屋', 'tsutaya']],
];

const matchWord = (n: string, word: string) => {
  const k = normalizeName(word);
  // 2文字以下の英字 (jr, gu) は名前の先頭にあって、その後が英字でないときだけ
  if (/^[a-z]{1,2}$/.test(k)) return n === k || (n.startsWith(k) && !/[a-z]/.test(n[k.length]));
  return n.includes(k);
};

/** お店の名前から分類を推測する。同じお店の記録があれば、最後にそのお店で選んだ分類を使う */
export function guessShopCategory(shop: string | undefined, expenses: Expense[], categories: string[]): string | undefined {
  if (!shop) return undefined;
  const n = normalizeName(shop);
  if (!n) return undefined;
  const past = [...expenses]
    .filter((e) => e.memo && normalizeName(e.memo) === n && categories.includes(e.category))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (past) return past.category;
  for (const [cands, words] of SHOP_RULES) {
    if (!words.some((w) => matchWord(n, w))) continue;
    const c = cands.find((x) => categories.includes(x));
    if (c) return c;
  }
  return undefined;
}

/** よく使うメモ (記録画面のボタン用)。使ったもの (漫画・ランチ) でもお店 (100均) でもよい。最後に選んだ分類と支払い方法を一緒に覚えておく */
export interface FrequentShop {
  shop: string;
  category: string;
  payment?: string;
  count: number;
}

/** 直近 days 日の記録から、回数の多い順 (同じなら新しい順) に limit 件。1回だけのお店も出す */
export function frequentShops(expenses: Expense[], todayStr: string, limit = 8, days = 120): FrequentShop[] {
  const from = new Date(new Date(todayStr).getTime() - days * 86400000).toISOString().slice(0, 10);
  const map = new Map<string, FrequentShop & { last: string }>();
  for (const e of [...expenses].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!e.memo || e.date < from || e.date > todayStr) continue;
    const key = normalizeName(e.memo);
    if (!key) continue;
    const prev = map.get(key);
    // 表示名・分類・支払い方法は最後の記録に合わせる
    map.set(key, { shop: e.memo.trim(), category: e.category, payment: e.payment, count: (prev?.count ?? 0) + 1, last: e.date });
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, limit)
    .map(({ shop, category, payment, count }) => ({ shop, category, payment, count }));
}
