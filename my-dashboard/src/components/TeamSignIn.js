import { useEffect, useRef, useState } from 'react';
import { ApiError, teamSignIn, teamVerify } from '../api';
import { cleanEmail, emailError } from '../auth/validate';
import Icon from './Icons';

// "Blueprints team sign in" (preview): a roster email, then a 6-digit code. In this preview the
// code is shown on the page; the real version emails it. Later this can become Google sign-in
// limited to roster emails (see app/team.py); the dashboard would not change.
export default function TeamSignIn({ onSignedIn }) {
  const [stage, setStage] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const titleRef = useRef(null);
  const codeRef = useRef(null);
  useEffect(() => titleRef.current && titleRef.current.focus(), []);
  useEffect(() => { if (stage === 'code' && codeRef.current) codeRef.current.focus(); }, [stage]);

  const sendCode = async (e) => {
    e.preventDefault();
    const problem = emailError(email);
    if (problem) return setError(problem);
    setSending(true);
    setError(null);
    try {
      const res = await teamSignIn(cleanEmail(email));
      setPreview(res.preview_code || null);
      setCode('');
      setStage('code');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSending(false);
    }
  };

  const checkCode = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setError('Type the 6 numbers from the code.');
    setSending(true);
    setError(null);
    try {
      const m = await teamVerify(cleanEmail(email), code.trim());
      onSignedIn({ token: m.token, name: m.name, email: m.email, position: m.position });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
      setSending(false);
    }
  };

  return (
    <div className="auth">
      <a className="back" href="#/"><Icon name="back" size={18} /> Back to the home page</a>
      <section className="auth__card">
        <h1 className="page-title" tabIndex={-1} ref={titleRef}>Blueprints team sign in</h1>
        {stage === 'email' ? (
          <form onSubmit={sendCode} noValidate>
            <p className="lede">For Blueprints for Pangaea members. Use the email on the member list.</p>
            <div className={`field${error ? ' field--error' : ''}`}>
              <label htmlFor="team-email">Your email</label>
              <input id="team-email" type="email" autoComplete="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                aria-invalid={!!error} aria-describedby={error ? 'team-error' : undefined} />
              {error && <p className="field__error" id="team-error" role="alert">{error}</p>}
            </div>
            <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={sending}>
              {sending ? 'Sending…' : 'Email me a code'}
            </button>
          </form>
        ) : (
          <form onSubmit={checkCode} noValidate>
            <p className="lede">We sent a 6-digit code to <strong>{cleanEmail(email)}</strong>. It works for 10 minutes.</p>
            {preview && (
              <p className="mock-note" role="status">
                <strong>Preview:</strong> no email is sent yet. Your code is <code className="num">{preview}</code>
              </p>
            )}
            <div className={`field${error ? ' field--error' : ''}`}>
              <label htmlFor="team-code">Code from the email</label>
              <input id="team-code" ref={codeRef} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError(null); }}
                aria-invalid={!!error} aria-describedby={error ? 'team-error' : undefined} />
              {error && <p className="field__error" id="team-error" role="alert">{error}</p>}
            </div>
            <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={sending}>
              {sending ? 'Checking…' : 'Sign in'}
            </button>
            <p className="auth__alt">
              <button type="button" className="linklike" onClick={() => { setStage('email'); setError(null); }}>Use a different email</button>
            </p>
          </form>
        )}
      </section>
      <p className="auth__foot">Clinic staff: <a href="#/signin">sign in here instead</a>.</p>
    </div>
  );
}
