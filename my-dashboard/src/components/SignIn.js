import { useEffect, useRef, useState } from 'react';
import { ApiError, clinicSignIn, clinicVerify } from '../api';
import { cleanEmail, CODE_LENGTH, codeError, emailError, emailTypo, MAX_EMAIL } from '../auth/validate';
import Icon from './Icons';

// Clinic sign-in, no passwords: 1) your email, 2) the 6-digit code we email you, 3) the first time
// only, your clinic's name. A code (not a link) works when the email is read on a phone and the
// site is open on a clinic computer.

const NEXT_LABEL = { review: 'to send your request', requests: 'to see your requests' };
const message = (err) => (err instanceof ApiError ? err.message : 'Something went wrong. Try again.');

function Field({ id, label, error, hint, children }) {
  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint}
      {error && <p className="field__error" id={`${id}-error`} role="alert">{error}</p>}
    </div>
  );
}

export function SignIn({ next, onSignedIn, contactEmail, lineCount = 0, knownOrg }) {
  const [stage, setStage] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [org, setOrg] = useState('');
  const [sent, setSent] = useState(null); // {ticket, preview}
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => titleRef.current && titleRef.current.focus(), []);
  useEffect(() => { if (stage !== 'email' && inputRef.current) inputRef.current.focus(); }, [stage]);

  const fix = stage === 'email' && !error ? emailTypo(email) : null;

  const sendCode = async (e) => {
    if (e) e.preventDefault();
    const problem = emailError(email);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const res = await clinicSignIn(cleanEmail(email));
      setSent({ ticket: res.ticket, preview: res.preview_code || null });
      setCode('');
      setStage('code');
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const checkCode = async (e) => {
    e.preventDefault();
    const problem = codeError(code);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const res = await clinicVerify(cleanEmail(email), code.replace(/\s/g, ''), sent.ticket);
      const saved = knownOrg ? knownOrg(res.email) : '';
      if (saved) return onSignedIn({ email: res.email, token: res.token, org: saved });
      setSession(res);
      setStage('org');
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const saveOrg = (e) => {
    e.preventDefault();
    const name = org.trim();
    if (!name) return setError('Enter your clinic’s name.');
    onSignedIn({ email: session.email, token: session.token, org: name.slice(0, 200) }, { welcome: true });
  };

  const title = next === 'review' ? 'Sign in to send your request' : 'Sign in';
  const lede = next === 'review' && lineCount > 0
    ? `Your list of ${lineCount} ${lineCount === 1 ? 'supply is' : 'supplies is'} saved. Sign in and you’ll go straight back to it.`
    : next && NEXT_LABEL[next] ? `Sign in ${NEXT_LABEL[next]}.` : 'No password needed. We’ll email you a code.';

  return (
    <div className="auth">
      <a className="back" href="#/supplies"><Icon name="back" size={18} /> Back to supplies</a>
      <section className="auth__card">
        <h1 className="page-title" tabIndex={-1} ref={titleRef}>{stage === 'org' ? 'One last thing' : title}</h1>

        {stage === 'email' && (
          <form className="auth__form" onSubmit={sendCode} noValidate>
            <p className="lede">{lede}</p>
            <Field id="auth-email" label="Your work email" error={error}
              hint={fix && (
                <p className="field__warn" role="status">
                  Did you mean <strong>{fix}</strong>?{' '}
                  <button type="button" className="linklike" onClick={() => setEmail(fix)}>Use this</button>
                </p>
              )}>
              <input id="auth-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="off"
                spellCheck={false} maxLength={MAX_EMAIL} value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                aria-invalid={!!error} aria-describedby={error ? 'auth-email-error' : undefined} />
            </Field>
            <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a code'}
            </button>
          </form>
        )}

        {stage === 'code' && (
          <form className="auth__form" onSubmit={checkCode} noValidate>
            <p className="lede">We emailed a {CODE_LENGTH}-digit code to <strong>{cleanEmail(email)}</strong>. It works for 10 minutes.</p>
            {sent.preview && (
              <p className="mock-note" role="status">
                <strong>Preview:</strong> no email is sent on this test site. Your code is <code className="num">{sent.preview}</code>
              </p>
            )}
            <Field id="auth-code" label="Code from the email" error={error}>
              <input id="auth-code" ref={inputRef} inputMode="numeric" autoComplete="one-time-code" maxLength={7}
                value={code} onChange={(e) => { setCode(e.target.value.replace(/[^\d ]/g, '')); setError(null); }}
                aria-invalid={!!error} aria-describedby={error ? 'auth-code-error' : undefined} />
            </Field>
            <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={busy}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <p className="auth__alt">
              No email? Check spam, or{' '}
              <button type="button" className="linklike" onClick={() => sendCode()} disabled={busy}>send a new code</button>.{' '}
              <button type="button" className="linklike" onClick={() => { setStage('email'); setError(null); }}>Use a different email</button>
            </p>
          </form>
        )}

        {stage === 'org' && (
          <form className="auth__form" onSubmit={saveOrg} noValidate>
            <p className="lede">What’s the name of your clinic? We put it on your requests.</p>
            <Field id="auth-org" label="Clinic name" error={error}>
              <input id="auth-org" ref={inputRef} autoComplete="organization" maxLength={200} value={org}
                onChange={(e) => { setOrg(e.target.value); setError(null); }}
                aria-invalid={!!error} aria-describedby={error ? 'auth-org-error' : undefined} />
            </Field>
            <button type="submit" className="btn btn--primary btn--block btn--lg">Continue</button>
          </form>
        )}
      </section>
      <p className="auth__foot">
        Questions? Email <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.<br />
        Blueprints member? <a href="#/team/signin">Blueprints team sign in</a>
      </p>
    </div>
  );
}
