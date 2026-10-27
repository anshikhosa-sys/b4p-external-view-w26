import { useMemo, useState } from 'react';
import { iconForSubcategory } from '../catalogIcons';
import { applyBaseFilters, collate, OTHER_SUBCATEGORY, slugify, sortRows } from '../inventory';
import useProgressive, { budgetGroups } from '../progressive';
import Icon from './Icons';
import { EmptyState } from './States';
import TypeTable from './TypeTable';

const ROW_BUDGET = 150; // rows before "Show more"
const ALL = '';

export const warehouseOf = (p) => p.category || 'Other';

// [{name, count}] A–Z, for a dropdown.
function options(products, key) {
  const counts = new Map();
  for (const p of products) counts.set(key(p), (counts.get(key(p)) || 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => collate(a.name, b.name));
}

// One table per supply type (the sheet's Subcategory), A–Z, with "Other supplies" last.
function bySupplyType(products) {
  const groups = new Map();
  for (const p of products) {
    if (!groups.has(p.subcategory)) groups.set(p.subcategory, []);
    groups.get(p.subcategory).push(p);
  }
  return [...groups.entries()]
    .map(([label, items]) => ({ label, slug: slugify(label), icon: iconForSubcategory(label), items: sortRows(items) }))
    .sort((a, b) => (a.label === OTHER_SUBCATEGORY) - (b.label === OTHER_SUBCATEGORY) || collate(a.label, b.label));
}

function Select({ id, label, value, onChange, choices }) {
  return (
    <div className="finder__field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value={ALL}>All</option>
        {choices.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
      </select>
    </div>
  );
}

// The supplies page: three filters (search, warehouse category, supply type) and the matching
// supplies underneath, one table per supply type.
export default function Browse({ products, search, query, onSearch, tableProps }) {
  const [warehouse, setWarehouse] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [budget, setBudget] = useState(ROW_BUDGET);

  const listed = useMemo(() => applyBaseFilters(products, {}), [products]);
  const warehouses = useMemo(() => options(listed, warehouseOf), [listed]);
  const types = useMemo(() => options(listed, (p) => p.subcategory), [listed]);

  const visible = useMemo(() => applyBaseFilters(listed, { query }).filter((p) => (
    (!warehouse || warehouseOf(p) === warehouse) && (!type || p.subcategory === type)
  )), [listed, query, warehouse, type]);
  const groups = useMemo(() => bySupplyType(visible), [visible]);

  const key = `${query}|${warehouse}|${type}`;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setBudget(ROW_BUDGET);
  }
  const count = visible.length;
  const capped = Math.min(budget, count);
  const progressive = useProgressive(capped, `${key}|${count}`);
  const { shown, used } = budgetGroups(groups, progressive);
  const filtered = !!(search || warehouse || type);
  const clear = () => { onSearch(''); setWarehouse(ALL); setType(ALL); };

  return (
    <div className="browse">
      <h1 className="page-title">Request supplies</h1>
      <form className="finder" role="search" onSubmit={(e) => { e.preventDefault(); e.currentTarget.querySelector('input').blur(); }}>
        <div className="finder__field finder__field--search">
          <label htmlFor="supply-search">Search</label>
          <span className="finder__search">
            <Icon name="search" size={20} />
            <input id="supply-search" type="search" autoComplete="off" spellCheck="false" enterKeyHint="search"
              placeholder="Name, maker, lot…" value={search} onChange={(e) => onSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape' && search) { e.preventDefault(); onSearch(''); } }} />
          </span>
        </div>
        <Select id="f-warehouse" label="Warehouse category" value={warehouse} onChange={setWarehouse} choices={warehouses} />
        <Select id="f-type" label="Supply type" value={type} onChange={setType} choices={types} />
      </form>
      <p className="finder__count" role="status">
        <span className="num">{count.toLocaleString('en-US')}</span> {count === 1 ? 'supply' : 'supplies'}
        {filtered && <> · <button type="button" className="linklike" onClick={clear}>Clear filters</button></>}
      </p>

      {count === 0 ? (
        <EmptyState
          title="Nothing matches"
          action={<button type="button" className="btn btn--secondary" onClick={clear}>Clear filters</button>}
        >
          Try a shorter word, like “syringe” instead of a part number.
        </EmptyState>
      ) : (
        <>
          {shown.map(({ group, limit }) => <TypeTable key={group.slug} group={group} limit={limit} {...tableProps} />)}
          {used >= capped && capped < count && (
            <div className="more">
              <p className="more__count">
                Showing <span className="num">{capped}</span> of <span className="num">{count.toLocaleString('en-US')}</span>
              </p>
              <button type="button" className="btn btn--secondary" onClick={() => setBudget((b) => b + ROW_BUDGET)}>
                Show more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
