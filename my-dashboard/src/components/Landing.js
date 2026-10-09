import { iconForSubcategory, ProductIcon } from '../catalogIcons';

const TYPES_SHOWN = 8;

// The home page: every category with its product types as links, McMaster style.
export default function Landing({ catalog, total, hiddenCount = 0 }) {
  return (
    <div className="landing">
      <h1 className="page-title">Supplies for partner clinics</h1>
      <p className="lede">
        {total.toLocaleString('en-US')} donated medical supplies, ready to request. Pick a category or search above.
      </p>
      <div className="landing__grid">
        {catalog.map((cat) => {
          return (
            <section key={cat.slug} className="cat" aria-labelledby={`cat-${cat.slug}`}>
              <h2 className="cat__title" id={`cat-${cat.slug}`}>
                <a href={`#/c/${cat.slug}`}>
                  <span className="cat__art"><ProductIcon type={iconForSubcategory(cat.name)} size={32} /></span>
                  {cat.name}
                </a>
                <span className="cat__count num">{cat.count.toLocaleString('en-US')}</span>
              </h2>
              <ul className="cat__types">
                {cat.types.slice(0, TYPES_SHOWN).map((t) => (
                  <li key={t.slug}>
                    <a href={`#/c/${cat.slug}/${t.slug}`}>{t.label}</a>{' '}
                    <span className="cat__n num">{t.items.length}</span>
                  </li>
                ))}
                {cat.types.length > TYPES_SHOWN && (
                  <li>
                    <a href={`#/c/${cat.slug}`} className="cat__more">
                      {cat.types.length - TYPES_SHOWN} more {cat.types.length - TYPES_SHOWN === 1 ? 'type' : 'types'}
                    </a>
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
      {hiddenCount > 0 && (
        <p className="footnote">
          {hiddenCount} unlabelled {hiddenCount === 1 ? 'item isn’t' : 'items aren’t'} shown. Ask HQ if you’re looking for something specific.
        </p>
      )}
    </div>
  );
}
