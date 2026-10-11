import { useState } from 'react';
import useProgressive, { budgetGroups } from '../progressive';
import Filters from './Filters';
import { EmptyState } from './States';
import TypeTable from './TypeTable';
import TypeTiles from './TypeTiles';

const ROW_BUDGET = 150; // rows before "Show more"

export default function SearchResults({ query, types, groups, count, filters, setFilter, onClearSearch, tableProps }) {
  const [budget, setBudget] = useState(ROW_BUDGET);
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setBudget(ROW_BUDGET);
  }
  const progressive = useProgressive(Math.min(budget, count), `${query}|${count}`);
  const { shown, used } = budgetGroups(groups, progressive);
  const capped = Math.min(budget, count);

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
          {shown.map(({ group, limit }, i) => (
            <div key={`${group.alsoMatched ? 'b' : 'a'}${group.slug}`}>
              {group.alsoMatched && !(i > 0 && shown[i - 1].group.alsoMatched) && (
                <h2 className="section-title">Also in matching categories</h2>
              )}
              <TypeTable group={group} limit={limit} {...tableProps} />
            </div>
          ))}
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
