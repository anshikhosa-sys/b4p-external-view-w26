import Icon from './Icons';
import { useEffect, useRef, useState } from 'react';

// Signed in: the person icon opens a small menu (who is signed in, My requests, Sign out).
function AccountMenu({ account, onSignOut }) {
  const ref = useRef(null);
  return (
    <details className="acct" ref={ref}>
      <summary className="header__icon-btn acct__btn" aria-label={`Account: ${account.org}`}>
        <Icon name="user" size={26} />
        <span className="header__icon-label">Account</span>
      </summary>
      <div className="acct__menu">
        <p className="acct__who">
          Signed in as<br />
          <strong>{account.name || account.org}</strong><br />
          <span className="acct__email">{account.email}</span>
        </p>
        <a className="acct__item" href="#/requests" onClick={() => { ref.current.open = false; }}>My requests</a>
        <a className="acct__item" href="#/team/signin" onClick={() => { ref.current.open = false; }}>Blueprints team sign in</a>
        <button type="button" className="acct__item" onClick={() => { ref.current.open = false; onSignOut(); }}>Sign out</button>
      </div>
    </details>
  );
}

// The one supply search, in the header on every page. Results show as you type; the button
// (and Enter) also takes you to the results from any page.
function HeaderSearch({ value, onChange, onSubmit }) {
  return (
    <form
      className="hsearch"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
        e.currentTarget.querySelector('input').blur();
      }}
    >
      <label htmlFor="supply-search" className="visually-hidden">What supplies do you need?</label>
      <input
        id="supply-search"
        className="hsearch__input"
        type="search"
        autoComplete="off"
        spellCheck="false"
        enterKeyHint="search"
        placeholder="What supplies do you need?"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onChange('');
          }
        }}
      />
      <button type="submit" className="hsearch__btn" aria-label="Search">
        <Icon name="search" size={22} />
      </button>
    </form>
  );
}

// One row, left to right: logo (home), Request supplies, Guide, the search bar, Account, Your list.
// Phones: logo, Account and Your list on top; the search below; then Request supplies and Guide.
export default function Header({
  view, lineCount, units = 0, onOpenSlip, onHome, account, onSignOut, authPage, showSignIn,
  query, onQuery, onSearch,
}) {
  // Counts up each time the list grows (a new supply, or more of one), to replay the animation.
  const [bump, setBump] = useState(0);
  const lastUnits = useRef(units);
  useEffect(() => {
    if (units > lastUnits.current) setBump((n) => n + 1);
    lastUnits.current = units;
  }, [units]);

  const listName = lineCount ? `Your list, ${lineCount} ${lineCount === 1 ? 'supply' : 'supplies'}` : 'Your list, empty';

  return (
    <header className="header">
      <div className="header__inner">
        {/* The logo alone is the way home. Inlined into the CSS as a data: URI, so the page makes no image requests. */}
        <a className="header__brand" href="#/" onClick={onHome} aria-label="Blueprints for Pangaea, home">
          <span className="header__logo" aria-hidden="true" />
        </a>

        <nav className="header__main" aria-label="Main">
          <a className="btn btn--primary header__request" href="#/supplies" onClick={onHome}
            aria-current={view === 'catalog' ? 'page' : undefined}>
            Request supplies
          </a>
          <a href="#/guide" className="header__guide" aria-current={view === 'guide' ? 'page' : undefined}>Guide</a>
        </nav>

        {!authPage && <HeaderSearch value={query} onChange={onQuery} onSubmit={onSearch} />}

        <div className="header__end">
          {account ? (
            <AccountMenu account={account} onSignOut={onSignOut} />
          ) : showSignIn && (
            <a href="#/signin" className="header__icon-btn" aria-label="Account: sign in"
              aria-current={view === 'signin' ? 'page' : undefined}>
              <Icon name="user" size={26} />
              <span className="header__icon-label">Account</span>
            </a>
          )}
          {!authPage && (
            <button type="button" className={`header__icon-btn header__slip${lineCount ? '' : ' header__slip--empty'}`}
              onClick={onOpenSlip} aria-label={listName}>
              {/* Restarted (new key) each time something is added: a ring spreads out and the count pops. */}
              {bump > 0 && <span key={`ring-${bump}`} className="header__slip-ring" aria-hidden="true" />}
              <span className="header__slip-icon" aria-hidden="true">
                <Icon name="slip" size={26} />
                {lineCount > 0 && (
                  <span key={`n-${bump}`} className={`header__badge num${bump ? ' header__slip-n' : ''}`}>{lineCount}</span>
                )}
              </span>
              <span className="header__icon-label">Your list</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
