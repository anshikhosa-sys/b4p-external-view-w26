import { memo } from 'react';
import { iconForSubcategory, ProductIcon } from '../catalogIcons';

// The home page: every category (A–Z) with its product types as links, McMaster style.
function Landing({ catalog, total }) {
  return (
    <div className="landing">
      <h1 className="page-title">Supplies for partner clinics</h1>
      <p className="lede">
        {total.toLocaleString('en-US')} donated medical supplies, ready to request. Pick a category or search above.
      </p>
      <div className="landing__grid">
        {catalog.map((cat) => (
          <section key={cat.slug} className="cat" aria-labelledby={`cat-${cat.slug}`}>
            <h2 className="cat__title" id={`cat-${cat.slug}`}>
              <a href={`#/c/${cat.slug}`}>
                <span className="cat__art"><ProductIcon type={iconForSubcategory(cat.name)} size={32} /></span>
                {cat.name}
              </a>
              <span className="cat__count num">{cat.count.toLocaleString('en-US')}</span>
            </h2>
            <ul className="cat__types">
              {cat.types.map((t) => (
                <li key={t.slug}>
                  <a href={`#/c/${cat.slug}/${t.slug}`}>{t.label}</a>{' '}
                  <span className="cat__n num">{t.items.length}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export default memo(Landing);
