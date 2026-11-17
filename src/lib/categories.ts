import type { AppData } from '../types';
import { normalizeName } from './logo';

/** 「その他」はどの記録にも使える受け皿。削除した分類の記録はここに移す */
export const FALLBACK_CATEGORY = 'その他';

export const usageCount = (data: AppData, name: string) =>
  data.expenses.filter((e) => e.category === name).length + data.subscriptions.filter((s) => s.category === name).length;

/** 名前を変える。記録・予算・サブスクの分類もまとめて変える。既にある名前にすると統合する (予算は統合先を残す) */
export function renameCategory(data: AppData, from: string, to: string): AppData {
  to = to.trim();
  if (!to || to === from || !data.settings.categories.includes(from)) return data;
  const exists = data.settings.categories.includes(to);
  const categories = exists ? data.settings.categories.filter((c) => c !== from) : data.settings.categories.map((c) => (c === from ? to : c));
  const budgets = { ...data.settings.budgets };
  if (from in budgets) {
    if (!(to in budgets)) budgets[to] = budgets[from];
    delete budgets[from];
  }
  return {
    ...data,
    settings: { ...data.settings, categories, budgets },
    expenses: data.expenses.map((e) => (e.category === from ? { ...e, category: to } : e)),
    subscriptions: data.subscriptions.map((s) => (s.category === from ? { ...s, category: to } : s)),
  };
}

/** 削除する。その分類の記録は「その他」(「その他」自体を消すときは先頭の分類) に移す。最後の1つは消せない */
export function removeCategory(data: AppData, name: string): AppData {
  const rest = data.settings.categories.filter((c) => c !== name);
  if (rest.length === 0 || rest.length === data.settings.categories.length) return data;
  const used = usageCount(data, name) > 0;
  const target = name !== FALLBACK_CATEGORY ? FALLBACK_CATEGORY : rest[0];
  const categories = used && !rest.includes(target) ? [...rest, target] : rest;
  const budgets = { ...data.settings.budgets };
  delete budgets[name];
  return {
    ...data,
    settings: { ...data.settings, categories, budgets },
    expenses: data.expenses.map((e) => (e.category === name ? { ...e, category: target } : e)),
    subscriptions: data.subscriptions.map((s) => (s.category === name ? { ...s, category: target } : s)),
  };
}

export function moveCategory(data: AppData, name: string, delta: -1 | 1): AppData {
  const list = [...data.settings.categories];
  const i = list.indexOf(name);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return data;
  [list[i], list[j]] = [list[j], list[i]];
  return { ...data, settings: { ...data.settings, categories: list } };
}

export function addCategory(data: AppData, name: string): AppData {
  name = name.trim();
  if (!name || data.settings.categories.includes(name)) return data;
  const list = [...data.settings.categories];
  // 「その他」は常に最後に置く
  const at = list[list.length - 1] === FALLBACK_CATEGORY ? list.length - 1 : list.length;
  list.splice(at, 0, name);
  return { ...data, settings: { ...data.settings, categories: list } };
}

/** 分類を選んでいないサブスク (以前からの既定値)。集計では「サブスク・固定費」にまとめる */
export const UNCLASSIFIED_SUB = 'サブスク';

/** サブスクの分類として選べる候補。記録用の分類に加えて、固定費らしいものを出す */
export const SUB_CATEGORY_PRESETS = ['趣味・娯楽', 'AI・ツール', '交通', '教育・自己投資', '家賃', '通信費', '光熱費', '保険'];

/** 使っているかどうかを記録しても意味がない分類 (定期券・家賃など)。「使った記録がない」だけでは見直し候補にしない */
export const ESSENTIAL_SUB_CATEGORIES = ['交通', '家賃', '通信費', '光熱費', '保険'];

export const subCategoryLabel = (c: string | undefined) => (!c || c === UNCLASSIFIED_SUB ? '未分類' : c);

/** サブスクの分類のセレクトに出す一覧 (記録用の分類 → 固定費の候補 → その他 → 未分類) */
export function subCategoryOptions(categories: string[], current?: string): string[] {
  const list = [...categories.filter((c) => c !== FALLBACK_CATEGORY), ...SUB_CATEGORY_PRESETS, FALLBACK_CATEGORY, UNCLASSIFIED_SUB];
  if (current && !list.includes(current)) list.push(current);
  return list.filter((v, i, a) => a.indexOf(v) === i);
}

/** 名前 → 分類の推測。前の方の規則ほど優先 (「ジム」は娯楽より健康、など) */
const CATEGORY_RULES: [string, string[]][] = [
  ['交通', ['定期', 'suica', 'pasmo', 'icoca', '通勤', '通学', 'jr', 'メトロ', '電車', 'バス', '駐車場', 'カーシェア', 'timescar']],
  ['家賃', ['家賃', '管理費', '共益費']],
  ['光熱費', ['電気', 'ガス', '水道', '光熱']],
  ['通信費', ['携帯', 'スマホ', 'docomo', 'ドコモ', 'ahamo', 'au', 'povo', 'softbank', 'ソフトバンク', 'linemo', 'ymobile', 'ワイモバイル', 'uqモバイル', '楽天モバイル', 'mineo', 'iijmio', '光回線', 'wifi', 'wi-fi', 'ポケットwifi', 'プロバイダ', 'nuro']],
  ['保険', ['保険', '共済']],
  ['医療・健康', ['ジム', 'chocozap', 'ちょこざっぷ', 'エニタイム', 'anytime', 'フィットネス', 'ヨガ']],
  ['AI・ツール', ['chatgpt', 'openai', 'claude', 'gemini', 'copilot', 'githubcopilot', 'perplexity', 'cursor', 'midjourney', 'notion', 'dropbox', 'googleone', 'icloud', 'microsoft365', 'office365', 'adobe', 'creativecloud', 'photoshop', 'canva', 'github', 'evernote', '1password', 'grammarly', 'deepl', 'zoom', 'slack', 'figma']],
  ['教育・自己投資', ['duolingo', 'nikkei', '日経', 'audible', 'オーディブル', 'kindle', 'キンドル', 'schoo', 'udemy', 'スタディサプリ', 'newspicks', '新聞', '英会話', '塾']],
  ['趣味・娯楽', ['netflix', 'ネトフリ', 'ネットフリックス', 'primevideo', 'プライムビデオ', 'amazonprime', 'amazonプライム', 'アマゾンプライム', 'spotify', 'youtube', 'applemusic', 'appletv', 'appleone', 'disney', 'ディズニー', 'unext', 'u-next', 'hulu', 'dazn', 'abema', 'dアニメ', 'danime', 'nintendo', 'switchonline', 'playstation', 'psplus', 'gamepass', 'xbox', 'linemusic', 'radiko', 'twitch', 'fanbox', 'fantia', 'niconico', 'ニコニコ', 'crunchyroll', 'ジャンプ', 'ピッコマ', 'マンガ']],
];

export function guessCategory(name: string): string | undefined {
  const n = normalizeName(name);
  if (!n) return undefined;
  for (const [category, words] of CATEGORY_RULES) {
    // 2文字以下の英字 (au, jr) は名前全体が一致したときだけ
    if (words.some((w) => {
      const k = normalizeName(w);
      return /^[a-z]{1,2}$/.test(k) ? n === k : n.includes(k);
    })) return category;
  }
  return undefined;
}
