import Icon from './Icons';
import { useRef } from 'react';
import SearchBar from './SearchBar';

function AccountMenu({ account, onSignOut }) {
  const ref = useRef(null);
  return (
    <details className="acct" ref={ref}>
      <summary className="acct__btn">
        <span className="acct__initial" aria-hidden="true">{account.org.trim().charAt(0).toUpperCase()}</span>
        <span className="acct__org">{account.org}</span>
        <span className="acct__label">Account</span>
        <span className="visually-hidden">, account menu</span>
      </summary>
      <div className="acct__menu">
        <p className="acct__who">
          Signed in as<br />
          <strong>{account.name || account.org}</strong><br />
          <span className="acct__email">{account.email}</span>
        </p>
        <a className="acct__item" href="#/requests" onClick={() => { ref.current.open = false; }}>My requests</a>
        <button type="button" className="acct__item" onClick={() => { ref.current.open = false; onSignOut(); }}>Sign out</button>
      </div>
    </details>
  );
}

export default function Header({ view, lineCount, onOpenSlip, onOpenCategories, query, onQuery, total, siteName, account, onSignOut, authPage, showSignIn }) {
  return (
    <header className="header">
      <div className="header__inner">
        <a className="header__brand" href="#/" onClick={() => onQuery('')} aria-label={`${siteName}, home`}>
          {/* Inlined into the CSS as a data: URI, so the page makes no image requests. */}
          <span className="header__logo" role="img" aria-label="Blueprints for Pangaea" />
          <span className="header__name">
            <span className="header__name-long">{siteName}</span>
            <span className="header__name-short">Supply Requests</span>
          </span>
        </a>
        {!authPage && onOpenCategories && (
          <button type="button" className="header__cats btn btn--quiet" onClick={onOpenCategories}>
            <Icon name="list" size={18} /> <span className="header__cats-label">Categories</span>
          </button>
        )}
        {!authPage && <SearchBar value={query} onChange={onQuery} total={total} />}
        <nav className="header__nav" aria-label="Main">
          <a href="#/how-it-works" className="header__link header__link--help" aria-current={view === 'guide' ? 'page' : undefined}>
            <span className="header__help-long">How it works</span><span className="header__help-short">Help</span>
          </a>
          {account || !showSignIn ? (
            <a href="#/requests" className="header__link header__link--requests" aria-current={view === 'requests' ? 'page' : undefined}>
              My requests
            </a>
          ) : !authPage && (
            <a href="#/signin" className="header__link" aria-current={view === 'signin' ? 'page' : undefined}>
              Sign in
            </a>
          )}
        </nav>
        {account && <AccountMenu account={account} onSignOut={onSignOut} />}
        {!authPage && <button type="button" className="header__slip" onClick={onOpenSlip}>
          <Icon name="slip" size={18} />
          <span className="header__slip-label">Your list</span>
          <span className="header__count num" aria-label={`${lineCount} ${lineCount === 1 ? 'supply' : 'supplies'}`}>{lineCount}</span>
        </button>}
      </div>
    </header>
  );
}
