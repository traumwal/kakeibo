import { useEffect, useState } from 'react';
import { logoUrl, nameHue } from '../lib/logo';

/** サービスのロゴ。ドメイン未設定・読み込み失敗時は頭文字の丸アイコン */
export function SubIcon({ name, domain, size = 40 }: { name: string; domain?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [domain]);
  const style = { width: size, height: size, fontSize: size * 0.45 };
  if (domain && !failed) {
    return (
      <span className="sub-icon logo" style={style}>
        <img src={logoUrl(domain)} alt="" loading="lazy" onError={() => setFailed(true)}
          onLoad={(e) => { if (e.currentTarget.naturalWidth <= 16) setFailed(true); }} />
      </span>
    );
  }
  const initial = [...(name.trim() || '?')][0].toUpperCase();
  return (
    <span className="sub-icon initial" style={{ ...style, background: `hsl(${nameHue(name)} 55% 45%)` }} aria-hidden>
      {initial}
    </span>
  );
}
