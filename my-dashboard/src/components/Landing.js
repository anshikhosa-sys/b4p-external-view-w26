import { memo, useCallback, useEffect, useState } from 'react';
import { iconForSubcategory, ProductIcon } from '../catalogIcons';

const FIRST = 6;
const OPEN_KEY = 'b4p.landing.open.v1'; // which cards are expanded, for this browser session

function readOpen() {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(OPEN_KEY));
    return new Set(Array.isArray(v) ? v.filter((s) => typeof s === 'string') : []);
  } catch {
    return new Set();
  }
}

// The home page: every category (A–Z across rows) as an even card listing its
// first types, expandable to all of them.
function Landing({ catalog, total }) {
  const [open, setOpen] = useState(readOpen);
  useEffect(() => {
    try {
      window.sessionStorage.setItem(OPEN_KEY, JSON.stringify([...open]));
    } catch {
      // Storage unavailable: the choice just won't survive a reload.
    }
  }, [open]);

  const toggle = useCallback((slug) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    return next;
  }), []);

  const long = catalog.filter((c) => c.types.length > FIRST);
  const allOpen = long.length > 0 && long.every((c) => open.has(c.slug));

  return (
    <div className="landing">
      <div className="landing__head">
        <div>
          <h1 className="page-title">Supplies for partner clinics</h1>
          <p className="lede">
            {total.toLocaleString('en-US')} donated medical supplies, ready to request. Pick a category or search above.
          </p>
        </div>
        {long.length > 0 && (
          <button
            type="button"
            className="btn btn--quiet landing__all"
            onClick={() => setOpen(allOpen ? new Set() : new Set(long.map((c) => c.slug)))}
          >
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        )}
      </div>
      <div className="landing__grid">
        {catalog.map((cat) => {
          const expanded = open.has(cat.slug);
          const types = expanded ? cat.types : cat.types.slice(0, FIRST);
          const listId = `cat-types-${cat.slug}`;
          return (
            <section key={cat.slug} className="cat" aria-labelledby={`cat-${cat.slug}`}>
              <h2 className="cat__title" id={`cat-${cat.slug}`}>
                <a href={`#/c/${cat.slug}`} title={cat.name}>
                  <span className="cat__art"><ProductIcon type={iconForSubcategory(cat.name)} size={32} /></span>
                  <span className="cat__name">{cat.name}</span>
                </a>
                <span className="cat__count num">{cat.count.toLocaleString('en-US')}</span>
              </h2>
              <ul className="cat__types" id={listId}>
                {types.map((t) => (
                  <li key={t.slug}>
                    <a href={`#/c/${cat.slug}/${t.slug}`}>{t.label}</a>{' '}
                    <span className="cat__n num">{t.items.length}</span>
                  </li>
                ))}
              </ul>
              {cat.types.length > FIRST && (
                <button
                  type="button"
                  className="linklike cat__toggle"
                  aria-expanded={expanded}
                  aria-controls={listId}
                  onClick={() => toggle(cat.slug)}
                >
                  {expanded ? 'Show fewer' : `Show all ${cat.types.length} types`}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default memo(Landing);
