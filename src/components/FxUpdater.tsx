import { useEffect, useRef } from 'react';
import { useStore } from '../hooks/useStore';
import { billingDatesUntil } from '../lib/calc';
import { today } from '../lib/date';
import { fetchRates, isUsd, needsRefresh } from '../lib/fx';

const CHECKED_KEY = 'kakeibo.fx.checkedOn';
const loadChecked = () => {
  try { return localStorage.getItem(CHECKED_KEY); } catch { return null; }
};

/** ドルのサブスクがあるとき、1日1回レートを取りに行く (画面には何も出さない) */
export function FxUpdater() {
  const { data, update } = useStore();
  const busy = useRef(false);
  const t = today();
  const usd = data.subscriptions.filter(isUsd);
  const dates = usd.flatMap((s) => billingDatesUntil(s, t));
  const key = dates.join(',');

  useEffect(() => {
    if (usd.length === 0 || busy.current || !navigator.onLine) return;
    if (!needsRefresh(data.settings.fx, loadChecked(), t, dates)) return;
    busy.current = true;
    fetchRates(data.settings.fx, dates, t)
      .then((fx) => {
        // 取得中にほかの変更があっても消さないよう、レートだけを足す
        update((d) => ({
          ...d,
          settings: { ...d.settings, fx: { ...d.settings.fx, latest: fx.latest ?? d.settings.fx.latest, rates: { ...fx.rates, ...d.settings.fx.rates } } },
        }));
        try { localStorage.setItem(CHECKED_KEY, t); } catch { /* 次に開いたときにまた取りに行くだけ */ }
      })
      .catch(() => { /* オフラインなど。最新のレートか手入力のレートで見込みを出す */ })
      .finally(() => { busy.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, t, usd.length]);

  return null;
}
