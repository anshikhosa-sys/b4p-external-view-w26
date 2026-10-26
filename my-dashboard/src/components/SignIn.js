import { useEffect, useRef, useState } from 'react';
import {
  acceptInvite, AuthError, checkResetCode, CODE_MINUTES, DEMO, LOCK_MINUTES, lookupInvite, requestReset, resetDemoInvite, resetPassword, signIn,
} from '../auth/mockAuth';
import {
  cleanEmail, CODE_LENGTH, codeError, emailError, emailTypo, MAX_EMAIL, MAX_PASSWORD, passwordChecks, validateNewPassword, validateSignIn,
} from '../auth/validate';
import Icon from './Icons';

const timeOf = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

function PasswordField({ id, label, value, onChange, onBlur, error, autoComplete, describedBy, inputRef, children }) {
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);
  const onKey = (e) => setCaps(!!(e.getModifierState && e.getModifierState('CapsLock')));
  const ids = [describedBy, caps && `${id}-caps`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="pw">
        <input
          ref={inputRef}
          id={id}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          maxLength={MAX_PASSWORD + 1}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={onKey}
          onKeyUp={onKey}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={!!error}
          aria-describedby={ids}
        />
        <button type="button" className="pw__toggle" onClick={() => setShown((s) => !s)} aria-pressed={shown} aria-controls={id}>
          {shown ? 'Hide' : 'Show'}
        </button>
      </div>
      {caps && <p className="field__warn" id={`${id}-caps`}>Caps Lock is on.</p>}
      {children}
      {error && <p className="field__error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}

// `onFix` offers "Did you mean …@gmail.com?" for a mistyped provider, once the person has left the box.
function EmailField({ value, onChange, onBlur, error, inputRef, hint, onFix }) {
  const fix = onFix && !error ? emailTypo(value) : null;
  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label htmlFor="auth-email">Email</label>
      <input
        ref={inputRef}
        id="auth-email"
        type="email"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={MAX_EMAIL}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        aria-invalid={!!error}
        aria-describedby={[hint && 'auth-email-hint', error && 'auth-email-error'].filter(Boolean).join(' ') || undefined}
      />
      {hint && <p className="field__hint" id="auth-email-hint">{hint}</p>}
      {fix && (
        <p className="field__warn" role="status">
          Did you mean <strong>{fix}</strong>?{' '}
          <button type="button" className="linklike" onClick={() => onFix(fix)}>Use this</button>
        </p>
      )}
      {error && <p className="field__error" id="auth-email-error">{error}</p>}
    </div>
  );
}

function Alert({ children, tone = 'error' }) {
  return (
    <div className={tone === 'error' ? 'form-error' : 'form-note'} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={tone === 'error' ? 'alert' : 'mail'} size={20} />
      <div>{children}</div>
    </div>
  );
}

// Shown on every auth screen until the backend exists.
function MockNotice({ onFill }) {
  return (
    <p className="mock-note">
      <strong>Preview:</strong> not connected to the server. Demo login <code>{DEMO.email}</code> / <code>{DEMO.password}</code>
      {onFill && <> · <button type="button" className="linklike mock-note__fill" onClick={onFill}>Fill in</button></>}
      {' '}· <a href={`#/welcome/${DEMO.invite}`}>Try an invite link</a>
    </p>
  );
}

function AuthFrame({ title, lede, children, contactEmail, onFill }) {
  const titleRef = useRef(null);
  useEffect(() => titleRef.current && titleRef.current.focus(), []);
  return (
    <div className="auth">
      <a className="back" href="#/supplies"><Icon name="back" size={18} /> Back to supplies</a>
      <section className="auth__card">
        <h1 className="page-title" tabIndex={-1} ref={titleRef}>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
        {children}
      </section>
      <p className="auth__foot">
        Accounts are for Blueprints partner clinics. Need one? Email <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.<br />
        <a href="#/guide">Read the step-by-step guide</a>
      </p>
      <MockNotice onFill={onFill} />
    </div>
  );
}

const NEXT_LABEL = { review: 'to send your request', requests: 'to see your requests' };

export function SignIn({ next, onSignedIn, contactEmail, lineCount = 0 }) {
  const [values, setValues] = useState({ email: '', password: '' });
  const [touched, setTouched] = useState({});
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const emailRef = useRef(null);
  const pwRef = useRef(null);

  const errors = validateSignIn(values);
  const shown = { email: touched.email && errors.email, password: touched.password && errors.password };
  const update = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    if (error && error.code !== 'locked') setError(null);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (inFlight.current) return;
    setTouched({ email: true, password: true });
    if (errors.email) return emailRef.current.focus();
    if (errors.password) return pwRef.current.focus();
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      const account = await signIn({ email: cleanEmail(values.email), password: values.password });
      onSignedIn(account);
    } catch (err) {
      setError(err instanceof AuthError ? err : new AuthError('Couldn’t reach the server. Check your connection and try again.', { code: 'network' }));
      setValues((v) => ({ ...v, password: '' }));
      setTouched((t) => ({ ...t, password: false }));
      pwRef.current && pwRef.current.focus();
      inFlight.current = false;
      setSending(false);
    }
  };

  const locked = error && error.code === 'locked' && error.until > Date.now();

  return (
    <AuthFrame
      title={next === 'review' ? 'Sign in to send your request' : 'Sign in'}
      lede={next === 'review' && lineCount > 0
        ? `Your list of ${lineCount} ${lineCount === 1 ? 'supply is' : 'supplies is'} saved. Sign in and you’ll go straight back to it.`
        : next && NEXT_LABEL[next] ? `Sign in ${NEXT_LABEL[next]}.` : 'Blueprints for Pangaea partner clinics'}
      contactEmail={contactEmail}
      foot
      onFill={() => setValues({ email: DEMO.email, password: DEMO.password })}
    >
      <form className="auth__form" onSubmit={onSubmit} noValidate>
        {error && (
          <Alert>
            {error.code === 'mismatch' && (
              <p>
                <strong>That email and password don’t match.</strong> Check for typos, or{' '}
                <a href="#/forgot">reset your password</a>.
                {error.left <= 3 && ` ${error.left} ${error.left === 1 ? 'try' : 'tries'} left before a ${LOCK_MINUTES}-minute pause.`}
              </p>
            )}
            {error.code === 'locked' && (
              <p>
                <strong>Too many tries.</strong> To protect your account, sign-in is paused until {timeOf(error.until)}.
                You can <a href="#/forgot">reset your password</a> now instead.
              </p>
            )}
            {error.code === 'disabled' && (
              <p>
                <strong>This account has been turned off.</strong> If that seems wrong, email{' '}
                <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
              </p>
            )}
            {error.code === 'network' && <p>{error.message}</p>}
          </Alert>
        )}
        <EmailField
          inputRef={emailRef}
          value={values.email}
          onChange={update('email')}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          error={shown.email}
          onFix={touched.email ? (fix) => setValues((v) => ({ ...v, email: fix })) : null}
        />
        <PasswordField
          id="auth-password"
          label="Password"
          inputRef={pwRef}
          autoComplete="current-password"
          value={values.password}
          onChange={update('password')}
          onBlur={() => values.password && setTouched((t) => ({ ...t, password: true }))}
          error={shown.password}
        />
        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={sending || locked}>
          {sending ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="auth__alt"><a href="#/forgot">Forgot password?</a></p>
      </form>
    </AuthFrame>
  );
}

// Forgot password, in three steps on one page: email -> 6-digit code -> new password.
// A code (not a link) works when the email is read on a phone and the site is open on
// a clinic computer.
export function ForgotPassword({ contactEmail, onSignedIn }) {
  const [stage, setStage] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [values, setValues] = useState({ password: '', confirm: '' });
  const [touched, setTouched] = useState({});
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [previewCode, setPreviewCode] = useState(null);
  const emailRef = useRef(null);
  const codeRef = useRef(null);
  const pwRef = useRef(null);
  const confirmRef = useRef(null);

  const sendCode = async () => {
    setSending(true);
    setError(null);
    const res = await requestReset({ email: cleanEmail(email) });
    setPreviewCode(res.previewCode);
    setSending(false);
  };

  const onEmail = async (e) => {
    e.preventDefault();
    setTouched({ email: true });
    if (emailError(email)) return emailRef.current.focus();
    await sendCode();
    setStage('code');
  };

  const onCode = async (e) => {
    e.preventDefault();
    setTouched((t) => ({ ...t, code: true }));
    if (codeError(code)) return codeRef.current.focus();
    setSending(true);
    setError(null);
    try {
      await checkResetCode({ email, code });
      setStage('password');
    } catch (err) {
      setError(err);
      setCode('');
      codeRef.current && codeRef.current.focus();
    }
    setSending(false);
  };

  const pwErrors = validateNewPassword({ ...values, email });
  const onPassword = async (e) => {
    e.preventDefault();
    if (sending) return;
    setTouched((t) => ({ ...t, password: true, confirm: true }));
    if (pwErrors.password) return pwRef.current.focus();
    if (pwErrors.confirm) return confirmRef.current.focus();
    setSending(true);
    try {
      const account = await resetPassword({ email, code, password: values.password });
      onSignedIn(account, { reset: true });
    } catch (err) {
      // The code ran out while they chose a password: start the code step again.
      setError(err);
      setCode('');
      setStage('code');
      setSending(false);
    }
  };

  if (stage === 'email') {
    return (
      <AuthFrame title="Reset your password" lede={`We’ll email you a ${CODE_LENGTH}-digit code.`} contactEmail={contactEmail}>
        <form className="auth__form" onSubmit={onEmail} noValidate>
          <EmailField
            inputRef={emailRef}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched({ email: true })}
            error={touched.email ? emailError(email) : null}
            onFix={touched.email ? setEmail : null}
          />
          <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={sending}>
            {sending ? 'Sending…' : 'Email me a code'}
          </button>
          <p className="auth__alt"><a href="#/signin">Back to sign in</a></p>
        </form>
      </AuthFrame>
    );
  }

  if (stage === 'code') {
    const shownCode = touched.code && codeError(code);
    return (
      <AuthFrame title="Check your email" contactEmail={contactEmail}>
        <form className="auth__form" onSubmit={onCode} noValidate>
          {error ? (
            <Alert>
              {error.code === 'badcode' && <p><strong>That code isn’t right.</strong> Check the newest email from us. {error.left} {error.left === 1 ? 'try' : 'tries'} left.</p>}
              {error.code === 'expired' && <p><strong>That code has run out.</strong> Send a new one below.</p>}
            </Alert>
          ) : (
            <Alert tone="note">
              <p>If <strong>{cleanEmail(email)}</strong> has an account, we’ve emailed it a {CODE_LENGTH}-digit code. It works for {CODE_MINUTES} minutes.</p>
            </Alert>
          )}
          <div className={`field${shownCode ? ' field--error' : ''}`}>
            <label htmlFor="reset-code">Code from the email</label>
            <input
              ref={codeRef}
              id="reset-code"
              className="code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH + 2}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error && error.code === 'badcode') setError(null);
              }}
              aria-invalid={!!shownCode}
              aria-describedby={shownCode ? 'reset-code-error' : undefined}
            />
            {shownCode && <p className="field__error" id="reset-code-error">{shownCode}</p>}
          </div>
          <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={sending || (error && error.code === 'expired')}>
            {sending ? 'Checking…' : 'Continue'}
          </button>
          <p className="auth__small">
            Nothing after a few minutes? Check spam, or{' '}
            <button type="button" className="linklike" disabled={sending} onClick={() => { setCode(''); setTouched({}); sendCode(); }}>send a new code</button>.
          </p>
          <p className="auth__alt">
            <button type="button" className="linklike" onClick={() => { setStage('email'); setCode(''); setError(null); setTouched({}); }}>Use a different email</button>
          </p>
        </form>
        {previewCode && <p className="mock-note"><strong>Preview:</strong> no email is sent. The code would be <code>{previewCode}</code>.</p>}
      </AuthFrame>
    );
  }

  const checks = passwordChecks(values.password, email);
  const shown = { password: touched.password && pwErrors.password, confirm: touched.confirm && pwErrors.confirm };
  const update = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));
  return (
    <AuthFrame title="Choose a new password" lede={`For ${cleanEmail(email)}.`} contactEmail={contactEmail}>
      <form className="auth__form" onSubmit={onPassword} noValidate>
        <input type="email" name="username" autoComplete="username" value={cleanEmail(email)} readOnly hidden />
        <PasswordField
          id="new-password"
          label="New password"
          inputRef={pwRef}
          autoComplete="new-password"
          value={values.password}
          onChange={update('password')}
          onBlur={() => values.password && setTouched((t) => ({ ...t, password: true }))}
          error={shown.password}
          describedBy="pw-rules"
        >
          <PasswordRules checks={checks} />
        </PasswordField>
        <PasswordField
          id="confirm-password"
          label="Confirm password"
          inputRef={confirmRef}
          autoComplete="new-password"
          value={values.confirm}
          onChange={update('confirm')}
          onBlur={() => values.confirm && setTouched((t) => ({ ...t, confirm: true }))}
          error={shown.confirm}
        />
        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={sending}>
          {sending ? 'Saving…' : 'Save and sign in'}
        </button>
      </form>
    </AuthFrame>
  );
}

function PasswordRules({ checks }) {
  return (
    <ul className="rules" id="pw-rules" aria-label="Password rules">
      {checks.map((c) => (
        <li key={c.id} className={c.ok ? 'rules__ok' : undefined}>
          <Icon name={c.ok ? 'check' : 'minus'} size={16} />
          {c.label}
          <span className="visually-hidden">{c.ok ? ', done' : ', not yet'}</span>
        </li>
      ))}
    </ul>
  );
}

// Reached from the invite email HQ sends each clinic.
export function Welcome({ token, onSignedIn, contactEmail }) {
  const [invite, setInvite] = useState({ status: 'loading' });
  const [values, setValues] = useState({ password: '', confirm: '' });
  const [touched, setTouched] = useState({});
  const [sending, setSending] = useState(false);
  const pwRef = useRef(null);
  const confirmRef = useRef(null);

  const [retry, setRetry] = useState(0); // the demo reset asks again
  useEffect(() => {
    let live = true;
    lookupInvite(token)
      .then((data) => live && setInvite({ status: 'ok', ...data }))
      .catch((err) => live && setInvite({ status: 'bad', code: err.code }));
    return () => {
      live = false;
    };
  }, [token, retry]);

  if (invite.status === 'loading') {
    return <div className="auth"><p className="hint" role="status">Checking your invite link…</p></div>;
  }
  if (invite.status === 'bad') {
    const copy = {
      used: ['This invite was already used', 'Your account is set up. Sign in with your email and password.'],
      invalid: ['This link doesn’t work', 'It may have been copied incompletely. Open the link straight from the email, or email us for a new one.'],
    }[invite.code] || [];
    return (
      <AuthFrame title={copy[0]} lede={copy[1]} contactEmail={contactEmail}>
        <div className="auth__form">
          {invite.code === 'used'
            ? <a className="btn btn--primary btn--lg" href="#/signin">Go to sign in</a>
            : <a className="btn btn--secondary btn--lg" href={`mailto:${contactEmail}?subject=New%20invite%20link`}>Email us for a new link</a>}
        </div>
        {invite.code === 'used' && token === DEMO.invite && (
          <p className="mock-note">
            <strong>Preview:</strong> this browser already set up the demo account.{' '}
            <button
              type="button"
              className="linklike mock-note__fill"
              onClick={() => {
                resetDemoInvite();
                setInvite({ status: 'loading' });
                setRetry((n) => n + 1);
              }}
            >
              Reset this demo invite
            </button>
          </p>
        )}
      </AuthFrame>
    );
  }

  const errors = validateNewPassword({ ...values, email: invite.email });
  const checks = passwordChecks(values.password, invite.email);
  const shown = { password: touched.password && errors.password, confirm: touched.confirm && errors.confirm };
  const update = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (sending) return;
    setTouched({ password: true, confirm: true });
    if (errors.password) return pwRef.current.focus();
    if (errors.confirm) return confirmRef.current.focus();
    setSending(true);
    const account = await acceptInvite(token, { password: values.password });
    onSignedIn(account, { welcome: true });
  };

  return (
    <AuthFrame
      title={`Welcome${invite.name ? `, ${invite.name.split(' ')[0]}` : ''}`}
      lede="Choose a password to finish setting up your account."
      contactEmail={contactEmail}
    >
      <form className="auth__form" onSubmit={onSubmit} noValidate>
        <dl className="invite">
          <div><dt>Clinic</dt><dd>{invite.org}</dd></div>
          <div><dt>Email</dt><dd>{invite.email}</dd></div>
        </dl>
        <p className="invite__wrong">Not your clinic? Stop here and email <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.</p>
        {/* Lets password managers save the right username. */}
        <input type="email" name="username" autoComplete="username" value={invite.email} readOnly hidden />
        <PasswordField
          id="new-password"
          label="New password"
          inputRef={pwRef}
          autoComplete="new-password"
          value={values.password}
          onChange={update('password')}
          onBlur={() => values.password && setTouched((t) => ({ ...t, password: true }))}
          error={shown.password}
          describedBy="pw-rules"
        >
          <PasswordRules checks={checks} />
        </PasswordField>
        <PasswordField
          id="confirm-password"
          label="Confirm password"
          inputRef={confirmRef}
          autoComplete="new-password"
          value={values.confirm}
          onChange={update('confirm')}
          onBlur={() => values.confirm && setTouched((t) => ({ ...t, confirm: true }))}
          error={shown.confirm}
        />
        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={sending}>
          {sending ? 'Setting up…' : 'Finish setup'}
        </button>
      </form>
    </AuthFrame>
  );
}
