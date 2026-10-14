import { memo, useState } from 'react';
import Icon from './Icons';

const FIRST = 6;

const kinds = (n) => `${n} ${n === 1 ? 'kind' : 'kinds'} of supplies`;

// The home page: a big search first, how it works in one line, then one large
// tile per category (A–Z). The tile's heading is a link to the whole category.
function Landing({ catalog, onSearch }) {
  const [text, setText] = useState('');
  return (
    <div className="landing">
      <h1 className="page-title">Supplies for partner clinics</h1>
      <p className="lede">Donated medical supplies, free for partner clinics.</p>

      <form
        className="find"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onSearch(text);
        }}
      >
        <label htmlFor="find-input" className="find__label">What do you need?</label>
        <div className="find__row">
          <input
            id="find-input"
            className="find__input"
            type="search"
            autoComplete="off"
            enterKeyHint="search"
            placeholder="Type a supply, like gloves or gauze"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="btn btn--primary find__btn">
            <Icon name="search" size={20} /> Search
          </button>
        </div>
      </form>

      <a className="how" href="#/how-it-works">
        <span className="visually-hidden">How it works: </span>
        <ol className="how__steps">
          <li><span className="how__n" aria-hidden="true">1</span>Find a supply</li>
          <li><span className="how__n" aria-hidden="true">2</span>Add it to your list</li>
          <li><span className="how__n" aria-hidden="true">3</span>Send your request</li>
        </ol>
        <span className="how__more">How it works<span aria-hidden="true"> →</span></span>
      </a>

      <h2 className="section-title landing__browse">Or choose a category</h2>
      <div className="landing__grid">
        {catalog.map((cat) => (
          <section key={cat.slug} className="cat" aria-labelledby={`cat-${cat.slug}`}>
            <h2 className="cat__title" id={`cat-${cat.slug}`}>
              <a href={`#/c/${cat.slug}`} className="cat__link">
                <span className="cat__name">{cat.name}</span>
                <span className="cat__kinds">{kinds(cat.types.length)}</span>
              </a>
            </h2>
            <ul className="cat__types">
              {cat.types.slice(0, FIRST).map((t) => (
                <li key={t.slug}><a href={`#/c/${cat.slug}/${t.slug}`}>{t.label}</a></li>
              ))}
            </ul>
            {cat.types.length > FIRST && (
              <a className="cat__all" href={`#/c/${cat.slug}`}>
                See all {cat.types.length} kinds in {cat.name}<span aria-hidden="true"> →</span>
              </a>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

export default memo(Landing);
