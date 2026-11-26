import type { Currency, Cycle } from '../types';
import { normalizeName } from './logo';

/** 「サブスクを追加」で選べるプラン。金額は登録時の目安 (改定されることがあるので、フォームで直せる) */
export interface CatalogPlan {
  name: string;
  amount: number;
  currency?: Currency; // 未設定なら円
  cycle: Cycle;
}

export interface CatalogService {
  name: string;
  domain?: string;
  category: string;
  /** 検索用の別名 (カナ表記など) */
  aliases?: string[];
  /** 空なら金額は自分で入れる (家賃・電気など) */
  plans: CatalogPlan[];
}

const m = (name: string, amount: number, currency?: Currency): CatalogPlan => ({ name, amount, currency, cycle: 'monthly' });
const y = (name: string, amount: number, currency?: Currency): CatalogPlan => ({ name, amount, currency, cycle: 'yearly' });

/** 分類ごとの一覧 (この順で表示する) */
export const CATALOG: { group: string; services: CatalogService[] }[] = [
  {
    group: '動画',
    services: [
      { name: 'Netflix', domain: 'netflix.com', category: '趣味・娯楽', aliases: ['ネットフリックス', 'ネトフリ'], plans: [m('広告つきスタンダード', 890), m('スタンダード', 1590), m('プレミアム', 2290)] },
      { name: 'Amazonプライム', domain: 'amazon.co.jp', category: '趣味・娯楽', aliases: ['amazon prime', 'アマゾンプライム', 'プライムビデオ'], plans: [m('月額', 600), y('年額', 5900)] },
      { name: 'Disney+', domain: 'disneyplus.com', category: '趣味・娯楽', aliases: ['ディズニープラス'], plans: [m('スタンダード', 1140), m('プレミアム', 1520)] },
      { name: 'U-NEXT', domain: 'unext.jp', category: '趣味・娯楽', aliases: ['ユーネクスト'], plans: [m('月額', 2189)] },
      { name: 'Hulu', domain: 'hulu.jp', category: '趣味・娯楽', aliases: ['フールー'], plans: [m('月額', 1026)] },
      { name: 'ABEMAプレミアム', domain: 'abema.tv', category: '趣味・娯楽', aliases: ['アベマ'], plans: [m('広告つき', 580), m('プレミアム', 1080)] },
      { name: 'DAZN', domain: 'dazn.com', category: '趣味・娯楽', aliases: ['ダゾーン'], plans: [m('スタンダード', 4200)] },
      { name: 'dアニメストア', domain: 'animestore.docomo.ne.jp', category: '趣味・娯楽', aliases: ['danime'], plans: [m('月額', 550)] },
      { name: 'DMM TV', domain: 'tv.dmm.com', category: '趣味・娯楽', plans: [m('DMMプレミアム', 550)] },
      { name: 'YouTube Premium', domain: 'youtube.com', category: '趣味・娯楽', aliases: ['ユーチューブ'], plans: [m('個人', 1280), m('ファミリー', 2280), m('学生', 780)] },
    ],
  },
  {
    group: '音楽・本',
    services: [
      { name: 'Spotify', domain: 'spotify.com', category: '趣味・娯楽', aliases: ['スポティファイ'], plans: [m('Standard', 1080), m('Duo', 1480), m('Family', 1780), m('Student', 580)] },
      { name: 'Apple Music', domain: 'apple.com', category: '趣味・娯楽', aliases: ['アップルミュージック'], plans: [m('個人', 1080), m('ファミリー', 1680), m('学生', 580)] },
      { name: 'Amazon Music Unlimited', domain: 'music.amazon.co.jp', category: '趣味・娯楽', aliases: ['アマゾンミュージック'], plans: [m('プライム会員', 1080), m('個人', 1180)] },
      { name: 'LINE MUSIC', domain: 'music.line.me', category: '趣味・娯楽', aliases: ['ラインミュージック'], plans: [m('一般', 1080), m('学生', 580)] },
      { name: 'Kindle Unlimited', domain: 'amazon.co.jp', category: '教育・自己投資', aliases: ['キンドル'], plans: [m('月額', 980)] },
      { name: 'Audible', domain: 'audible.co.jp', category: '教育・自己投資', aliases: ['オーディブル'], plans: [m('月額', 1500)] },
      { name: '日経電子版', domain: 'nikkei.com', category: '教育・自己投資', aliases: ['nikkei', '日経'], plans: [m('月額', 4277)] },
    ],
  },
  {
    group: 'AI・ツール',
    services: [
      { name: 'ChatGPT', domain: 'openai.com', category: 'AI・ツール', aliases: ['openai'], plans: [m('Plus', 20, 'USD'), m('Pro', 200, 'USD')] },
      { name: 'Claude', domain: 'claude.ai', category: 'AI・ツール', aliases: ['クロード'], plans: [m('Pro', 20, 'USD'), m('Max 5x', 100, 'USD'), m('Max 20x', 200, 'USD')] },
      { name: 'Google AI Pro', domain: 'gemini.google.com', category: 'AI・ツール', aliases: ['gemini', 'ジェミニ'], plans: [m('月額', 2900)] },
      { name: 'GitHub Copilot', domain: 'github.com', category: 'AI・ツール', plans: [m('Pro', 10, 'USD'), y('Pro 年額', 100, 'USD')] },
      { name: 'Notion', domain: 'notion.so', category: 'AI・ツール', plans: [m('Plus', 12, 'USD')] },
      { name: 'Microsoft 365', domain: 'microsoft.com', category: 'AI・ツール', aliases: ['office', 'オフィス'], plans: [m('Personal 月額', 2130), y('Personal 年額', 21300), m('Family 月額', 2740), y('Family 年額', 27400)] },
      { name: 'Adobe Creative Cloud', domain: 'adobe.com', category: 'AI・ツール', aliases: ['アドビ', 'photoshop', 'フォトショップ'], plans: [m('Photoshop', 3280), m('Creative Cloud Pro', 9080)] },
    ],
  },
  {
    group: 'クラウド保存',
    services: [
      { name: 'iCloud+', domain: 'icloud.com', category: 'AI・ツール', aliases: ['アイクラウド'], plans: [m('50GB', 150), m('200GB', 450), m('2TB', 1500)] },
      { name: 'Google One', domain: 'one.google.com', category: 'AI・ツール', aliases: ['グーグルワン'], plans: [m('100GB', 250), m('2TB', 1300)] },
      { name: 'Dropbox', domain: 'dropbox.com', category: 'AI・ツール', aliases: ['ドロップボックス'], plans: [m('Plus', 1500)] },
    ],
  },
  {
    group: 'ゲーム',
    services: [
      { name: 'Nintendo Switch Online', domain: 'nintendo.com', category: '趣味・娯楽', aliases: ['ニンテンドースイッチオンライン', 'スイッチオンライン'], plans: [m('1か月', 306), y('12か月', 2400), y('追加パック 12か月', 4900)] },
      { name: 'PlayStation Plus', domain: 'playstation.com', category: '趣味・娯楽', aliases: ['プレステプラス', 'psplus'], plans: [m('エッセンシャル', 850), m('エクストラ', 1300), m('プレミアム', 1550)] },
    ],
  },
  {
    group: '固定費',
    services: [
      { name: '家賃', category: '家賃', plans: [] },
      { name: 'スマホ代', category: '通信費', aliases: ['携帯'], plans: [] },
      { name: 'ネット回線', category: '通信費', aliases: ['wifi', '光回線'], plans: [] },
      { name: '電気代', category: '光熱費', plans: [] },
      { name: 'ガス代', category: '光熱費', plans: [] },
      { name: '水道代', category: '光熱費', plans: [] },
      { name: '保険', category: '保険', plans: [] },
      { name: '定期券', category: '交通', aliases: ['通勤', '通学'], plans: [] },
      { name: 'ジム', category: '医療・健康', aliases: ['フィットネス'], plans: [] },
    ],
  },
];

/** 登録するときの名前。プランが2つ以上あるサービスは「Netflix スタンダード」のようにプラン名を付ける */
export function planSubName(service: CatalogService, plan: CatalogPlan): string {
  return service.plans.length > 1 ? `${service.name} ${plan.name}` : service.name;
}

/** 名前・別名・プラン名で絞り込む */
export function searchCatalog(query: string): CatalogService[] {
  const q = normalizeName(query);
  const all = CATALOG.flatMap((g) => g.services);
  if (!q) return all;
  return all.filter((s) => [s.name, ...(s.aliases ?? []), ...s.plans.map((p) => p.name)].some((w) => normalizeName(w).includes(q)));
}
