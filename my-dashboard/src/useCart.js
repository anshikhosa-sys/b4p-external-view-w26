import { useCallback, useEffect, useRef, useState } from 'react';
import { readJSON, writeJSON } from './storage';

export const CART_KEY = 'b4p.cart.v1';
export const MAX_LINES = 100; // server limit per request
export const MAX_QTY = 10000; // server limit per line

// Lines are keyed by product (name + maker). Older saves used a sheet row number;
// reconcile() migrates those once inventory loads.
const validId = (id) => (Number.isInteger(id) && id > 0) || (typeof id === 'string' && id.length > 0 && id.length <= 400);

function cleanLines(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const l of value) {
    if (!l || !validId(l.id) || seen.has(l.id) || typeof l.name !== 'string') continue;
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) continue;
    const max = Number.isInteger(l.max) && l.max >= 0 ? l.max : null;
    seen.add(l.id);
    out.push({ ...l, max, quantity: Math.min(l.quantity, MAX_QTY, max ?? MAX_QTY) || 1 });
    if (out.length === MAX_LINES) break;
  }
  return out;
}

// Catalog items carry stock in `quantity`; slip lines carry it in `max`
// (their `quantity` is the amount requested).
const stockOf = (itemOrLine) => ('max' in itemOrLine ? itemOrLine.max : itemOrLine.quantity);

export function capQuantity(qty, max) {
  const n = Math.floor(Number(qty));
  if (!Number.isFinite(n) || n <= 0) return 0;
  const limit = max == null ? MAX_QTY : Math.min(max, MAX_QTY);
  return Math.min(n, limit);
}

function lineFrom(item, quantity) {
  return {
    id: item.id,
    name: item.name,
    requestName: item.requestName || item.name,
    category: item.category,
    subcategory: item.subcategory,
    needsReview: !!item.needsReview,
    lotCount: item.lots ? item.lots.length : 1,
    max: stockOf(item) ?? null,
    quantity,
  };
}

// Cart keyed by product, persisted in localStorage, quantities capped at stock.
export default function useCart() {
  const [lines, setLines] = useState(() => cleanLines(readJSON(CART_KEY, [])));

  const linesRef = useRef(lines);
  linesRef.current = lines;

  useEffect(() => writeJSON(CART_KEY, lines), [lines]);

  // Keep several open tabs in step.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === CART_KEY) setLines(cleanLines(readJSON(CART_KEY, [])));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Returns false when a new line would go past the per-request limit.
  const setQuantity = useCallback((item, qty) => {
    const current = linesRef.current;
    const exists = current.some((l) => l.id === item.id);
    if (!exists && current.length >= MAX_LINES && capQuantity(qty, stockOf(item)) > 0) return false;
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.id === item.id);
      const capped = capQuantity(qty, stockOf(item));
      if (idx === -1) {
        if (capped === 0 || prev.length >= MAX_LINES) return prev;
        return [...prev, lineFrom(item, capped)];
      }
      if (capped === 0) return prev.filter((l) => l.id !== item.id);
      const next = [...prev];
      next[idx] = { ...prev[idx], quantity: capped };
      return next;
    });
    return true;
  }, []);

  // Put a removed line back where it was (undo).
  const restore = useCallback((line, index) => {
    setLines((prev) => {
      if (prev.some((l) => l.id === line.id) || prev.length >= MAX_LINES) return prev;
      const next = [...prev];
      next.splice(Math.min(index, next.length), 0, line);
      return next;
    });
  }, []);

  const remove = useCallback((id) => setLines((prev) => prev.filter((l) => l.id !== id)), []);
  const clear = useCallback(() => setLines([]), []);

  // After inventory loads: refresh snapshots, re-cap, migrate row-keyed lines to
  // products, and drop lines that vanished or can no longer be requested.
  // `forRow` maps a sheet row to its product (for old saves). Returns removed names.
  const reconcile = useCallback((byId, forRow) => {
    const prev = linesRef.current;
    const removed = [];
    const merged = new Map();
    const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    for (const line of prev) {
      const legacy = typeof line.id === 'number' && forRow;
      const product = legacy ? forRow.get(line.id) : byId.get(line.id);
      const matches = product && (!legacy || same(line.name, product.name) || same(line.name, product.rawName));
      if (!matches || product.expiryState === 'expired' || product.quantity === 0) {
        removed.push(line.name);
        continue;
      }
      const qty = (merged.has(product.id) ? merged.get(product.id).quantity : 0) + line.quantity;
      merged.set(product.id, lineFrom(product, capQuantity(qty, product.quantity) || 1));
    }
    const next = [...merged.values()].slice(0, MAX_LINES);
    const unchanged = next.length === prev.length && next.every((l, i) => JSON.stringify(l) === JSON.stringify(prev[i]));
    if (!unchanged) setLines(next);
    return removed;
  }, []);

  const quantityOf = useCallback((id) => {
    const line = lines.find((l) => l.id === id);
    return line ? line.quantity : 0;
  }, [lines]);

  const totalUnits = lines.reduce((sum, l) => sum + l.quantity, 0);

  return { lines, setQuantity, remove, restore, clear, reconcile, quantityOf, totalUnits };
}
