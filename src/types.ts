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
  endDate?: string; // 解約日 (YYYY-MM-DD)。未設定なら継続中
  usageHoursPerMonth?: number; // スクリーンタイム等で確認した月の利用時間 (手入力)
  lastUsedAt?: string; // 「使った」ボタンで記録 (YYYY-MM-DD)
  memo?: string;
}

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
  reviewCostPerHour: number; // 1時間あたりこの額を超えたら見直し候補
  reviewUnusedDays: number; // 最終利用からこの日数を超えたら見直し候補
}

export interface AppData {
  version: 1;
  subscriptions: Subscription[];
  expenses: Expense[];
  friends: Friend[];
  repayments: Repayment[];
  settings: Settings;
}
