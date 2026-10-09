import { memo } from 'react';
import { ProductIcon } from '../catalogIcons';

// Every product type A–Z: drawing, name, count. Links jump to that type's table.
function TypeTiles({ types, hrefFor, label }) {
  if (!types.length) return null;
  return (
    <ul className="tiles" aria-label={label}>
      {types.map((t) => (
        <li key={`${t.category ? t.category.slug : ''}-${t.slug}`}>
          <a className="tile" href={hrefFor(t)}>
            <span className="tile__art"><ProductIcon type={t.icon} size={56} /></span>
            <span className="tile__name" title={t.label}>{t.label}</span>
            <span className="tile__count num">{t.items.length.toLocaleString('en-US')}</span>
            {t.category && <span className="tile__cat">in {t.category.name}</span>}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default memo(TypeTiles);
