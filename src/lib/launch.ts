/** 「アプリを開いたら記録画面を出す」の設定。端末ごと (スマホはオン・パソコンはオフなど) なので同期しない */
const KEY = 'kakeibo.openFormOnLaunch';

export function loadOpenOnLaunch(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function saveOpenOnLaunch(on: boolean): void {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* 保存できなくても今回は切り替える */ }
}

/** ホーム画面のアプリは閉じても裏に残るので、これ以上使っていなかったあとに戻ってきたら「開いた」とみなす */
export const RESUME_AFTER_MS = 60_000;
