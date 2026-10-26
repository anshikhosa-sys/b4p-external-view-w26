import { useCallback, useEffect, useState } from 'react';
import { teamMe, teamSignOut } from './api';
import { readJSON, writeJSON } from './storage';

// The Blueprints team session (preview): {token, name, email, position}. The server holds the
// real session; this copy is checked with GET /api/team/me when the page opens.
const KEY = 'b4p.team.session.v1';

const valid = (s) => s && typeof s.token === 'string' && typeof s.email === 'string' ? s : null;

export default function useTeam() {
  const [member, setMember] = useState(() => valid(readJSON(KEY, null)));
  const [checked, setChecked] = useState(!member);

  useEffect(() => {
    if (!member || checked) return undefined;
    let live = true;
    teamMe(member.token)
      .then(() => live && setChecked(true))
      .catch((err) => {
        if (!live) return;
        if (err.status === 401) {
          writeJSON(KEY, null);
          setMember(null);
        }
        setChecked(true);
      });
    return () => { live = false; };
  }, [member, checked]);

  const signedIn = useCallback((next) => {
    writeJSON(KEY, next);
    setMember(next);
    setChecked(true);
  }, []);

  const signOut = useCallback(() => {
    if (member) teamSignOut(member.token).catch(() => {});
    writeJSON(KEY, null);
    setMember(null);
  }, [member]);

  return { member, checked, signedIn, signOut };
}
