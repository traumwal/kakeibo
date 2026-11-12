import { describe, expect, it } from 'vitest';
import { cleanDomain, guessDomain } from './logo';

describe('サービス名からドメインを推測', () => {
  it('表記ゆれ(大文字小文字・空白・全角・カタカナ)を吸収する', () => {
    expect(guessDomain('Netflix')).toBe('netflix.com');
    expect(guessDomain(' NETFLIX ')).toBe('netflix.com');
    expect(guessDomain('ネトフリ')).toBe('netflix.com');
    expect(guessDomain('Ｓｐｏｔｉｆｙ')).toBe('spotify.com');
    expect(guessDomain('YouTube Premium')).toBe('youtube.com');
    expect(guessDomain('Disney+')).toBe('disneyplus.com');
    expect(guessDomain('U-NEXT')).toBe('unext.jp');
    expect(guessDomain('Amazonプライム')).toBe('amazon.co.jp');
  });

  it('前方一致でも見つける(プラン名付き)', () => {
    expect(guessDomain('Netflix プレミアム')).toBe('netflix.com');
  });

  it('知らないサービスや空文字は undefined', () => {
    expect(guessDomain('近所のジム')).toBeUndefined();
    expect(guessDomain('')).toBeUndefined();
  });
});

describe('URL からドメインを取り出す', () => {
  it('スキーム・www・パスを除く', () => {
    expect(cleanDomain('https://www.netflix.com/jp/')).toBe('netflix.com');
    expect(cleanDomain(' Spotify.com ')).toBe('spotify.com');
    expect(cleanDomain('')).toBe('');
  });
});
