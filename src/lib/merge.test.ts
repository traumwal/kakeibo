import { describe, expect, it } from 'vitest';
import { deepEqual, merge3, mergeFirst } from './merge';
import { emptyData } from './storage';
import type { AppData, Friend } from '../types';

const withFriends = (friends: Friend[], d = emptyData()): AppData => ({ ...d, friends });
const a = { id: 'a', name: 'A' };
const b = { id: 'b', name: 'B' };
const c = { id: 'c', name: 'C' };

describe('deepEqual', () => {
  it('ignores key order and undefined fields', () => {
    expect(deepEqual({ x: 1, y: [1, { z: 2 }] }, { y: [1, { z: 2 }], x: 1 })).toBe(true);
    expect(deepEqual({ x: 1, m: undefined }, { x: 1 })).toBe(true);
    expect(deepEqual({ x: 1 }, { x: 2 })).toBe(false);
  });
});

describe('merge3', () => {
  it('keeps additions from both sides', () => {
    const r = merge3(withFriends([a]), withFriends([a, b]), withFriends([a, c]));
    expect(r.friends.map((f) => f.id).sort()).toEqual(['a', 'b', 'c']);
  });
  it('applies deletions from either side', () => {
    expect(merge3(withFriends([a, b]), withFriends([a]), withFriends([a, b])).friends).toEqual([a]);
    expect(merge3(withFriends([a, b]), withFriends([a, b]), withFriends([b])).friends).toEqual([b]);
  });
  it('applies remote edits and prefers local on conflict', () => {
    const r1 = merge3(withFriends([a]), withFriends([a]), withFriends([{ id: 'a', name: 'R' }]));
    expect(r1.friends[0].name).toBe('R');
    const r2 = merge3(withFriends([a]), withFriends([{ id: 'a', name: 'L' }]), withFriends([{ id: 'a', name: 'R' }]));
    expect(r2.friends[0].name).toBe('L');
  });
  it('keeps an edit over a deletion', () => {
    const r = merge3(withFriends([a]), withFriends([]), withFriends([{ id: 'a', name: 'R' }]));
    expect(r.friends).toEqual([{ id: 'a', name: 'R' }]);
  });
  it('merges settings per field', () => {
    const base = emptyData();
    const local = { ...base, settings: { ...base.settings, monthlyTarget: 30000, budgets: { 外食: 10000 } } };
    const remote = { ...base, settings: { ...base.settings, reviewUnusedDays: 60, budgets: { 食費: 30000 } } };
    const r = merge3(base, local, remote).settings;
    expect(r.monthlyTarget).toBe(30000);
    expect(r.reviewUnusedDays).toBe(60);
    expect(r.budgets).toEqual({ 外食: 10000, 食費: 30000 });
  });
});

describe('mergeFirst', () => {
  it('returns cloud data when the device is empty', () => {
    const remote = withFriends([a], { ...emptyData(), settings: { ...emptyData().settings, reviewUnusedDays: 90 } });
    expect(deepEqual(mergeFirst(emptyData(), remote), remote)).toBe(true);
  });
  it('keeps items from both and cloud settings', () => {
    const remote = withFriends([a], { ...emptyData(), settings: { ...emptyData().settings, reviewUnusedDays: 90 } });
    const r = mergeFirst(withFriends([b]), remote);
    expect(r.friends.map((f) => f.id).sort()).toEqual(['a', 'b']);
    expect(r.settings.reviewUnusedDays).toBe(90);
  });
});
