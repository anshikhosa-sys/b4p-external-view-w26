import { useEffect, useRef } from 'react';
import account from '../assets/guide/steps/account-menu.jpg';
import add from '../assets/guide/steps/add.jpg';
import categories from '../assets/guide/steps/categories.jpg';
import howMany from '../assets/guide/steps/how-many.jpg';
import listChange from '../assets/guide/steps/list-change.jpg';
import photo from '../assets/guide/steps/photo.jpg';
import reviewAndSend from '../assets/guide/steps/review-and-send.jpg';
import send from '../assets/guide/steps/send.jpg';
import signIn from '../assets/guide/steps/sign-in.jpg';
import sent from '../assets/guide/steps/sent.jpg';

// The step-by-step guide (#/guide): ten short steps, each with the exact button name and at
// most one screenshot of this site (a red box shows what to click). Retake the pictures with
// scripts/guide-shots.js after the screens change.

const B = ({ children }) => <strong className="guide__label">{children}</strong>;

const SHOT = {
  signIn: { src: signIn, width: 504, height: 694, narrow: true, alt: 'The Sign in page with the Email and Password boxes filled in, and a red box around the blue Sign in button.' },
  categories: { src: categories, width: 1280, height: 860, alt: 'The supplies page with the Categories menu open, listing each category and how many supplies it has. A red box is around the Categories button.' },
  photo: { src: photo, width: 480, height: 860, narrow: true, alt: 'The panel for one supply: a photo of the package of SensiCare exam gloves with a red box around it, 79 in stock, and the + Add to list button.' },
  add: { src: add, width: 480, height: 860, narrow: true, alt: 'The same panel with a red box around the blue + Add to list button.' },
  howMany: { src: howMany, width: 480, height: 860, narrow: true, alt: 'After adding: the button has changed to a minus sign, the number 1 and a plus sign, with a red box around them.' },
  listChange: { src: listChange, width: 480, height: 860, narrow: true, alt: 'Your list open on the right side: the supply, its amount with minus and plus (with a red box around them), and Remove.' },
  reviewAndSend: { src: reviewAndSend, width: 480, height: 860, narrow: true, alt: 'Your list with a red box around the blue Review and send button at the bottom.' },
  send: { src: send, width: 1280, height: 860, alt: 'The Review your request page: the supplies requested, Sending as with the clinic name and email, and a red box around the blue Send request button.' },
  sent: { src: sent, width: 1280, height: 860, alt: 'The Request submitted page with the request number, which starts with REQ-.' },
  account: { src: account, width: 1280, height: 860, alt: 'The Account menu open at the top right: Signed in as Ana Morales, then My requests with a red box around it, then Sign out.' },
};

const STEPS = [
  {
    title: 'Sign in',
    text: <>Click <B>Account</B> at the top right, type your work email and password, then click <B>Sign in</B>. First time? Use the link in the invite email from Blueprints to choose a password. Forgot it? Click <B>Forgot password?</B> and type the 6-digit code we email you.</>,
    shot: SHOT.signIn,
  },
  {
    title: 'Find a supply',
    text: <>Click <B>Request supplies</B> at the top, then click <B>Categories</B> and pick one, like <b>Gloves</b>. Or type what you need in the grey search box at the top.</>,
    shot: SHOT.categories,
  },
  {
    title: 'Open it',
    text: <>Click the blue name of a supply to see its photo, how many we have and its use-by date.</>,
    shot: SHOT.photo,
  },
  {
    title: 'Add it',
    text: <>Click <B>+ Add to list</B>.</>,
    shot: SHOT.add,
  },
  {
    title: 'Choose how many',
    text: <>Click <b>+</b> for more or <b>−</b> for fewer. Do the same for everything else you need.</>,
    shot: SHOT.howMany,
  },
  {
    title: 'Open your list',
    text: <>Click <B>Your list</B> at the top right to check it. You can change amounts or click <B>Remove</B>.</>,
    shot: SHOT.listChange,
  },
  {
    title: 'Review it',
    text: <>Click <B>Review and send</B>.</>,
    shot: SHOT.reviewAndSend,
  },
  {
    title: 'Send it',
    text: <>Check your clinic and the amounts, then click <B>Send request</B> once.</>,
    shot: SHOT.send,
  },
  {
    title: 'Watch your email',
    text: <>You see your request number (it starts with <b>REQ-</b>). We email you when it’s approved and again when it ships.</>,
    shot: SHOT.sent,
  },
  {
    title: 'See past requests',
    text: <>Click <B>Account</B>, then <B>My requests</B>, to see where each request is.</>,
    shot: SHOT.account,
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

export default function Guide({ contactEmail }) {
  const titleRef = useRef(null);
  useEffect(() => titleRef.current && titleRef.current.focus(), []);

  return (
    <div className="guide tutorial">
      <header className="tutorial__intro">
        <h1 className="guide__title" tabIndex={-1} ref={titleRef}>How to request supplies</h1>
        <p className="guide__lede">
          Ten steps, from signing in to your box arriving. The pictures show the real screens, with a red
          box around what to click. Scroll down to see each step.
        </p>
      </header>

      <ol className="tutorial__steps">
        {STEPS.map((step, i) => (
          <li key={step.title} className="tutorial__step">
            <span className="tutorial__n" aria-hidden="true">{i + 1}</span>
            <div className="tutorial__body">
              <h2 className="tutorial__title"><span className="visually-hidden">Step {i + 1}: </span>{step.title}</h2>
              <p className="tutorial__text">{step.text}</p>
              <Shot {...step.shot} />
            </div>
          </li>
        ))}
      </ol>

      <p className="tutorial__help">
        <strong>Need help?</strong> Email <a href={`mailto:${contactEmail}`}>{contactEmail}</a> with your
        clinic’s name and what you were trying to do.
      </p>

      <div className="guide__end">
        <p className="guide__end-title">Ready?</p>
        <a className="btn btn--primary btn--lg" href="#/supplies">Request supplies</a>
      </div>
    </div>
  );
}
