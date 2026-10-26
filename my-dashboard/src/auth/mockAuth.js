// MOCKUP ONLY. Stands in for the /auth/* endpoints in docs/AUTH_PLAN.md so the
// screens can be reviewed before the backend exists. Nothing here is secure:
// accounts live in this file and in this browser's localStorage.
import { readJSON, writeJSON } from '../storage';
import { cleanEmail } from './validate';

export const DEMO = {
  email: 'clinic@riverside.org',
  password: 'riverside-demo-2026',
  invite: 'demo-invite',
};

const SEED = {
  'clinic@riverside.org': { org: 'Riverside Community Clinic', name: 'Ana Morales', password: DEMO.password },
  'closed@example.org': { org: 'Example Clinic', name: 'Closed Account', password: 'closed-account-1', disabled: true },
};

// An invite link has no time limit: it works until someone finishes setting up that account.
const INVITES = {
  'demo-invite': { email: 'nurse@hillside.org', org: 'Hillside Health Center', name: 'Joseph Okafor' },
};

const ACCOUNTS_KEY = 'b4p.mock.accounts.v1';
const ATTEMPTS_KEY = 'b4p.mock.attempts.v1';
export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms));
const accounts = () => ({ ...SEED, ...readJSON(ACCOUNTS_KEY, {}) });

export class AuthError extends Error {
  constructor(message, { code, until, left, email } = {}) {
    super(message);
    this.code = code;
    this.until = until;
    this.left = left;
    this.email = email;
  }
}

function publicAccount(email, a) {
  return { email, org: a.org, name: a.name, role: 'clinic' };
}

export async function signIn({ email, password }) {
  await wait();
  const key = cleanEmail(email);
  const attempts = readJSON(ATTEMPTS_KEY, {});
  const entry = attempts[key] || { count: 0, until: 0 };
  if (entry.until > Date.now()) {
    throw new AuthError('locked', { code: 'locked', until: entry.until });
  }
  const account = accounts()[key];
  if (!account || account.password !== password) {
    const count = entry.until && entry.until <= Date.now() ? 1 : entry.count + 1;
    const until = count >= MAX_ATTEMPTS ? Date.now() + LOCK_MINUTES * 60000 : 0;
    writeJSON(ATTEMPTS_KEY, { ...attempts, [key]: { count: until ? 0 : count, until } });
    if (until) throw new AuthError('locked', { code: 'locked', until });
    // Same error whether the email exists or not. (The screens write their own messages.)
    throw new AuthError('mismatch', { code: 'mismatch', left: MAX_ATTEMPTS - count });
  }
  if (account.disabled) {
    throw new AuthError('disabled', { code: 'disabled' });
  }
  writeJSON(ATTEMPTS_KEY, { ...attempts, [key]: undefined });
  return publicAccount(key, account);
}

// Invites made on the team dashboard (preview: kept in this browser, so the clinic's setup page
// works on the same computer). The real version stores them on the server and emails the link.
const STORED_INVITES_KEY = 'b4p.mock.invites.v1';
const storedInvites = () => readJSON(STORED_INVITES_KEY, {}) || {};
const findInvite = (token) => (Object.prototype.hasOwnProperty.call(INVITES, token) ? INVITES[token] : storedInvites()[token]);

// 128 random bits as URL-safe text (22 characters).
function newToken() {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createInvite({ org, name, email }) {
  const clean = cleanEmail(email);
  const token = newToken();
  writeJSON(STORED_INVITES_KEY, {
    ...storedInvites(),
    [token]: { org: org.trim(), name: name.trim(), email: clean, created: Date.now() },
  });
  return token;
}

// Newest first, each with its status: Waiting until the clinic sets up its account.
export function listInvites() {
  const done = accounts();
  return Object.entries(storedInvites())
    .map(([token, inv]) => ({ token, ...inv, status: done[inv.email] ? 'Account set up' : 'Waiting' }))
    .sort((a, b) => b.created - a.created);
}

export function cancelInvite(token) {
  const all = storedInvites();
  delete all[token];
  writeJSON(STORED_INVITES_KEY, all);
}

export async function lookupInvite(token) {
  await wait(300);
  const invite = findInvite(token);
  if (!invite) throw new AuthError('invalid', { code: 'invalid' });
  if (accounts()[invite.email]) throw new AuthError('used', { code: 'used', email: invite.email });
  return { email: invite.email, org: invite.org, name: invite.name };
}

export async function acceptInvite(token, { password }) {
  const invite = await lookupInvite(token);
  await wait();
  const saved = readJSON(ACCOUNTS_KEY, {});
  writeJSON(ACCOUNTS_KEY, { ...saved, [invite.email]: { org: invite.org, name: invite.name, password } });
  return publicAccount(invite.email, invite);
}

// Preview only: forget the account made from the demo invite, so its setup page can be shown again.
export function resetDemoInvite() {
  const saved = readJSON(ACCOUNTS_KEY, {});
  delete saved[INVITES[DEMO.invite].email];
  writeJSON(ACCOUNTS_KEY, saved);
}

const RESETS_KEY = 'b4p.mock.resets.v1';
export const CODE_MINUTES = 15;
export const MAX_CODE_TRIES = 5;

// Always "sent", so the page doesn't reveal which emails have accounts. The real
// server emails a 6-digit code and stores only its hash; this preview hands the
// code back so the demo can be finished without an inbox.
export async function requestReset({ email }) {
  await wait();
  const key = cleanEmail(email);
  if (!accounts()[key]) return { ok: true, previewCode: null };
  const code = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
  writeJSON(RESETS_KEY, { ...readJSON(RESETS_KEY, {}), [key]: { code, until: Date.now() + CODE_MINUTES * 60000, tries: 0 } });
  return { ok: true, previewCode: code };
}

// One message for a wrong code and an unknown email, as above.
export async function checkResetCode({ email, code }) {
  await wait(400);
  const key = cleanEmail(email);
  const resets = readJSON(RESETS_KEY, {});
  const entry = resets[key];
  if (!entry || entry.until <= Date.now() || entry.tries >= MAX_CODE_TRIES) {
    throw new AuthError('expired', { code: 'expired' });
  }
  if (entry.code !== String(code).replace(/\s/g, '')) {
    const tries = entry.tries + 1;
    writeJSON(RESETS_KEY, { ...resets, [key]: { ...entry, tries } });
    throw new AuthError('badcode', { code: tries >= MAX_CODE_TRIES ? 'expired' : 'badcode', left: MAX_CODE_TRIES - tries });
  }
  return { ok: true };
}

// Uses up the code, sets the new password and signs in.
export async function resetPassword({ email, code, password }) {
  await checkResetCode({ email, code });
  const key = cleanEmail(email);
  const resets = readJSON(RESETS_KEY, {});
  delete resets[key];
  writeJSON(RESETS_KEY, resets);
  const account = accounts()[key];
  writeJSON(ACCOUNTS_KEY, { ...readJSON(ACCOUNTS_KEY, {}), [key]: { ...account, password } });
  writeJSON(ATTEMPTS_KEY, { ...readJSON(ATTEMPTS_KEY, {}), [key]: undefined });
  return publicAccount(key, account);
}
