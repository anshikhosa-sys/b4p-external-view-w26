import Icon from './Icons';
import SearchBar from './SearchBar';

export default function Header({ view, lineCount, onOpenSlip, onOpenCategories, query, onQuery, total }) {
  return (
    <header className="header">
      <div className="header__inner">
        <a className="header__brand" href="#/" onClick={() => onQuery('')}>
          {/* Inlined into the CSS as a data: URI, so the page makes no image requests. */}
          <span className="header__logo" role="img" aria-label="Blueprints for Pangaea, request supplies" />
        </a>
        {onOpenCategories && (
          <button type="button" className="header__cats btn btn--quiet" onClick={onOpenCategories}>
            <Icon name="list" size={18} /> <span className="header__cats-label">Categories</span>
          </button>
        )}
        <SearchBar value={query} onChange={onQuery} total={total} />
        <nav className="header__nav" aria-label="Main">
          <a href="#/requests" className="header__link" aria-current={view === 'requests' ? 'page' : undefined}>
            My requests
          </a>
        </nav>
        <button type="button" className="header__slip" onClick={onOpenSlip}>
          <Icon name="slip" size={18} />
          <span className="header__slip-label">Request</span>
          <span className="header__count num" aria-label={`${lineCount} ${lineCount === 1 ? 'supply' : 'supplies'}`}>{lineCount}</span>
        </button>
      </div>
    </header>
  );
}
