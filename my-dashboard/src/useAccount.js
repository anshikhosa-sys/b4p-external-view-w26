import { useCallback, useEffect, useState } from 'react';
import { clinicMe } from './api';
import { readJSON, writeJSON } from './storage';

// The signed-in clinic: {email, org, token}. The token is a signed session from the server
// (POST /api/auth/verify), checked with GET /api/auth/me when the page opens.
const KEY = 'b4p.session.v2';
// Clinic names by email, so signing in again on this device skips the "clinic name" step.
const ORGS_KEY = 'b4p.clinics.v1';

const valid = (s) => (s && typeof s.email === 'string' && typeof s.org === 'string' && typeof s.token === 'string' ? s : null);

export const knownOrg = (email) => {
  const orgs = readJSON(ORGS_KEY, {});
  return orgs && typeof orgs[email] === 'string' ? orgs[email] : '';
};

export default function useAccount() {
  const [account, setAccount] = useState(() => valid(readJSON(KEY, null)));
  const [checked, setChecked] = useState(!account);

  useEffect(() => {
    if (!account || checked) return undefined;
    let live = true;
    clinicMe(account.token)
      .then(() => live && setChecked(true))
      .catch((err) => {
        if (!live) return;
        if (err.status === 401) {
          writeJSON(KEY, null);
          setAccount(null);
        }
        setChecked(true);
      });
    return () => { live = false; };
  }, [account, checked]);

  const signedIn = useCallback((next) => {
    writeJSON(ORGS_KEY, { ...readJSON(ORGS_KEY, {}), [next.email]: next.org });
    writeJSON(KEY, next);
    setAccount(next);
    setChecked(true);
  }, []);

  const signOut = useCallback(() => {
    setAccount(null);
    writeJSON(KEY, null);
  }, []);

  return { account, signedIn, signOut };
}
