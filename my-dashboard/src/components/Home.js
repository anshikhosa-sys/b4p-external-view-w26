import { useEffect, useRef, useState } from 'react';
import { canRequest, photoSrc } from '../inventory';

// The home page, for everyone: a welcome with real photos of what's on the shelves (scrolling
// by itself), then a short overview of how a request travels and a link to the full guide.

const TRACK = [
  { title: 'Sign in', text: 'With the work email we invited. First time? Open the invite and choose a password.' },
  { title: 'Fill your list', text: <>Click <strong>+ Add to list</strong> next to anything you need.</> },
  { title: 'Send it', text: <>Open <strong>Your list</strong>, check the amounts, click <strong>Send request</strong>.</> },
  { title: 'We pack and ship', text: 'Reviewed, approved, shipped. You hear from us each time.' },
];

const SHELF_SIZE = 18;
const NO_ITEMS = []; // one shared empty list, so effects that depend on it don't rerun every render
const SPEED = 16; // px per second, slow enough to read the names
const EASE_MS = 120; // time constant for slowing to a stop and starting again (settles in ~300 ms)
const LAST_KEY = 'b4p.shelf.last'; // the previous visit's photos, so the next visit shows others

// Fisher-Yates with an injectable random function (tests pass a seeded one).
export function shuffle(list, random = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Up to 18 random in-stock supplies with a photo (privacy-filtered by the server), spread across
// categories: one random pick per category in turn, in random category order. Supplies in `avoid`
// (last visit's) are used only when there aren't enough others.
export function pickShelf(products, size = SHELF_SIZE, random = Math.random, avoid = new Set()) {
  const eligible = (products || [])
    .filter((p) => canRequest(p) && p.quantity > 0)
    .map((p) => ({ p, lot: p.lots.find((l) => l.photoId && canRequest(l)) }))
    .filter((x) => x.lot);
  const fresh = eligible.filter((x) => !avoid.has(x.p.id));
  const seenBefore = eligible.filter((x) => avoid.has(x.p.id));
  const roundRobin = (pool) => {
    const byCat = new Map();
    for (const x of shuffle(pool, random)) {
      if (!byCat.has(x.p.subcategory)) byCat.set(x.p.subcategory, []);
      byCat.get(x.p.subcategory).push(x);
    }
    const queues = shuffle([...byCat.values()], random);
    const out = [];
    while (queues.some((q) => q.length)) for (const q of queues) if (q.length) out.push(q.shift());
    return out;
  };
  return [...roundRobin(fresh), ...roundRobin(seenBefore)]
    .slice(0, size)
    .map(({ p, lot }) => ({ id: p.id, name: p.name, row: lot.id, photoId: lot.photoId }));
}

function readLast() {
  try { return new Set(JSON.parse(window.sessionStorage.getItem(LAST_KEY) || '[]')); } catch { return new Set(); }
}
function writeLast(ids) {
  try { window.sessionStorage.setItem(LAST_KEY, JSON.stringify(ids)); } catch { /* private mode: fine */ }
}

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// One photo tile; it fades in once its photo has loaded. A photo that fails to load takes its
// tile with it. The copy that makes the loop seamless is hidden from screen readers and Tab.
function ShelfTile({ item, onFail, copy }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <li className="shelf__tile" aria-hidden={copy || undefined}>
      <a href={`#/item/${item.row}`} tabIndex={copy ? -1 : undefined}>
        <img src={photoSrc(item.photoId)} alt="" width="200" height="200" decoding="async"
          className={loaded ? 'is-loaded' : undefined} referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)} onError={() => onFail(item.id)} />
        <span className="shelf__name">{item.name}</span>
      </a>
    </li>
  );
}

// Moves the grid up one pixel-exact copy height per loop, on the compositor (translate3d), at a
// constant speed. Pausing eases the speed to zero and back instead of stopping dead.
function useShelfScroll(gridRef, { enabled, paused }) {
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(() => {
    const grid = gridRef.current;
    if (!enabled || !grid || reducedMotion() || typeof window.requestAnimationFrame !== 'function') return undefined;
    let period = 0;
    const measure = () => {
      const first = grid.children[0];
      const copy = grid.querySelector('[aria-hidden="true"]');
      period = first && copy ? copy.offsetTop - first.offsetTop : 0;
    };
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(grid);
    let pos = 0;
    let speed = 0;
    let last = null;
    let frame;
    const step = (t) => {
      const dt = last == null ? 0 : Math.min(0.1, (t - last) / 1000); // a background tab doesn't leap
      last = t;
      const target = pausedRef.current ? 0 : SPEED;
      speed += (target - speed) * Math.min(1, (dt * 1000) / EASE_MS);
      if (period > 0) {
        pos = (pos + speed * dt) % period;
        grid.style.transform = `translate3d(0, ${-pos.toFixed(2)}px, 0)`;
      }
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(frame);
      if (ro) ro.disconnect();
      grid.style.transform = '';
    };
  }, [gridRef, enabled]);
}

// Resolves once the first photos have loaded (or after a short wait), so the loop starts smoothly.
function preload(items, ms = 2500) {
  const first = items.slice(0, 9).map((i) => new Promise((done) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = done;
    img.onerror = done;
    img.src = photoSrc(i.photoId);
  }));
  return Promise.race([Promise.all(first), new Promise((done) => setTimeout(done, ms))]);
}

// The shelf: a random set of real photos, chosen once per page, scrolling up slowly in a loop.
// It eases to a stop under the mouse, while a tile has focus, or while a finger is on it.
// With reduced motion it stays still and can be scrolled by hand. Its space is reserved while
// the list loads, so nothing on the page jumps when the photos arrive.
function Shelf({ products, fresh, random = Math.random }) {
  // Chosen once per page, as soon as there are photos to choose from. An older saved copy of the
  // list (shown first while the fresh one loads) may have no photos; then we wait for the fresh one.
  const pickedRef = useRef(null);
  if (!pickedRef.current && products && products.length) {
    const picks = pickShelf(products, SHELF_SIZE, random, readLast());
    if (picks.length) {
      pickedRef.current = picks;
      writeLast(picks.map((i) => i.id));
    }
  }
  const items = pickedRef.current || NO_ITEMS;
  const [failed, setFailed] = useState(() => new Set());
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [touch, setTouch] = useState(false);
  const [ready, setReady] = useState(false);
  const gridRef = useRef(null);
  const shown = items.filter((i) => !failed.has(i.id));
  const moving = shown.length > 6; // a short shelf fits the window and stays still

  useEffect(() => {
    if (!items.length) return undefined;
    let live = true;
    preload(items).then(() => live && setReady(true));
    return () => { live = false; };
  }, [items]);
  useShelfScroll(gridRef, { enabled: moving && ready, paused: hover || focus || touch });

  const loading = !items.length && !fresh; // placeholders until the fresh list is in
  if (!loading && !shown.length) return null;
  const fail = (id) => setFailed((f) => new Set(f).add(id));
  return (
    <figure className="shelf">
      <div
        className={`shelf__window${moving || loading ? ' shelf__window--moving' : ''}${ready ? ' is-ready' : ''}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setFocus(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false); }}
        onTouchStart={() => setTouch(true)}
        onTouchEnd={() => setTouch(false)}
        onTouchCancel={() => setTouch(false)}
      >
        {loading ? (
          <ul className="shelf__grid shelf__grid--loading" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => <li key={i} className="shelf__tile"><span className="shelf__ghost" /></li>)}
          </ul>
        ) : (
          <ul className="shelf__grid" ref={gridRef} aria-label="Some supplies on our shelves">
            {shown.map((item) => <ShelfTile key={item.id} item={item} onFail={fail} />)}
            {moving && shown.map((item) => <ShelfTile key={`copy-${item.id}`} item={item} onFail={fail} copy />)}
          </ul>
        )}
      </div>
      <figcaption className="shelf__caption">
        <strong>Click a supply to view it.</strong> Real photos of supplies on our shelves today.
      </figcaption>
    </figure>
  );
}

export default function Home({ clinic, products, fresh = true }) {
  const signedIn = !!clinic;
  const titleRef = useRef(null);
  useEffect(() => titleRef.current && titleRef.current.focus(), []);

  return (
    <div className="guide home">
      <header className="guide__intro">
        <div className="guide__intro-text">
          <h1 className="guide__title" tabIndex={-1} ref={titleRef}>Welcome, {clinic || 'clinic'}</h1>
          <p className="guide__lede">
            Blueprints for Pangaea sends donated supplies to partner clinics at no cost. You see exactly
            what’s on our shelves, down to the box.
          </p>
          <div className="guide__actions">
            <a className="btn btn--primary btn--lg" href="#/supplies">Request supplies</a>
            {!signedIn && (
              <p className="guide__signin">Already have an account? <a href="#/signin">Sign in</a></p>
            )}
          </div>
        </div>
        <Shelf products={products} fresh={fresh} />
      </header>

      <section className="journey" id="how" aria-labelledby="how-title">
        <h2 className="journey__title" id="how-title">How a request travels</h2>
        <p className="journey__lede">Like tracking a package: we email you at each stop.</p>
        <ol className="journey__stops">
          {TRACK.map((stop, i) => (
            <li key={stop.title} className="journey__stop">
              <span className="journey__dot" aria-hidden="true">{i + 1}</span>
              <div>
                <h3 className="journey__stop-title">{stop.title}</h3>
                <p>{stop.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="journey__more">
          New to this? <a href="#/guide">Read the full step-by-step guide</a>, with pictures of every screen.
        </p>
      </section>
    </div>
  );
}
