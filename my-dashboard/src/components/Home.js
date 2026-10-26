import { useEffect, useMemo, useRef, useState } from 'react';
import { canRequest, photoSrc } from '../inventory';

// The home page, for everyone: a welcome with real photos of what's on the shelves (scrolling
// by itself), then a short overview of how a request travels and a link to the full guide.

const TRACK = [
  { title: 'Sign in', text: 'With the work email we invited. First time? Open the invite and choose a password.' },
  { title: 'Fill your list', text: <>Click <strong>Add to list</strong> next to anything you need.</> },
  { title: 'Send it', text: <>Open <strong>Your list</strong>, check the amounts, click <strong>Send request</strong>.</> },
  { title: 'We pack and ship', text: 'Reviewed, approved, shipped. You hear from us each time.' },
];

const SHELF_SIZE = 18;

// Up to 18 in-stock supplies that have a photo, each from a different category where possible
// (the most-stocked one per category first), so the shelf shows the range rather than all gloves.
export function pickShelf(products, size = SHELF_SIZE) {
  const withPhoto = (products || [])
    .filter((p) => canRequest(p) && p.quantity > 0)
    .map((p) => ({ p, lot: p.lots.find((l) => l.photoId && canRequest(l)) }))
    .filter((x) => x.lot)
    .sort((a, b) => b.p.quantity - a.p.quantity || a.p.name.localeCompare(b.p.name));
  const picked = [];
  const seen = new Set();
  for (const x of withPhoto) {
    if (picked.length === size) break;
    if (!seen.has(x.p.subcategory)) {
      seen.add(x.p.subcategory);
      picked.push(x);
    }
  }
  for (const x of withPhoto) {  // fewer categories with photos than tiles: fill from the rest
    if (picked.length === size) break;
    if (!picked.includes(x)) picked.push(x);
  }
  return picked.map(({ p, lot }) => ({ id: p.id, name: p.name, row: lot.id, photoId: lot.photoId }));
}

// One photo tile. A photo that fails to load (not shared, removed) takes its tile with it.
// The copy that makes the loop seamless is hidden from screen readers and the Tab key.
function ShelfTile({ item, onFail, copy }) {
  return (
    <li className="shelf__tile" aria-hidden={copy || undefined}>
      <a href={`#/item/${item.row}`} tabIndex={copy ? -1 : undefined}>
        <img src={photoSrc(item.photoId)} alt="" width="200" height="200" loading={copy ? 'lazy' : 'eager'}
          decoding="async" referrerPolicy="no-referrer" onError={() => onFail(item.id)} />
        <span className="shelf__name">{item.name}</span>
      </a>
    </li>
  );
}

// The shelf scrolls up by itself, slowly and in a loop (the list is drawn twice and moved up by
// one copy's height). It stops under the mouse, while a tile has focus, or while a finger is on
// it, so a supply can be picked; with reduced motion it stays still (CSS).
function Shelf({ products }) {
  const items = useMemo(() => pickShelf(products), [products]);
  const [failed, setFailed] = useState(() => new Set());
  const [touched, setTouched] = useState(false);
  const shown = items.filter((i) => !failed.has(i.id));
  if (!shown.length) return null;
  const fail = (id) => setFailed((f) => new Set(f).add(id));
  const moving = shown.length > 6; // a short shelf fits the window and stays still
  return (
    <figure className="shelf">
      <div
        className={`shelf__window${moving ? ' shelf__window--moving' : ''}${touched ? ' is-paused' : ''}`}
        onTouchStart={() => setTouched(true)}
        onTouchEnd={() => setTouched(false)}
        onTouchCancel={() => setTouched(false)}
      >
        <ul className="shelf__grid" aria-label="Some supplies on our shelves" style={{ '--rows': Math.ceil(shown.length / 3) }}>
          {shown.map((item) => <ShelfTile key={item.id} item={item} onFail={fail} />)}
          {moving && shown.map((item) => <ShelfTile key={`copy-${item.id}`} item={item} onFail={fail} copy />)}
        </ul>
      </div>
      <figcaption className="shelf__caption">
        <strong>Click a supply to view it.</strong> Real photos of supplies on our shelves today.
      </figcaption>
    </figure>
  );
}

export default function Home({ signedIn, products }) {
  const titleRef = useRef(null);
  useEffect(() => titleRef.current && titleRef.current.focus(), []);

  return (
    <div className="guide home">
      <header className="guide__intro">
        <div className="guide__intro-text">
          <h1 className="guide__title" tabIndex={-1} ref={titleRef}>Free medical supplies, straight from our warehouse</h1>
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
        <Shelf products={products} />
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
