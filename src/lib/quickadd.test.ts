import { describe, expect, it } from 'vitest';
import { guessShopCategory, isPayLink, matchPayment, parseAmount, parsePayParams, parsePayText } from './quickadd';
import type { Expense } from '../types';

const CATS = ['外食', '食費', '日用品', '交通', '衣服・美容', 'その他'];

describe('ショートカットからの支払い', () => {
  it('金額の書き方のゆれを吸収する', () => {
    expect(parseAmount('¥1,200')).toBe(1200);
    expect(parseAmount('1,200円')).toBe(1200);
    expect(parseAmount('JPY 980.00')).toBe(980);
    expect(parseAmount('￥３００')).toBe(300);
    expect(parseAmount('')).toBeUndefined();
    expect(parseAmount('¥0')).toBeUndefined();
  });

  it('pay= の3行 (金額・加盟店・カード) を読む', () => {
    const q = '?pay=' + encodeURIComponent('¥1,200\nスターバックス 渋谷店\nJCB カード W');
    expect(parsePayParams(q)).toEqual({ amount: 1200, shop: 'スターバックス 渋谷店', card: 'JCB カード W' });
    expect(parsePayParams('?amount=500&shop=ローソン')).toEqual({ amount: 500, shop: 'ローソン', card: undefined });
    expect(parsePayParams('?foo=1')).toBeNull();
    expect(parsePayParams('?pay=')).toBeNull();
  });

  it('改札 (金額なし・0円) はショートカットからでも金額なしとわかる', () => {
    expect(isPayLink('?pay=')).toBe(true);
    expect(isPayLink('?foo=1')).toBe(false);
    expect(parsePayParams('?pay=' + encodeURIComponent('¥0\n\nSuica'))?.amount).toBeUndefined();
    expect(parsePayParams('?pay=' + encodeURIComponent('\n\nSuica'))).toBeNull();
  });

  it('ウォレットのカード名を支払い方法に合わせる', () => {
    const methods = ['現金', 'JCB', 'エポスカード'];
    expect(matchPayment('JCB カード W', methods)).toBe('JCB');
    expect(matchPayment('EPOS CARD', methods)).toBe('エポスカード');
    expect(matchPayment('エポス', methods)).toBe('エポスカード');
    expect(matchPayment('楽天カード', methods)).toBe('楽天カード'); // 合うものがなければそのまま
    expect(matchPayment(undefined, methods)).toBeUndefined();
  });

  it('お店の名前から分類を推測する。前に同じお店で選んだ分類が優先', () => {
    expect(guessShopCategory('スターバックス 渋谷店', [], CATS)).toBe('外食'); // カフェがなければ外食
    expect(guessShopCategory('スターバックス', [], [...CATS, 'カフェ'])).toBe('カフェ');
    expect(guessShopCategory('SEVEN-ELEVEN', [], CATS)).toBe('食費');
    expect(guessShopCategory('JR東日本', [], CATS)).toBe('交通');
    expect(guessShopCategory('GU 新宿', [], CATS)).toBe('衣服・美容');
    expect(guessShopCategory('GUCCI', [], CATS)).toBeUndefined();
    const past: Expense[] = [
      { id: '1', date: '2026-10-01', amount: 500, category: '食費', memo: 'ローソン' },
      { id: '2', date: '2026-11-01', amount: 500, category: '外食', memo: 'ローソン' },
    ];
    expect(guessShopCategory('ローソン', past, CATS)).toBe('外食');
  });
});

describe('parsePayText (受け取り箱)', () => {
  it('3行から金額・お店・カードを読む', () => {
    expect(parsePayText('¥872\nJOYFULL MOBARA\nエポスカード')).toEqual({ amount: 872, shop: 'JOYFULL MOBARA', card: 'エポスカード' });
    expect(parsePayText('¥0\n\nSuica')).toEqual({ amount: undefined, shop: undefined, card: 'Suica' });
    expect(parsePayText('')).toEqual({ amount: undefined, shop: undefined, card: undefined });
  });
});
