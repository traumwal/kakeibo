/** よく使うサービスの名前 → ドメイン (名前を入れるとロゴ用のドメインを自動で補完する) */
const KNOWN_SERVICES: [string[], string][] = [
  [['netflix', 'ネットフリックス', 'ネトフリ'], 'netflix.com'],
  [['amazonprime', 'amazonプライム', 'アマゾンプライム', 'primevideo', 'プライムビデオ', 'amazon'], 'amazon.co.jp'],
  [['spotify', 'スポティファイ'], 'spotify.com'],
  [['youtubepremium', 'youtube', 'ユーチューブ', 'youtubemusic'], 'youtube.com'],
  [['applemusic', 'アップルミュージック', 'appletv', 'appleone', 'apple'], 'apple.com'],
  [['icloud', 'icloud+', 'アイクラウド'], 'icloud.com'],
  [['disney+', 'disneyplus', 'ディズニープラス', 'ディズニー+'], 'disneyplus.com'],
  [['unext', 'u-next', 'ユーネクスト'], 'unext.jp'],
  [['hulu', 'フールー'], 'hulu.jp'],
  [['dazn', 'ダゾーン'], 'dazn.com'],
  [['abema', 'abemaプレミアム', 'アベマ'], 'abema.tv'],
  [['danime', 'dアニメストア', 'dアニメ'], 'animestore.docomo.ne.jp'],
  [['chatgpt', 'chatgptplus', 'openai'], 'openai.com'],
  [['claude', 'claudepro'], 'claude.ai'],
  [['adobe', 'adobecc', 'creativecloud', 'photoshop'], 'adobe.com'],
  [['microsoft365', 'office365', 'office', 'xboxgamepass', 'gamepass'], 'microsoft.com'],
  [['nintendoswitchonline', 'switchonline', 'ニンテンドースイッチオンライン', 'nintendo'], 'nintendo.com'],
  [['playstationplus', 'psplus', 'プレステプラス', 'playstation'], 'playstation.com'],
  [['linemusic', 'ラインミュージック', 'line'], 'music.line.me'],
  [['googleone', 'googledrive', 'google'], 'one.google.com'],
  [['dropbox'], 'dropbox.com'],
  [['notion'], 'notion.so'],
  [['kindleunlimited', 'kindle', 'キンドル'], 'amazon.co.jp'],
  [['audible', 'オーディブル'], 'audible.co.jp'],
  [['nikkei', '日経', '日経電子版'], 'nikkei.com'],
  [['duolingo'], 'duolingo.com'],
  [['canva'], 'canva.com'],
  [['github', 'githubcopilot'], 'github.com'],
];

/** 小文字化し空白と記号 (+ 以外) を除いて表記ゆれを吸収する */
export function normalizeName(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/[\s・\-_.!?'"’()（）]/g, '');
}

export function guessDomain(name: string): string | undefined {
  const n = normalizeName(name);
  if (!n) return undefined;
  for (const [aliases, domain] of KNOWN_SERVICES) {
    if (aliases.some((a) => normalizeName(a) === n)) return domain;
  }
  // 「Netflix プレミアム」のように前方一致するもの (3文字以上の別名のみ)
  for (const [aliases, domain] of KNOWN_SERVICES) {
    if (aliases.some((a) => normalizeName(a).length >= 3 && n.startsWith(normalizeName(a)))) return domain;
  }
  return undefined;
}

/** URL を貼られてもドメインだけ取り出す (https://www.netflix.com/jp/ → netflix.com) */
export function cleanDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
}

export const LOGO_HOST = 'https://www.google.com/s2/favicons';
export const logoUrl = (domain: string) => `${LOGO_HOST}?domain=${encodeURIComponent(domain)}&sz=128`;

/** 名前から決まった色相 (頭文字アイコンの背景色用) */
export function nameHue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}
