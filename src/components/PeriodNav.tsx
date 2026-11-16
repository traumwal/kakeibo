import { useState } from 'react';
import { addMonths, formatYm, today, ymOf } from '../lib/date';
import { monthsOfYear } from '../lib/calc';

export type PeriodKind = 'month' | 'year';

export interface PeriodState {
  kind: PeriodKind;
  ym: string; // 月表示のときの月
  year: number; // 年表示のときの年
  /** 集計する月 (年表示の今年は今月まで) */
  months: string[];
  label: string;
}

/** 月 / 年 の切り替えと前後移動 */
export function usePeriod(): [PeriodState, { setKind: (k: PeriodKind) => void; move: (d: -1 | 1) => void; setYm: (ym: string) => void }] {
  const [kind, setKind] = useState<PeriodKind>('month');
  const [ym, setYm] = useState(ymOf(today()));
  const [year, setYear] = useState(Number(today().slice(0, 4)));
  const nowYm = ymOf(today());
  const state: PeriodState =
    kind === 'month'
      ? { kind, ym, year, months: [ym], label: formatYm(ym) }
      : { kind, ym, year, months: monthsOfYear(year, nowYm), label: `${year}年` };
  return [
    state,
    {
      setKind: (k) => {
        // 見ている月の年 ⇄ 年の1月 (今年なら今月) で行き来する
        if (k === 'year') setYear(Number(ym.slice(0, 4)));
        else setYm(year === Number(nowYm.slice(0, 4)) ? nowYm : `${year}-${ym.slice(5)}`);
        setKind(k);
      },
      move: (d) => (kind === 'month' ? setYm(addMonths(ym, d)) : setYear(year + d)),
      setYm: (v) => {
        setYm(v);
        setYear(Number(v.slice(0, 4)));
      },
    },
  ];
}

export function PeriodNav({ period, actions, suffix = '' }: { period: PeriodState; actions: ReturnType<typeof usePeriod>[1]; suffix?: string }) {
  const unit = period.kind === 'month' ? '月' : '年';
  return (
    <>
      <div className="month-nav">
        <button className="icon-btn" onClick={() => actions.move(-1)} aria-label={`前の${unit}`}>‹</button>
        <h1>{period.label}{suffix}</h1>
        <button className="icon-btn" onClick={() => actions.move(1)} aria-label={`次の${unit}`}>›</button>
      </div>
      <div className="seg two period-toggle">
        <button className={period.kind === 'month' ? 'on' : ''} aria-pressed={period.kind === 'month'} onClick={() => actions.setKind('month')}>月</button>
        <button className={period.kind === 'year' ? 'on' : ''} aria-pressed={period.kind === 'year'} onClick={() => actions.setKind('year')}>年</button>
      </div>
    </>
  );
}
