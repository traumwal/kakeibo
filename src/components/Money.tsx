import type { Subscription } from '../types';
import { formatYen } from '../lib/format';
import { isUsd } from '../lib/fx';

export const formatUsd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** サブスクの1回の請求額。ドルなら「$22」と、下に円の見込み */
export function SubPrice({ sub, yen, className }: { sub: Subscription; yen: number; className?: string }) {
  const unit = <small>/{sub.cycle === 'monthly' ? '月' : '年'}</small>;
  if (!isUsd(sub)) return <span className={className}>{formatYen(sub.amount)}{unit}</span>;
  return (
    <span className={className}>
      {formatUsd(sub.amount)}{unit}
      <span className="yen-approx">約{formatYen(yen)}</span>
    </span>
  );
}
