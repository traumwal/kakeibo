import type { SupabaseClient } from '@supabase/supabase-js';
import { toISODate } from './date';
import { isZeroPay, parsePayText, type PayDraft } from './quickadd';

/** ショートカットから受け取り箱に届いた支払い */
export interface InboxItem extends PayDraft {
  inboxId: number;
  date: string;
  /** 届いた時刻 (表示用) */
  at: Date;
}

interface Row {
  id: number;
  pay: string;
  created_at: string;
}

export function toInboxItem(row: Row): InboxItem {
  const at = new Date(row.created_at);
  return { ...parsePayText(row.pay), inboxId: Number(row.id), date: toISODate(at), at };
}

/**
 * 受け取り箱を読む。0円の支払い (定期の区間内で改札を通ったときなど) は記録しないので、ここで消す。
 * 金額が空のもの (QUICPay・iD は払った瞬間にはまだ金額が届かない) は残して、アプリで金額を入れてもらう
 */
export async function fetchInbox(client: SupabaseClient): Promise<InboxItem[]> {
  const { data, error } = await client.from('kakeibo_inbox').select('id, pay, created_at').order('created_at');
  if (error) throw new Error(error.message);
  const rows = data as Row[];
  const zero = rows.filter((r) => isZeroPay(r.pay)).map((r) => Number(r.id));
  if (zero.length) await client.from('kakeibo_inbox').delete().in('id', zero);
  return rows.filter((r) => !isZeroPay(r.pay)).map(toInboxItem);
}

export async function deleteInbox(client: SupabaseClient, id: number): Promise<void> {
  const { error } = await client.from('kakeibo_inbox').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** ショートカット用の合言葉 (なければ作る) */
export async function getPayToken(client: SupabaseClient, renew = false): Promise<string> {
  const { data, error } = await client.rpc('kakeibo_pay_token', { renew });
  if (error) throw new Error(error.message);
  return data as string;
}
