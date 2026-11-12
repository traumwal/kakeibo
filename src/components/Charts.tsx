import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import type { CategoryTotal, MonthSummary } from '../lib/calc';
import { formatYen } from '../lib/format';

const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
const compactYen = (n: number) => (n >= 10000 ? `${trim(n / 10000)}万` : n >= 1000 ? `${trim(n / 1000)}千` : `${Math.round(n)}`);

/** カテゴリ別の横棒。金額を棒の右に直接表示する (円グラフより金額が読みやすい) */
export function CategoryBars({ data }: { data: CategoryTotal[] }) {
  if (data.length === 0) return <p className="empty">まだ支出がありません</p>;
  const max = Math.max(...data.map((d) => Math.max(d.amount, d.budget ?? 0)));
  return (
    <ul className="hbars">
      {data.map((d) => {
        const over = d.budget != null && d.amount > d.budget;
        return (
          <li key={d.category}>
            <div className="hbar-head">
              <span>{d.category}</span>
              <span className={over ? 'num over' : 'num'}>
                {formatYen(d.amount)}
                {d.budget != null && <small> / {formatYen(d.budget)}</small>}
              </span>
            </div>
            <div className="hbar-track">
              <div className={over ? 'hbar-fill over' : 'hbar-fill'} style={{ width: `${(d.amount / max) * 100}%` }} />
              {d.budget != null && <div className="hbar-budget" style={{ left: `${(d.budget / max) * 100}%` }} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** 月別推移: 固定費と単発支出の積み上げ縦棒、合計を上に表示 */
export function TrendChart({ data }: { data: MonthSummary[] }) {
  const rows = data.map((d) => ({ ...d, label: `${Number(d.ym.slice(5))}月` }));
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} margin={{ top: 20, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
          <YAxis domain={[0, (max: number) => Math.ceil(max * 1.15)]} tickFormatter={compactYen} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} width={44} />
          <Tooltip
            formatter={(v: number) => formatYen(v)}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
            cursor={{ fill: 'var(--hover)' }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="subscriptions" name="サブスク・固定費" stackId="a" fill="var(--c1)" />
          <Bar dataKey="expenses" name="単発支出" stackId="a" fill="var(--c2)" radius={[4, 4, 0, 0]}>
            <LabelList dataKey="total" position="top" formatter={(v: number) => (v > 0 ? compactYen(v) : '')} style={{ fill: 'var(--text)', fontSize: 11 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
