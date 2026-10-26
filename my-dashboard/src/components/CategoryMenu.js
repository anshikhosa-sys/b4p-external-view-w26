import { useEffect, useRef, useState } from 'react';
import { navigate } from '../hooks';
import Icon from './Icons';

// "Categories ▾" at the top of the supply pages: a menu of every category with its count.
// The button names the current category. Closes on a pick, an outside click or Escape;
// arrow keys, Home and End move through the list. On phones it opens as a full-width list.
export default function CategoryMenu({ catalog, activeSlug, total, onNavigate }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const current = catalog.find((c) => c.slug === activeSlug);

  const items = () => [...listRef.current.querySelectorAll('[role="menuitem"]')];
  const focusItem = (i) => {
    const all = items();
    if (all.length) all[(i + all.length) % all.length].focus();
  };

  // Opening moves focus to the current category (or the first entry).
  useEffect(() => {
    if (!open) return undefined;
    const all = items();
    const at = Math.max(0, all.findIndex((a) => a.getAttribute('aria-current') === 'page'));
    if (all[at]) all[at].focus();
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const close = (refocus) => {
    setOpen(false);
    if (refocus && buttonRef.current) buttonRef.current.focus();
  };

  const onListKey = (e) => {
    const all = items();
    const i = all.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focusItem(0); }
    else if (e.key === 'End') { e.preventDefault(); focusItem(all.length - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') setOpen(false);
  };

  const onButtonKey = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
    }
  };

  // Go there ourselves: closing the menu removes the link before its own navigation would run.
  const pick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // new tab or window: leave it to the browser
    e.preventDefault();
    if (onNavigate) onNavigate();
    navigate(e.currentTarget.getAttribute('href').replace(/^#/, ''));
    close(false);
  };

  const entry = (href, label, count, isCurrent) => (
    <li role="none">
      <a role="menuitem" href={href} className="catmenu__item" aria-current={isCurrent ? 'page' : undefined} onClick={pick}>
        <span className="catmenu__name">{label}</span>
        <span className="catmenu__count num">{count.toLocaleString('en-US')}</span>
      </a>
    </li>
  );

  return (
    <div className="catmenu" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="catmenu__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="catmenu-list"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKey}
      >
        <Icon name="list" size={18} />
        <span className="catmenu__label">
          Categories: <strong className="catmenu__current">{current ? current.name : 'All categories'}</strong>
        </span>
        <svg className="catmenu__caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul className="catmenu__list" id="catmenu-list" role="menu" aria-label="Categories" ref={listRef} onKeyDown={onListKey}>
          {entry('#/supplies', 'All categories', total, !current)}
          {catalog.map((cat) => (
            <li role="none" key={cat.slug}>
              <a role="menuitem" href={`#/c/${cat.slug}`} className="catmenu__item" aria-current={cat.slug === activeSlug ? 'page' : undefined} onClick={pick}>
                <span className="catmenu__name">{cat.name}</span>
                <span className="catmenu__count num">{cat.count.toLocaleString('en-US')}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
