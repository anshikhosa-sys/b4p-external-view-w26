import { useEffect } from 'react';
import useProgressive, { budgetGroups } from '../progressive';
import Filters from './Filters';
import { EmptyState } from './States';
import TypeTable from './TypeTable';
import TypeTiles from './TypeTiles';

export default function CategoryPage({ category, groups, count, filters, setFilter, onClearFilters, typeSlug, tableProps }) {
  const progressive = useProgressive(count, `${category.slug}|${count}`);
  // A deep link to one type renders everything at once so the jump lands.
  const budget = typeSlug ? count : progressive;
  const { shown } = budgetGroups(groups, budget);

  // #/c/<category>/<type> jumps to that type's table.
  useEffect(() => {
    if (!typeSlug) return;
    const el = document.getElementById(`type-${typeSlug}`);
    if (el) {
      el.scrollIntoView({ block: 'start' });
      el.focus({ preventScroll: true });
    }
  }, [typeSlug, category.slug]);

  return (
    <div className="category">
      <h1 className="page-title">{category.name}</h1>
      <TypeTiles
        types={category.types}
        hrefFor={(t) => `#/c/${category.slug}/${t.slug}`}
        label={`Types of ${category.name}`}
      />
      <Filters filters={filters} setFilter={setFilter} count={count} />
      {groups.length === 0 ? (
        <EmptyState
          title="Nothing here matches these filters"
          action={<button type="button" className="btn btn--secondary" onClick={onClearFilters}>Show everything</button>}
        />
      ) : (
        shown.map(({ group, limit }) => <TypeTable key={group.slug} group={group} limit={limit} {...tableProps} />)
      )}
    </div>
  );
}
