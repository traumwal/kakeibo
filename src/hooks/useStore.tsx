import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppData } from '../types';
import { loadData, saveData } from '../lib/storage';

interface Store {
  data: AppData;
  update: (fn: (d: AppData) => AppData) => void;
  replace: (d: AppData) => void;
  saveError: boolean;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(loadData);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    setSaveError(!saveData(data));
  }, [data]);

  const update = useCallback((fn: (d: AppData) => AppData) => setData((d) => fn(d)), []);
  const value = useMemo(() => ({ data, update, replace: setData, saveError }), [data, update, saveError]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider がありません');
  return s;
}
