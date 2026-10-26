import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, getAllRequests, setRequestStatus } from '../api';
import { cancelInvite, createInvite, listInvites } from '../auth/mockAuth';
import { cleanEmail, emailError } from '../auth/validate';
import { formatDateTime, groupRequests } from '../inventory';
import Icon from './Icons';
import { EmptyState, ErrorState } from './States';

// The Blueprints team dashboard (#/team): which clinics asked for what, with status changes, and
// links that let a clinic set up its account. Status rules and the per-clinic grouping come from
// the HQ review page in team PR #9; every change is still checked by the server.

// Mirrors _check_transition in main.py: forward only; Deny/Cancel only before shipping.
export const ACTIONS = {
  'Under Review': [
    { status: 'Approved', label: 'Approve', kind: 'primary' },
    { status: 'Denied', label: 'Deny', kind: 'secondary', confirm: true },
  ],
  Approved: [
    { status: 'Shipped', label: 'Mark shipped', kind: 'primary' },
    { status: 'Cancelled', label: 'Cancel', kind: 'secondary', confirm: true },
  ],
  Shipped: [{ status: 'Delivered', label: 'Mark delivered', kind: 'secondary' }],
};

export const STATUSES = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'review', label: 'Under review', match: (s) => s === 'Under Review' },
  { id: 'approved', label: 'Approved', match: (s) => s === 'Approved' },
  { id: 'shipped', label: 'Shipped', match: (s) => s === 'Shipped' || s === 'Delivered' },
  { id: 'denied', label: 'Denied or cancelled', match: (s) => s === 'Denied' || s === 'Cancelled' },
];

const STATUS_LABEL = { 'Under Review': 'Under review' };

// groupRequests() is built for one clinic, so it drops who sent each request; add it back.
export function withOrgs(rows) {
  const orgs = new Map();
  for (const r of rows || []) {
    const id = String(r['Request ID'] || '').trim();
    if (id && !orgs.has(id)) orgs.set(id, { name: String(r['Org Name'] || '').trim(), email: String(r['Org Email'] || '').trim() });
  }
  return groupRequests(rows)
    .map((g) => ({ ...g, org: orgs.get(g.id) || { name: '', email: '' }, units: g.lines.reduce((n, l) => n + (l.quantity || 0), 0) }))
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
}

// One row per clinic: how many requests, how many units in all, and when it last asked.
export function clinicSummary(groups) {
  const by = new Map();
  for (const g of groups) {
    const key = g.org.name || g.org.email || 'Unnamed clinic';
    const row = by.get(key) || { clinic: key, email: g.org.email, requests: 0, units: 0, last: '' };
    row.requests += 1;
    row.units += g.units;
    if (String(g.timestamp) > row.last) row.last = String(g.timestamp);
    by.set(key, row);
  }
  return [...by.values()].sort((a, b) => b.last.localeCompare(a.last));
}

export function filterGroups(groups, { status = 'all', clinic = '' } = {}) {
  const s = STATUSES.find((x) => x.id === status) || STATUSES[0];
  return groups.filter((g) => s.match(g.status) && (!clinic || (g.org.name || g.org.email || 'Unnamed clinic') === clinic));
}

function Requests({ session, onSignedOut }) {
  const [state, setState] = useState({ status: 'loading', groups: [], error: null });
  const [status, setStatus] = useState('all');
  const [clinic, setClinic] = useState('');
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading', error: null }));
    try {
      setState({ status: 'done', groups: withOrgs(await getAllRequests(session)), error: null });
    } catch (err) {
      if (err.status === 401 || err.status === 403) return onSignedOut();
      setState((s) => ({ ...s, status: 'error', error: err.message }));
    }
  }, [session, onSignedOut]);
  useEffect(() => { load(); }, [load]);

  const act = async (g, a) => {
    if (a.confirm && !window.confirm(`${a.label} ${g.id} from ${g.org.name || 'this clinic'}? The clinic will be emailed.`)) return;
    setBusy(g.id);
    setActionError(null);
    try {
      await setRequestStatus(g.id, a.status, session);
      await load();
    } catch (err) {
      if (err.status === 401) return onSignedOut();
      setActionError(`${g.id}: ${err instanceof ApiError ? err.message : 'That didn’t work. Try again.'}`);
    } finally {
      setBusy(null);
    }
  };

  const summary = useMemo(() => clinicSummary(state.groups), [state.groups]);
  const shown = useMemo(() => filterGroups(state.groups, { status, clinic }), [state.groups, status, clinic]);

  if (state.status === 'error') return <ErrorState title="Couldn’t load requests" message={state.error} onRetry={load} />;

  return (
    <>
      <section aria-labelledby="clinics-title" className="team__section">
        <h2 id="clinics-title" className="section-title">Clinics</h2>
        {summary.length === 0 ? (
          <p className="hint">{state.status === 'loading' ? 'Loading…' : 'No requests yet.'}</p>
        ) : (
          <div className="team__scroll">
            <table className="team-table">
              <thead><tr><th scope="col">Clinic</th><th scope="col" className="n">Requests</th><th scope="col" className="n">Units</th><th scope="col">Last request</th></tr></thead>
              <tbody>
                {summary.map((c) => (
                  <tr key={c.clinic}>
                    <th scope="row"><button type="button" className="linklike" onClick={() => setClinic(c.clinic)}>{c.clinic}</button></th>
                    <td className="n num">{c.requests}</td>
                    <td className="n num">{c.units.toLocaleString('en-US')}</td>
                    <td>{formatDateTime(c.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="requests-title" className="team__section">
        <div className="team__head">
          <h2 id="requests-title" className="section-title">Requests</h2>
          <button type="button" className="btn btn--secondary btn--sm" onClick={load} disabled={state.status === 'loading'}>
            <Icon name="refresh" size={16} /> Refresh
          </button>
        </div>
        <div className="team__filters">
          <div className="team__chips" role="group" aria-label="Filter by status">
            {STATUSES.map((s) => (
              <button key={s.id} type="button" className={`chip${status === s.id ? ' chip--on' : ''}`} aria-pressed={status === s.id} onClick={() => setStatus(s.id)}>
                {s.label} <span className="num">{filterGroups(state.groups, { status: s.id, clinic }).length}</span>
              </button>
            ))}
          </div>
          <label className="team__select">
            <span>Clinic</span>
            <select value={clinic} onChange={(e) => setClinic(e.target.value)}>
              <option value="">All clinics</option>
              {summary.map((c) => <option key={c.clinic} value={c.clinic}>{c.clinic}</option>)}
            </select>
          </label>
        </div>
        {actionError && <p className="field__error" role="alert">{actionError}</p>}
        {state.status === 'done' && shown.length === 0 ? (
          <EmptyState title="Nothing here">No requests match these filters.</EmptyState>
        ) : (
          <div className="team__scroll">
            <table className="team-table team-table--requests" aria-busy={state.status === 'loading'}>
              <thead>
                <tr><th scope="col">Clinic</th><th scope="col">Date</th><th scope="col">Supplies</th><th scope="col">Status</th><th scope="col"><span className="visually-hidden">Change status</span></th></tr>
              </thead>
              <tbody>
                {shown.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <strong>{g.org.name || 'Unnamed clinic'}</strong>
                      {g.org.email && <><br /><a href={`mailto:${g.org.email}`}>{g.org.email}</a></>}
                      <br /><span className="team__id num">{g.id}</span>
                    </td>
                    <td>{formatDateTime(g.timestamp)}</td>
                    <td>
                      <ul className="team__items">
                        {g.lines.map((l, i) => <li key={i}><span>{l.name}</span> <span className="num">× {l.quantity ?? '–'}</span></li>)}
                      </ul>
                    </td>
                    <td><span className={`team__status team__status--${String(g.status).toLowerCase().replace(/\s+/g, '-')}`}>{STATUS_LABEL[g.status] || g.status}</span></td>
                    <td className="team__actions">
                      {(ACTIONS[g.status] || []).map((a) => (
                        <button key={a.status} type="button" className={`btn btn--sm btn--${a.kind}`} disabled={busy === g.id} onClick={() => act(g, a)}>
                          {a.label}
                        </button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

const inviteLink = (token) => `${window.location.origin}${window.location.pathname}#/welcome/${token}`;
const mailtoFor = (inv, link) => {
  const subject = 'Your Blueprints for Pangaea supply account';
  const body = `Hi ${inv.name || 'there'},\n\n${inv.org} can now request donated medical supplies from Blueprints for Pangaea.\nOpen this link to choose your password and set up your account:\n\n${link}\n\nThe link works until your account is set up. Questions? Just reply to this email.\n\nBlueprints for Pangaea`;
  return `mailto:${encodeURIComponent(inv.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

function Invites() {
  const [values, setValues] = useState({ org: '', name: '', email: '' });
  const [errors, setErrors] = useState({});
  const [made, setMade] = useState(null);
  const [copied, setCopied] = useState(false);
  const [invites, setInvites] = useState(() => listInvites());
  const linkRef = useRef(null);

  const set = (k) => (e) => { setValues((v) => ({ ...v, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: null })); };

  const submit = (e) => {
    e.preventDefault();
    const next = {
      org: values.org.trim() ? null : 'Type the clinic’s name.',
      name: values.name.trim() ? null : 'Type the contact person’s name.',
      email: emailError(values.email),
    };
    setErrors(next);
    if (next.org || next.name || next.email) return;
    const token = createInvite(values);
    setMade({ token, ...values, email: cleanEmail(values.email) });
    setCopied(false);
    setValues({ org: '', name: '', email: '' });
    setInvites(listInvites());
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      if (linkRef.current) linkRef.current.select();
    }
  };

  const cancel = (inv) => {
    if (!window.confirm(`Cancel the link for ${inv.org}? It will stop working.`)) return;
    cancelInvite(inv.token);
    setInvites(listInvites());
    if (made && made.token === inv.token) setMade(null);
  };

  const field = (k, label, type = 'text', auto) => (
    <div className={`field${errors[k] ? ' field--error' : ''}`}>
      <label htmlFor={`inv-${k}`}>{label}</label>
      <input id={`inv-${k}`} type={type} autoComplete={auto} value={values[k]} onChange={set(k)}
        aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `inv-${k}-error` : undefined} />
      {errors[k] && <p className="field__error" id={`inv-${k}-error`}>{errors[k]}</p>}
    </div>
  );

  return (
    <>
      <section className="team__section" aria-labelledby="new-link-title">
        <h2 id="new-link-title" className="section-title">Make a clinic access link</h2>
        <p className="hint">The clinic opens the link, checks its details and chooses a password. The link works until then.</p>
        <form className="team__form" onSubmit={submit} noValidate>
          {field('org', 'Clinic name', 'text', 'organization')}
          {field('name', 'Contact name', 'text', 'off')}
          {field('email', 'Contact email', 'email', 'off')}
          <button type="submit" className="btn btn--primary">Make link</button>
        </form>
        {made && (
          <div className="team__made" role="status">
            <p><strong>Link for {made.org}</strong> ({made.email})</p>
            <input ref={linkRef} className="team__link" readOnly value={inviteLink(made.token)} aria-label={`Access link for ${made.org}`} onFocus={(e) => e.target.select()} />
            <div className="team__made-actions">
              <button type="button" className="btn btn--secondary" onClick={() => copy(inviteLink(made.token))}>
                <Icon name="copy" size={18} /> {copied ? 'Copied' : 'Copy link'}
              </button>
              <a className="btn btn--primary" href={mailtoFor(made, inviteLink(made.token))}>
                <Icon name="mail" size={18} /> Email this link
              </a>
            </div>
          </div>
        )}
      </section>

      <section className="team__section" aria-labelledby="links-title">
        <h2 id="links-title" className="section-title">Links</h2>
        {invites.length === 0 ? (
          <p className="hint">No links yet.</p>
        ) : (
          <div className="team__scroll">
            <table className="team-table">
              <thead><tr><th scope="col">Clinic</th><th scope="col">Contact</th><th scope="col">Made</th><th scope="col">Status</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.token}>
                    <th scope="row">{inv.org}</th>
                    <td>{inv.name}<br /><a href={`mailto:${inv.email}`}>{inv.email}</a></td>
                    <td>{formatDateTime(new Date(inv.created).toISOString())}</td>
                    <td><span className={`team__status team__status--${inv.status === 'Waiting' ? 'waiting' : 'done'}`}>{inv.status}</span></td>
                    <td className="team__actions">
                      {inv.status === 'Waiting' && (
                        <>
                          <button type="button" className="btn btn--sm btn--secondary" onClick={() => copy(inviteLink(inv.token))}>Copy link</button>
                          <button type="button" className="btn btn--sm btn--quiet" onClick={() => cancel(inv)}>Cancel link</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export default function TeamDashboard({ member, onSignOut }) {
  const [tab, setTab] = useState('requests');
  const titleRef = useRef(null);
  useEffect(() => titleRef.current && titleRef.current.focus(), []);
  const tabs = [['requests', 'Requests'], ['links', 'Clinic access links']];

  return (
    <div className="team">
      <div className="team__top">
        <div>
          <h1 className="page-title" tabIndex={-1} ref={titleRef}>Blueprints team</h1>
          <p className="hint">Signed in as <strong>{member.name || member.email}</strong>{member.position ? `, ${member.position}` : ''}</p>
        </div>
        <button type="button" className="btn btn--secondary" onClick={onSignOut}>Sign out</button>
      </div>
      <div className="team__tabs" role="tablist" aria-label="Dashboard">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`}
            className={`team__tab${tab === id ? ' team__tab--on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'requests' ? <Requests session={member.token} onSignedOut={onSignOut} /> : <Invites />}
      </div>
    </div>
  );
}
