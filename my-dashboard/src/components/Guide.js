import { useEffect, useRef } from 'react';
import accountMenu from '../assets/guide/account-menu.webp';
import addToList from '../assets/guide/add-to-list.webp';
import categories from '../assets/guide/categories.webp';
import review from '../assets/guide/review.webp';
import setup from '../assets/guide/setup.webp';
import signInForm from '../assets/guide/sign-in-form.webp';

// "How to request supplies": the home page for people who aren't signed in. Four short
// steps, each with one real screenshot (a red box shows what to click). Rarer questions
// sit folded at the bottom so the page stays short.

const STEPS = [
  {
    id: 'signin',
    title: 'Sign in',
    text: 'Use the work email Blueprints invited. First time? Open the invite email, click its link and choose a password.',
    shot: {
      src: signInForm, width: 464, height: 486, narrow: true,
      alt: 'The sign-in page with the Email and Password boxes filled in, and a red box around the blue Sign in button.',
    },
  },
  {
    id: 'find',
    title: 'Add what you need',
    text: 'Search or pick a category, click Add to list next to a supply, then use − and + to choose how many.',
    shot: {
      src: categories, width: 920, height: 600,
      alt: 'The supplies page: the list of categories on the left, the search box at the top, and the category boxes below. A red box is around the Airway & Oxygen category.',
    },
    extra: {
      src: addToList, width: 987, height: 89,
      alt: 'One supply row: Elastic bandage, the maker, the batch, Use by Jul 2028, 98 in stock, and an Add to list button with a red box around it.',
    },
  },
  {
    id: 'send',
    title: 'Review and send',
    text: 'Click Your list at the top, then Review and send. Check the supplies and Sending as, then click Send request.',
    shot: {
      src: review, width: 792, height: 713,
      alt: 'The Review your request page: the supplies requested, the Sending as box with the clinic and email, and a red box around the blue Send request button.',
    },
  },
  {
    id: 'follow',
    title: 'Follow your request',
    text: 'We email you each time it moves along. To see all your requests, click your clinic’s name at the top, then My requests.',
    shot: {
      src: accountMenu, width: 333, height: 271, narrow: true,
      alt: 'The menu that opens under the clinic name: Signed in as Ana Morales, then My requests with a red box around it, then Sign out.',
    },
  },
];

// A screenshot. `alt` says what the picture shows, for people who can't see it.
function Shot({ src, alt, width, height, narrow }) {
  return (
    <figure className={`guide__shot${narrow ? ' guide__shot--narrow' : ''}`}>
      <img src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async" />
    </figure>
  );
}

function Question({ q, children }) {
  return (
    <details className="guide__q">
      <summary>{q}</summary>
      <div className="guide__a">{children}</div>
    </details>
  );
}

export default function Guide({ contactEmail, signedIn }) {
  const titleRef = useRef(null);
  useEffect(() => titleRef.current && titleRef.current.focus(), []);
  const mail = <a href={`mailto:${contactEmail}`}>{contactEmail}</a>;

  return (
    <div className="guide">
      <header className="guide__intro">
        <p className="guide__kicker">For partner clinics</p>
        <h1 className="guide__title" tabIndex={-1} ref={titleRef}>How to request supplies</h1>
        <p className="guide__lede">
          Blueprints for Pangaea sends donated medical supplies to partner clinics, free.
          Asking for them takes four steps.
        </p>
        <div className="guide__actions">
          <a className="btn btn--primary btn--lg" href="#/supplies">Browse supplies</a>
          {!signedIn && <a className="btn btn--quiet btn--lg" href="#/signin">Sign in</a>}
        </div>
      </header>

      <ol className="guide__cards">
        {STEPS.map((step, i) => (
          <li key={step.id} className="guide__card" id={`guide-${step.id}`}>
            <h2 className="guide__step-title">
              <span className="guide__n" aria-hidden="true">{i + 1}</span>
              <span className="visually-hidden">Step {i + 1}: </span>
              {step.title}
            </h2>
            <p>{step.text}</p>
            <Shot {...step.shot} />
            {step.extra && <Shot {...step.extra} />}
          </li>
        ))}
      </ol>

      <section className="guide__questions" aria-labelledby="guide-questions-title">
        <h2 className="guide__questions-title" id="guide-questions-title">Questions</h2>
        <Question q="I’m setting up my account for the first time.">
          <p>
            Open the invite email from Blueprints and click its link. Check your clinic’s name and email are right,
            choose a password (a short sentence like <em>river bend clinic supplies</em> works well), type it twice
            and click <strong>Finish setup</strong>. The link works until you’ve set up your account.
          </p>
          <Shot
            src={setup} width={464} height={751} narrow
            alt="The setup page: the clinic name and email are filled in, both password boxes are filled, all three rules are ticked green, and the Finish setup button at the bottom has a red box around it."
          />
          <p>No invite? Email {mail} with your clinic’s name and your work email.</p>
        </Question>
        <Question q="What do the labels next to supplies mean?">
          <dl className="guide__labels">
            <div><dt><span className="badge badge--low">Low stock</span></dt><dd>Only a few left. Ask soon if you need it.</dd></div>
            <div><dt><span className="badge badge--soon">Expires soon</span></dt><dd>The use-by date is close. Only ask if you can use it in time.</dd></div>
            <div><dt><span className="badge badge--info">Team check</span></dt><dd>Our team checks this item by hand before it ships, so approval may take a little longer.</dd></div>
            <div><dt><span className="badge badge--hold">On hold</span></dt><dd>Set aside for another clinic. You can’t request it right now.</dd></div>
          </dl>
        </Question>
        <Question q="What happens after I send a request?">
          <dl className="guide__status">
            <div><dt>Submitted</dt><dd>We have your request. Nothing for you to do.</dd></div>
            <div><dt>Under review</dt><dd>Someone on our team is checking it against what we have.</dd></div>
            <div><dt>Approved</dt><dd>It’s approved and being prepared to ship.</dd></div>
            <div><dt>Shipped</dt><dd>Your supplies are on the way.</dd></div>
            <div><dt>Denied</dt><dd>We can’t fill it right now. You can send a new request any time.</dd></div>
          </dl>
          <p>To change a request you’ve sent, email {mail} with its request number (it starts with <span className="num">REQ-</span>).</p>
        </Question>
        <Question q="I forgot my password, or it says “Too many tries”.">
          <p>
            On the sign-in page, click <strong>Forgot password?</strong> and type your work email. We email you a
            6-digit code; type it in and choose a new password. After 5 wrong passwords, sign-in pauses for
            15 minutes to protect your account.
          </p>
        </Question>
        <Question q="I can’t find the supply I need.">
          <p>
            Try a shorter word (<em>bandage</em> instead of <em>elastic bandage roll</em>). If it’s not listed, we
            don’t have it right now. Email us; new donations arrive often.
          </p>
        </Question>
        <Question q="Someone else at my clinic needs to send requests.">
          <p>Email us their name and work email and we’ll send them their own invite. Please don’t share passwords.</p>
        </Question>
        <Question q="Something else is wrong.">
          <p>Email {mail} with your clinic’s name, what you were trying to do and what the page said. A screenshot helps.</p>
        </Question>
      </section>

      <div className="guide__end">
        <p className="guide__end-title">Ready?</p>
        <a className="btn btn--primary btn--lg" href="#/supplies">Browse supplies</a>
      </div>
    </div>
  );
}
