// Checks run in the browser before anything is sent. The server repeats them;
// these exist so clinic staff see a clear message right away.
import { EMAIL_RE } from '../components/CheckoutForm';

export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 128; // matches app/auth.py
export const MAX_EMAIL = 254;

// Passwords people pick first. The server has the real list.
const COMMON = new Set([
  'password123', 'password1234', '1234567890', 'qwertyuiop', 'welcome123', 'blueprints', 'blueprints1', 'clinic1234',
]);

// What people paste often has spaces or capitals around it.
export function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function emailError(value) {
  const email = cleanEmail(value);
  if (!email) return 'Enter the email address Blueprints sent your invite to.';
  if (email.length > MAX_EMAIL || !EMAIL_RE.test(email)) return 'That doesn’t look like an email address. Check it looks like name@clinic.org.';
  return null;
}

// Mail providers clinic staff mistype most. A domain one or two letters off one of
// these is almost always a typo, so we offer the fix (we never change it ourselves).
const COMMON_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'live.com', 'msn.com', 'proton.me'];
// Real providers that sit close to those; never "corrected".
const REAL_DOMAINS = ['mail.com', 'ymail.com', 'gmx.com', 'me.com', 'mac.com', 'live.ca', 'aim.com'];
const TLD_FIXES = { con: 'com', cmo: 'com', ocm: 'com', comm: 'com', vom: 'com', xom: 'com', ogr: 'org', rog: 'org', orgg: 'org', nte: 'net', ent: 'net' };

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

// "ana@gmial.com" -> "ana@gmail.com"; null when the address looks fine.
export function emailTypo(value) {
  const email = cleanEmail(value);
  if (emailError(email)) return null;
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at);
  let domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const tld = domain.slice(dot + 1);
  if (TLD_FIXES[tld]) domain = `${domain.slice(0, dot)}.${TLD_FIXES[tld]}`;
  if (!COMMON_DOMAINS.includes(domain) && !REAL_DOMAINS.includes(domain)) {
    const close = COMMON_DOMAINS.find((d) => editDistance(domain, d) <= (d.length > 8 ? 2 : 1));
    if (close) domain = close;
  }
  const fixed = `${local}@${domain}`;
  return fixed === email ? null : fixed;
}

export const CODE_LENGTH = 6;

export function codeError(value) {
  const code = String(value || '').replace(/\s/g, '');
  if (!code) return `Enter the ${CODE_LENGTH}-digit code from the email.`;
  if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) return `The code is ${CODE_LENGTH} numbers, like 042 913.`;
  return null;
}

export function validateSignIn({ email, password }) {
  const errors = {};
  const e = emailError(email);
  if (e) errors.email = e;
  if (!password) errors.password = 'Enter your password.';
  else if (password.length > MAX_PASSWORD) errors.password = `Passwords are at most ${MAX_PASSWORD} characters.`;
  return errors;
}

// Each rule is shown as a checklist while the person types.
export function passwordChecks(password, email) {
  const p = password || '';
  const lower = p.toLowerCase();
  const local = cleanEmail(email).split('@')[0];
  return [
    { id: 'length', label: `At least ${MIN_PASSWORD} characters`, ok: p.length >= MIN_PASSWORD && p.length <= MAX_PASSWORD },
    { id: 'email', label: 'Doesn’t contain your email', ok: p.length > 0 && !(local.length >= 3 && lower.includes(local)) },
    { id: 'common', label: 'Not a common password', ok: p.length > 0 && !COMMON.has(lower) && !/^(.)\1+$/.test(p) },
  ];
}

export function validateNewPassword({ password, confirm, email }) {
  const errors = {};
  const failed = passwordChecks(password, email).find((c) => !c.ok);
  if (!password) errors.password = 'Choose a password.';
  else if (password.length > MAX_PASSWORD) errors.password = `Use at most ${MAX_PASSWORD} characters.`;
  else if (failed) errors.password = `Your password needs to meet every rule: ${failed.label.toLowerCase()}.`;
  if (!confirm) errors.confirm = 'Type the password again.';
  else if (confirm !== password) errors.confirm = 'The two passwords don’t match.';
  return errors;
}
