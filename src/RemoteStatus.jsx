import { useEffect, useState } from 'react';
import { subscribe } from './lib/dbHealth.js';

/**
 * A thin banner shown whenever answers are NOT reaching the hosted database.
 *
 * Mounted once in App.jsx so it sits over every screen of both versions without
 * either 1000-line file having to know about it. It is deliberately quiet — the
 * data is not lost when this shows (localStore.js still has every row), but the
 * run needs attention before the next participant.
 */
export default function RemoteStatus() {
  const [state, setState] = useState({ mode: 'unknown' });

  useEffect(() => subscribe(setState), []);

  if (state.mode !== 'failing' && state.mode !== 'unconfigured') return null;

  const unconfigured = state.mode === 'unconfigured';

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 400,
        pointerEvents: 'none',
        padding: 'calc(env(safe-area-inset-top, 0px) + 4px) 12px 5px',
        background: unconfigured ? 'rgba(120,53,15,0.92)' : 'rgba(153,27,27,0.92)',
        color: 'white',
        fontSize: '11px',
        lineHeight: 1.35,
        textAlign: 'center',
        fontFamily: '"DM Sans", -apple-system, sans-serif',
      }}
    >
      {unconfigured
        ? 'No database configured — this run is saved on this device only'
        : 'Not saving to the server — this run is saved on this device only'}
    </div>
  );
}
