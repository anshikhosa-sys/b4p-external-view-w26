import { useEffect, useRef, useState } from 'react';

// The home page: one screen. What this is, three steps, the demo video, and where to start.
// The video (public/demo.webm, poster public/demo.jpg) downloads only when someone presses play.

const VIDEO = `${process.env.PUBLIC_URL}/demo.webm`;
const POSTER = `${process.env.PUBLIC_URL}/demo.jpg`;

const STEPS = [
  <>Find what you need with the search and filters.</>,
  <>Click <strong>+ Add to list</strong>, then open <strong>Your list</strong> and send it.</>,
  <>We review, pack and ship it, and email you at each step.</>,
];

export default function Home({ clinic }) {
  const titleRef = useRef(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => titleRef.current && titleRef.current.focus(), []);

  return (
    <div className="home">
      <div className="home__text">
        <h1 className="home__title" tabIndex={-1} ref={titleRef}>Welcome, {clinic || 'clinic'}</h1>
        <p className="home__lede">Donated medical supplies, free for partner clinics.</p>
        <ol className="home__steps">
          {STEPS.map((text, i) => <li key={i}>{text}</li>)}
        </ol>
        <div className="home__actions">
          <a className="btn btn--primary btn--lg" href="#/supplies">Request supplies</a>
          {!clinic && <a className="btn btn--secondary btn--lg" href="#/signin">Sign in</a>}
        </div>
      </div>
      {!broken && (
        <figure className="home__video">
          {/* The captions are part of the picture; the same steps are written out beside it. */}
          <video controls preload="none" poster={POSTER} playsInline width="1280" height="800">
            <source src={VIDEO} type="video/webm" onError={() => setBroken(true)} />
          </video>
          <figcaption>Watch how to request supplies (1 minute)</figcaption>
        </figure>
      )}
    </div>
  );
}
