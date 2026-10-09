import { useEffect } from 'react';
import Filters from './Filters';
import { EmptyState } from './States';
import TypeTable from './TypeTable';
import TypeTiles from './TypeTiles';

export default function CategoryPage({ category, groups, count, filters, setFilter, onClearFilters, typeSlug, tableProps, hiddenCount = 0 }) {
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
        groups.map((g) => <TypeTable key={g.slug} group={g} {...tableProps} />)
      )}
      {hiddenCount > 0 && (
        <p className="footnote">
          {hiddenCount} unlabelled {hiddenCount === 1 ? 'item isn’t' : 'items aren’t'} shown. Ask HQ if you’re looking for something specific.
        </p>
      )}
    </div>
  );
}
