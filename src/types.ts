export type Cycle = 'monthly' | 'yearly';

export interface Subscription {
  id: string;
  name: string;
  domain?: string; // ロゴ取得用のサービスのドメイン (例: netflix.com)
  amount: number; // 1回の請求額
  cycle: Cycle;
  billingDay: number; // 請求日 (1-31)。年払いは startDate の月に請求
  category: string;
  startDate: string; // YYYY-MM-DD
  /** オフにした日 (YYYY-MM-DD)。オン/オフのスイッチで自動で入る。未設定ならオン */
  endDate?: string;
  /** 以前オンだった期間 (オフ → オンに戻したとき、過去の集計を残すため) */
  history?: Period[];
  /** どのくらい使っているかの自己評価 */
  usage?: UsageLevel;
  lastUsedAt?: string; // 「今日使った」ボタンで記録 (YYYY-MM-DD)
  usedDates?: string[]; // 「今日使った」を押した日 (直近90日分)
  payment?: string; // 支払い方法 (例: 楽天カード)
  memo?: string;
}

export interface Period {
  start: string;
  end: string;
}

export type UsageLevel = 'often' | 'sometimes' | 'rarely';

/** spread: 年払いを12で割って毎月に計上 / billing: 請求した月にまとめて計上 */
export type YearlyMode = 'spread' | 'billing';

/** friendPaid: 友達が立て替えてくれた額 (自分が借り) / iPaid: 自分が立て替えた額 (自分が貸し) */
export interface Settlement {
  friendId: string;
  type: 'friendPaid' | 'iPaid';
  amount: number;
}

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // 自分の負担額 (支出として集計される額)
  total?: number; // お会計の合計額 (割り勘・立て替え時の参考)
  category: string;
  memo?: string;
  payment?: string; // 支払い方法 (例: 現金, 楽天カード)
  settlements?: Settlement[];
}

export interface Friend {
  id: string;
  name: string;
}

/** paidBack: 自分が友達に返した / receivedBack: 友達から返してもらった */
export interface Repayment {
  id: string;
  friendId: string;
  date: string;
  amount: number;
  direction: 'paidBack' | 'receivedBack';
  memo?: string;
}

export interface Settings {
  categories: string[];
  budgets: Record<string, number>; // カテゴリ -> 月予算
  reviewUnusedDays: number; // 最終利用からこの日数を超えたら見直し候補
  monthlyTarget: number; // 毎月の支出の目安 (グラフの目盛りの基準)
  yearlyMode: YearlyMode;
  paymentMethods: string[]; // 支払い方法 (現金・クレジットカードなど)
  cardRules: Record<string, CardRule>; // 支払い方法名 -> 締め日・支払日 (クレジットカードのみ)
}

export interface AppData {
  version: 1;
  subscriptions: Subscription[];
  expenses: Expense[];
  friends: Friend[];
  repayments: Repayment[];
  settings: Settings;
}

/** クレジットカードの締め日と引き落とし日。31 は月末 */
export interface CardRule {
  closingDay: number;
  payDay: number;
  payMonths: 1 | 2; // 締め日の翌月 / 翌々月に引き落とし
}
