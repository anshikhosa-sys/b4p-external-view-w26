// McMaster-style category list: always visible on wide screens, a drawer on phones.
export default function CategoryTree({ catalog, activeSlug, total, onNavigate }) {
  return (
    <nav className="tree" aria-label="Categories">
      <a
        href="#/"
        className="tree__link tree__link--all"
        aria-current={!activeSlug ? 'page' : undefined}
        onClick={onNavigate}
      >
        All categories <span className="tree__count num">{total.toLocaleString('en-US')}</span>
      </a>
      <ul>
        {catalog.map((cat) => (
          <li key={cat.slug}>
            <a
              href={`#/c/${cat.slug}`}
              className="tree__link"
              aria-current={cat.slug === activeSlug ? 'page' : undefined}
              onClick={onNavigate}
            >
              <span>{cat.name}</span> <span className="tree__count num">{cat.count.toLocaleString('en-US')}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
