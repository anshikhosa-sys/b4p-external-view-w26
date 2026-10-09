import { useState } from 'react';
import Filters from './Filters';
import { EmptyState } from './States';
import TypeTable from './TypeTable';
import TypeTiles from './TypeTiles';

const ROW_BUDGET = 150; // rows rendered before "Show more"

export default function SearchResults({ query, types, groups, count, filters, setFilter, onClearSearch, tableProps }) {
  const [budget, setBudget] = useState(ROW_BUDGET);
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setBudget(ROW_BUDGET);
  }

  let used = 0;
  const shown = [];
  for (const g of groups) {
    if (used >= budget) break;
    const take = Math.min(g.items.length, budget - used);
    shown.push({ group: g, limit: take < g.items.length ? take : undefined });
    used += take;
  }

  return (
    <div className="search-results">
      <h1 className="page-title">Results for “{query}”</h1>
      {types.length > 0 && (
        <>
          <h2 className="section-title">Matching types</h2>
          <TypeTiles types={types} hrefFor={(t) => `#/c/${t.category.slug}/${t.slug}`} label="Matching types" />
        </>
      )}
      <Filters filters={filters} setFilter={setFilter} count={count} />
      {count === 0 ? (
        <EmptyState
          title={`No supplies match “${query}”`}
          action={<button type="button" className="btn btn--secondary" onClick={onClearSearch}>Clear search</button>}
        >
          Try a shorter or more general word, like “syringe” instead of a part number.
        </EmptyState>
      ) : (
        <>
          {shown.map(({ group, limit }) => (
            <TypeTable key={`${group.category ? group.category.slug : ''}-${group.slug}`} group={group} limit={limit} {...tableProps} />
          ))}
          {used < count && (
            <div className="more">
              <p className="more__count">
                Showing <span className="num">{used}</span> of <span className="num">{count.toLocaleString('en-US')}</span>
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
