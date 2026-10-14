import { useEffect, useRef } from 'react';
import Icon from './Icons';

// "How to request supplies": a step-by-step guide for clinic staff.
// The small pictures are drawn with the app's own styles so they match what people see.

const SECTIONS = [
  ['before', 'Before you start'],
  ['account', '1. Set up your account'],
  ['signin', '2. Sign in'],
  ['find', '3. Find a supply'],
  ['amount', '4. Choose how many'],
  ['check', '5. Check your request'],
  ['send', '6. Send it'],
  ['follow', '7. Follow your request'],
  ['labels', 'What the labels mean'],
  ['help', 'Questions and problems'],
];

function Picture({ caption, children }) {
  return (
    <figure className="guide__pic">
      <div className="guide__pic-frame" aria-hidden="true" inert="">{children}</div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function Step({ id, n, title, children }) {
  return (
    <section className="guide__step" id={`guide-${id}`} aria-labelledby={`guide-${id}-title`}>
      <h2 id={`guide-${id}-title`} className="guide__step-title">
        {n && <span className="guide__n">{n}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function Guide({ contactEmail, signedIn }) {
  const titleRef = useRef(null);
  useEffect(() => titleRef.current && titleRef.current.focus(), []);
  const jump = (id) => (e) => {
    e.preventDefault();
    const el = document.getElementById(`guide-${id}`);
    if (el) {
      el.scrollIntoView({ block: 'start' });
      el.querySelector('h2').setAttribute('tabindex', '-1');
      el.querySelector('h2').focus({ preventScroll: true });
    }
  };

  return (
    <div className="guide">
      <header className="guide__intro">
        <p className="guide__kicker">For partner clinics</p>
        <h1 className="guide__title" tabIndex={-1} ref={titleRef}>How to request supplies</h1>
        <p className="guide__lede">
          Blueprints for Pangaea collects unused medical supplies and sends them to clinics that need them.
          This page walks you through asking for supplies, one step at a time. It takes about 10 minutes
          the first time and 2 or 3 minutes after that.
        </p>
        <div className="guide__short" aria-labelledby="guide-short-title">
          <p className="guide__short-title" id="guide-short-title">In short</p>
          <ol>
            <li><strong>Sign in</strong> with the email Blueprints invited.</li>
            <li><strong>Add</strong> the supplies you need to your list.</li>
            <li>Click <strong>Your list</strong> (top right), then <strong>Review and send</strong>.</li>
            <li>Click <strong>Send request</strong>. We email you as it moves along.</li>
          </ol>
          <p>The rest of this page explains each step in detail.</p>
        </div>
        <div className="guide__actions">
          <a className="btn btn--primary btn--lg" href="#/">Start a request</a>
          {!signedIn && <a className="btn btn--quiet btn--lg" href="#/signin">Sign in</a>}
        </div>
      </header>

      <div className="guide__layout">
        <nav className="guide__toc" aria-label="On this page">
          <p className="guide__toc-title">On this page</p>
          <ol>
            {SECTIONS.map(([id, label]) => (
              <li key={id}><a href={`#/how-it-works`} onClick={jump(id)}>{label}</a></li>
            ))}
          </ol>
        </nav>

        <div className="guide__body">
          <Step id="before" title="Before you start">
            <p>You will need:</p>
            <ul className="guide__list">
              <li><strong>The invite email from Blueprints.</strong> Each partner clinic gets one, with a link to set up your account.</li>
              <li><strong>The work email address the invite was sent to.</strong> This is the address you sign in with.</li>
              <li><strong>A list of what your clinic needs</strong>, and roughly how many of each. A paper list is fine.</li>
            </ul>
            <p>
              No invite? Email <a href={`mailto:${contactEmail}`}>{contactEmail}</a> with your clinic’s name and
              your work email, and we’ll send one.
            </p>
            <p className="guide__note">
              <strong>Good to know:</strong> everything is free for partner clinics. A request is a list you send
              to the Blueprints team. Nothing is ordered or shipped until a person on our team reviews it.
            </p>
          </Step>

          <Step id="account" n="1" title="Set up your account (first time only)">
            <ol className="guide__steps">
              <li>Open the invite email from Blueprints and click the link in it.</li>
              <li>A page opens showing your clinic’s name and your email. <strong>Check that both are right.</strong> If not, stop and email us.</li>
              <li>Choose a password and type it in the <strong>New password</strong> box. The list under the box turns green as your password meets each rule.</li>
              <li>Type the same password again in <strong>Confirm password</strong>.</li>
              <li>Click <strong>Finish setup</strong>. You’re now signed in.</li>
            </ol>
            <Picture caption="The setup page. Your clinic’s name and email are filled in for you.">
              <div className="mini-card">
                <p className="mini-title">Welcome, Joseph</p>
                <div className="mini-facts"><span>Clinic</span><b>Hillside Health Center</b><span>Email</span><b>nurse@hillside.org</b></div>
                <p className="mini-label">New password</p>
                <div className="mini-input">••••••••••••</div>
                <ul className="rules">
                  <li className="rules__ok"><Icon name="check" size={16} />At least 10 characters</li>
                  <li className="rules__ok"><Icon name="check" size={16} />Doesn’t contain your email</li>
                  <li className="rules__ok"><Icon name="check" size={16} />Not a common password</li>
                </ul>
                <span className="btn btn--primary btn--block">Finish setup</span>
              </div>
            </Picture>
            <p className="guide__tip">
              <strong>Picking a password:</strong> a short sentence is easy to remember and hard to guess,
              like <em>river bend clinic supplies</em>. Write it somewhere safe at your clinic.
            </p>
            <p>The invite link works for 7 days. If it has expired, the page will tell you, and you can ask us for a new one.</p>
          </Step>

          <Step id="signin" n="2" title="Sign in">
            <p>
              You can look at the supply list without signing in. You need to sign in to send a request
              and to see your past requests.
            </p>
            <ol className="guide__steps">
              <li>Click <strong>Sign in</strong> at the top right of the page.</li>
              <li>Type your work email and your password.</li>
              <li>Click the blue <strong>Sign in</strong> button.</li>
            </ol>
            <p>
              When you’re signed in, your clinic’s name shows at the top right. Click it to see{' '}
              <strong>My requests</strong> or to <strong>Sign out</strong>.
            </p>
            <p className="guide__tip">
              <strong>Using a shared computer?</strong> Sign out when you finish, so the next person can’t send
              requests in your clinic’s name.
            </p>
          </Step>

          <Step id="find" n="3" title="Find a supply">
            <p>There are two ways to find what you need:</p>
            <ul className="guide__list">
              <li>
                <strong>Search.</strong> Type a word in the search box at the top, like <em>gloves</em>,{' '}
                <em>syringe</em> or <em>gauze</em>. Results show as you type. Short, simple words work best.
              </li>
              <li>
                <strong>Browse.</strong> The home page lists every category, like <em>Wound Care</em> or{' '}
                <em>Needles &amp; Syringes</em>. Click a category, then a type of supply.
              </li>
            </ul>
            <Picture caption="The search box is at the top of every page.">
              <div className="mini-search"><Icon name="search" size={18} /> gloves</div>
            </Picture>
            <p>
              Each supply shows its name, the maker, how many are in stock and when it expires. Click a supply’s
              name to see more detail, including each box or lot we have.
            </p>
          </Step>

          <Step id="amount" n="4" title="Choose how many">
            <ol className="guide__steps">
              <li>Next to the supply, click <strong>Add</strong>. One is added to your request.</li>
              <li>Use <strong>+</strong> and <strong>−</strong> to change the amount, or click the number and type the amount you need.</li>
              <li>Keep going: add every supply your clinic needs before sending.</li>
            </ol>
            <Picture caption="Before and after clicking Add.">
              <div className="mini-row">
                <span className="btn btn--secondary btn--sm">Add</span>
                <span className="mini-arrow">→</span>
                <span className="mini-stepper"><span>−</span><b>12</b><span>+</span></span>
              </div>
            </Picture>
            <ul className="guide__list">
              <li>You can’t ask for more than we have in stock. The box stops at the most available.</li>
              <li>To remove a supply, lower it to 0 or click <strong>Remove</strong>. If you remove something by mistake, click <strong>Undo</strong> on the message at the bottom of the screen.</li>
              <li>Your request is saved on this computer, so you can close the page and come back later.</li>
            </ul>
          </Step>

          <Step id="check" n="5" title="Check your request">
            <p>
              The <strong>Your list</strong> button at the top right shows how many supplies you’ve added. Click it
              to see them.
            </p>
            <Picture caption="The number is how many different supplies are on your request.">
              <span className="header__slip mini-slip"><Icon name="slip" size={18} /> Your list <span className="header__count">3</span></span>
            </Picture>
            <p>Read through the list and change any amounts. When it looks right, click <strong>Review and send</strong>.</p>
          </Step>

          <Step id="send" n="6" title="Send it">
            <ol className="guide__steps">
              <li>On the <strong>Review your request</strong> page, check the list one last time.</li>
              <li>Check that <strong>Sending as</strong> shows your clinic and your email. Updates are sent to that email.</li>
              <li>Click <strong>Send request</strong>.</li>
            </ol>
            <p>
              You’ll see a page with your <strong>request number</strong> (it starts with <span className="num">REQ-</span>),
              and we’ll email you a copy. Keep the number in case you need to ask us about the request.
            </p>
            <p className="guide__note">
              <strong>Clicked Send and nothing happened?</strong> Wait a minute before trying again. The first
              request after a quiet spell can be slow. The page tells you if something went wrong, and your list
              is never lost.
            </p>
          </Step>

          <Step id="follow" n="7" title="Follow your request">
            <p>
              Open <strong>My requests</strong> from the menu at the top right. Each request shows where it is.
              We also email you each time it moves to the next step.
            </p>
            <dl className="guide__status">
              <div><dt>Submitted</dt><dd>We have your request. Nothing for you to do.</dd></div>
              <div><dt>Under review</dt><dd>Someone on our team is checking it against what we have.</dd></div>
              <div><dt>Approved</dt><dd>Your request is approved and is being prepared to ship.</dd></div>
              <div><dt>Shipped</dt><dd>Your supplies are on the way.</dd></div>
              <div><dt>Denied</dt><dd>We can’t fill this request right now. Email us if you have questions. You can send a new request any time.</dd></div>
            </dl>
            <p>
              Need to change a request you’ve already sent? Email <a href={`mailto:${contactEmail}`}>{contactEmail}</a>{' '}
              with your request number.
            </p>
          </Step>

          <Step id="labels" title="What the labels mean">
            <dl className="guide__labels">
              <div><dt><span className="badge badge--low">Low stock</span></dt><dd>Only a few left. Ask soon if you need it.</dd></div>
              <div><dt><span className="badge badge--soon">Expires soon</span></dt><dd>Use-by date is close. Only ask if you can use it in time.</dd></div>
              <div><dt><span className="badge badge--info">Team check</span></dt><dd>Our team checks this item by hand before it ships, so approval may take a little longer.</dd></div>
              <div><dt><span className="badge badge--hold">On hold</span></dt><dd>Set aside for another clinic. You can’t request it right now.</dd></div>
            </dl>
          </Step>

          <Step id="help" title="Questions and problems">
            <dl className="guide__faq">
              <div>
                <dt>I forgot my password.</dt>
                <dd>On the sign-in page, click <strong>Forgot password?</strong>, type your work email and click <strong>Send reset link</strong>. Check your email (and your spam folder) for a link. It works for 1 hour.</dd>
              </div>
              <div>
                <dt>It says “Too many tries”.</dt>
                <dd>After 5 wrong passwords, sign-in pauses for 15 minutes to protect your account. Wait, or reset your password now.</dd>
              </div>
              <div>
                <dt>It says “That email and password don’t match”.</dt>
                <dd>Check for typing mistakes and that Caps Lock is off. Click <strong>Show</strong> to see what you typed. Make sure you’re using the email your invite was sent to.</dd>
              </div>
              <div>
                <dt>I can’t find the supply I need.</dt>
                <dd>Try a shorter or different word (<em>bandage</em> instead of <em>elastic bandage roll</em>). If it’s not listed, we don’t have it right now. Email us; we often get new donations.</dd>
              </div>
              <div>
                <dt>Someone else at my clinic needs to send requests.</dt>
                <dd>Email us their name and work email and we’ll send them their own invite. Please don’t share passwords.</dd>
              </div>
              <div>
                <dt>Something else is wrong.</dt>
                <dd>Email <a href={`mailto:${contactEmail}`}>{contactEmail}</a>. Tell us your clinic’s name, what you were trying to do and what the page said. A screenshot helps.</dd>
              </div>
            </dl>
          </Step>

          <div className="guide__end">
            <p className="guide__end-title">Ready?</p>
            <a className="btn btn--primary btn--lg" href="#/">Start a request</a>
          </div>
        </div>
      </div>
    </div>
  );
}
