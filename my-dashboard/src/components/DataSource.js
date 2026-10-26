import { useEffect, useState } from 'react';
import { getHealth } from '../api';

const LABELS = { postgres: 'the Postgres database', sheet: 'the Google Sheet' };

// For people testing the site: says where the supply list is coming from (GET /health).
// Shown in development, or in a build made with REACT_APP_SHOW_SOURCE=1.
export const showDataSource = () => process.env.NODE_ENV === 'development' || process.env.REACT_APP_SHOW_SOURCE === '1';

export default function DataSource() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    let live = true;
    getHealth()
      .then((h) => live && setHealth(h))
      .catch(() => live && setHealth({ source: null }));
    return () => {
      live = false;
    };
  }, []);
  if (!health) return null;
  const where = LABELS[health.source];
  return (
    <p className="footer__source">
      {where ? `Supplies from ${where}` : 'Couldn’t ask the server where the supplies come from'}
      {where && health.ok === false && ' (not answering)'}
      {' · '}Sign-in: preview accounts on this device
    </p>
  );
}
