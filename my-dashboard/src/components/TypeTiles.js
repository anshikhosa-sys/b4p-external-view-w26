import { useState } from 'react';
import { ProductIcon } from '../catalogIcons';

const FIRST = 10; // phones show 6 (see styles.css)
const FIRST_PHONE = 6;

// Grid of product types: drawing, name, count. Links jump to that type's table.
export default function TypeTiles({ types, hrefFor, label }) {
  const [all, setAll] = useState(false);
  if (!types.length) return null;
  const shown = all ? types : types.slice(0, FIRST);
  return (
    <div className="tiles-wrap">
      <ul className={`tiles${all ? '' : ' tiles--collapsed'}`} aria-label={label}>
        {shown.map((t) => (
          <li key={`${t.category ? t.category.slug : ''}-${t.slug}`}>
            <a className="tile" href={hrefFor(t)}>
              <span className="tile__art"><ProductIcon type={t.icon} size={56} /></span>
              <span className="tile__name">{t.label}</span>
              <span className="tile__count num">{t.items.length.toLocaleString('en-US')}</span>
            </a>
          </li>
        ))}
      </ul>
      {types.length > FIRST_PHONE && (
        <button
          type="button"
          className={`linklike tiles__more${types.length <= FIRST ? ' tiles__more--phone' : ''}`}
          aria-expanded={all}
          onClick={() => setAll((v) => !v)}
        >
          {all ? 'Show fewer types' : `Show all ${types.length} types`}
        </button>
      )}
    </div>
  );
}
