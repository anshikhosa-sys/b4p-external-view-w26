import { useEffect, useState } from 'react';

const FIRST = 60;
const CHUNK = 80;
const idle = window.requestIdleCallback
  ? (fn) => window.requestIdleCallback(fn, { timeout: 200 })
  : (fn) => window.setTimeout(fn, 16);
const cancelIdle = window.cancelIdleCallback || window.clearTimeout;

// Long lists paint the first rows at once, then the rest in idle-time chunks,
// so no single render blocks the main thread. Restarts when `key` changes.
export default function useProgressive(total, key) {
  const [state, setState] = useState({ key, count: FIRST });
  const count = state.key === key ? state.count : FIRST;
  if (state.key !== key) setState({ key, count: FIRST });

  useEffect(() => {
    if (count >= total) return undefined;
    const handle = idle(() => setState((s) => (s.key === key ? { key, count: s.count + CHUNK } : s)));
    return () => cancelIdle(handle);
  }, [count, total, key]);

  return Math.min(count, total);
}

// Spread a row budget over groups in order: [{group, limit}] (limit undefined = all rows).
export function budgetGroups(groups, budget) {
  let used = 0;
  const shown = [];
  for (const group of groups) {
    if (used >= budget) break;
    const take = Math.min(group.items.length, budget - used);
    shown.push({ group, limit: take < group.items.length ? take : undefined });
    used += take;
  }
  return { shown, used };
}
