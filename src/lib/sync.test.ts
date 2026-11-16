import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { syncOnce, type SyncMeta } from './sync';
import { emptyData } from './storage';
import type { AppData } from '../types';

/** kakeibo_data テーブル1行ぶんだけを持つ、Supabase クライアントの最小限の偽物 */
function fakeClient(initial?: { data: AppData; rev: number }) {
  const db: { row: { data: unknown; rev: number } | null } = {
    row: initial ? { data: JSON.parse(JSON.stringify(initial.data)), rev: initial.rev } : null,
  };
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.row, error: null }) }) }),
      insert: async (v: { data: AppData; rev: number }) => {
        if (db.row) return { error: { code: '23505', message: 'duplicate' } };
        db.row = { data: JSON.parse(JSON.stringify(v.data)), rev: v.rev };
        return { error: null };
      },
      update: (v: { data: AppData; rev: number }) => ({
        eq: () => ({
          eq: (_c: string, rev: number) => ({
            select: async () => {
              if (!db.row || db.row.rev !== rev) return { data: [], error: null };
              db.row = { data: JSON.parse(JSON.stringify(v.data)), rev: v.rev };
              return { data: [{ rev: v.rev }], error: null };
            },
          }),
        }),
      }),
    }),
  };
  return { client: client as unknown as SupabaseClient, db };
}

const withFriend = (id: string, d = emptyData()): AppData => ({ ...d, friends: [...d.friends, { id, name: id }] });

describe('syncOnce', () => {
  it('creates the cloud row on first sync', async () => {
    const { client, db } = fakeClient();
    const local = withFriend('a');
    const res = await syncOnce(client, 'u1', local, null);
    expect(res.meta.rev).toBe(1);
    expect((db.row!.data as AppData).friends).toEqual(local.friends);
  });

  it('merges a second device into existing cloud data', async () => {
    const { client, db } = fakeClient({ data: withFriend('a'), rev: 1 });
    const res = await syncOnce(client, 'u1', withFriend('b'), null);
    expect(res.data.friends.map((f) => f.id).sort()).toEqual(['a', 'b']);
    expect(db.row!.rev).toBe(2);
  });

  it('pulls remote changes without writing when nothing changed locally', async () => {
    const base = withFriend('a');
    const { client, db } = fakeClient({ data: withFriend('b', base), rev: 2 });
    const meta: SyncMeta = { userId: 'u1', rev: 1, base };
    const res = await syncOnce(client, 'u1', base, meta);
    expect(res.data.friends.map((f) => f.id)).toEqual(['a', 'b']);
    expect(db.row!.rev).toBe(2);
    expect(res.meta.rev).toBe(2);
  });

  it('pushes local deletions', async () => {
    const base = withFriend('b', withFriend('a'));
    const { client, db } = fakeClient({ data: base, rev: 3 });
    const local = { ...base, friends: base.friends.filter((f) => f.id !== 'a') };
    await syncOnce(client, 'u1', local, { userId: 'u1', rev: 3, base });
    expect((db.row!.data as AppData).friends.map((f) => f.id)).toEqual(['b']);
    expect(db.row!.rev).toBe(4);
  });
});
