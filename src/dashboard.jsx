/**
 * Researcher dashboard for the Supabase backend.
 *
 * Reachable at /?view=dashboard (deliberately not linked from the experiment
 * home screen, so participants never stumble into it).
 *
 * Read-only: it never writes to the database. Credentials come from
 * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY when they are set at build time,
 * otherwise from a connect form whose values live in localStorage.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { readAll as readLocal, counts as localCounts, clearAll as clearLocal } from './lib/localStore.js';

const CFG_KEY = 'nla_dashboard_cfg';
const PAGE_SIZE = 1000;

// ─── config ───────────────────────────────────────────────

function readStoredCfg() {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.url && parsed?.key) return parsed;
    }
  } catch {
    // corrupt entry — fall through to env
  }
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return url && key ? { url, key, fromEnv: true } : null;
}

// ─── data loading ─────────────────────────────────────────

/** Page through a table 1000 rows at a time — Supabase caps a single request. */
async function fetchAll(client, table) {
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
    from += PAGE_SIZE;
  }
}

// ─── small helpers ────────────────────────────────────────

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');
const ms = (v) => (v == null || Number.isNaN(v) ? '—' : `${Math.round(v)} ms`);
const num = (v) => (v == null ? '—' : v);

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function duration(startIso, endIso) {
  if (!startIso || !endIso) return '—';
  const secs = Math.round((new Date(endIso) - new Date(startIso)) / 1000);
  if (secs < 0) return '—';
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

/**
 * device_os holds a whole user-agent string. Pull out the phone and browser so the
 * table stays readable; the untouched string is still in the cell's tooltip and in
 * the CSV export.
 */
function describeDevice(p) {
  const ua = p.device_os ?? '';
  if (!ua) return p.device_model ?? '';
  const os =
    /iPhone|iPad/.test(ua) ? (ua.match(/OS (\d+)[._](\d+)/) ? `iOS ${RegExp.$1}.${RegExp.$2}` : 'iOS')
    : /Android/.test(ua) ? (ua.match(/Android (\d+(?:\.\d+)?)/) ? `Android ${RegExp.$1}` : 'Android')
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows'
    : /Linux/.test(ua) ? 'Linux'
    : 'Unknown OS';
  const browser =
    /CriOS|Chrome/.test(ua) ? 'Chrome'
    : /FxiOS|Firefox/.test(ua) ? 'Firefox'
    : /Instagram/.test(ua) ? 'Instagram'
    : /Safari/.test(ua) ? 'Safari'
    : '';
  const model = p.device_model ? ` · ${p.device_model}` : '';
  return [os, browser].filter(Boolean).join(' · ') + model;
}

function csvEscape(v) {
  if (v == null) return '';
  const s = Array.isArray(v) ? v.join('|') : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename, header, rows) {
  const body = [header.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── presentational bits ──────────────────────────────────

function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** Horizontal bars. `bars` = [{ label, value, caption }], value normalised against max. */
function BarChart({ title, bars, format = (v) => v, empty = 'No data yet' }) {
  const max = Math.max(...bars.map((b) => b.value), 0);
  return (
    <div className="card">
      <h3>{title}</h3>
      {!bars.length || max === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <div className="bars">
          {bars.map((b) => (
            <div className="bar-row" key={b.label}>
              <div className="bar-label">{b.label}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(b.value / max) * 100}%` }} />
              </div>
              <div className="bar-value">
                {format(b.value)}
                {b.caption && <span className="bar-caption"> {b.caption}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Accuracy({ correct, total }) {
  if (!total) return <span className="muted">—</span>;
  const p = (correct / total) * 100;
  const tone = p >= 75 ? 'good' : p >= 50 ? 'mid' : 'low';
  return <span className={`pill ${tone}`}>{p.toFixed(0)}%</span>;
}

// ─── connect screen ───────────────────────────────────────

function ConnectForm({ onConnect }) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  return (
    <div className="connect">
      <div className="card connect-card">
        <h2>Connect to Supabase</h2>
        <p className="muted">
          No build-time credentials found. Paste the project URL and the <strong>anon</strong> key
          (Supabase → Project Settings → API). They are stored in this browser only.
        </p>
        <label>
          Project URL
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value.trim())}
            placeholder="https://xxxxxxxx.supabase.co"
            autoComplete="off"
          />
        </label>
        <label>
          Anon key
          <input
            value={key}
            onChange={(e) => setKey(e.target.value.trim())}
            placeholder="eyJhbGciOi..."
            autoComplete="off"
          />
        </label>
        <button
          className="primary"
          disabled={!url || !key}
          onClick={() => {
            const cfg = { url, key };
            localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
            onConnect(cfg);
          }}
        >
          Connect
        </button>
      </div>
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────

export default function Dashboard() {
  const [cfg, setCfg] = useState(readStoredCfg);
  // 'device' reads the localStorage mirror that db.js always writes; 'supabase'
  // reads the hosted tables. Default to whichever is actually available, so the
  // dashboard shows real numbers instead of a connect form on first open.
  const [source, setSource] = useState(() => (readStoredCfg() ? 'supabase' : 'device'));
  const [remoteData, setRemoteData] = useState(null);
  const [remoteStatus, setRemoteStatus] = useState('loading'); // idle | loading | ready | error
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState({ participant: null, session: null });
  const [reloadToken, setReloadToken] = useState(0);

  const client = useMemo(
    () => (cfg ? createClient(cfg.url, cfg.key) : null),
    [cfg],
  );

  // localStorage reads are synchronous, so derive them during render rather than
  // pushing them through an effect — no loading state, no cascading re-render.
  const localData = useMemo(
    () => (source === 'device' ? { ...readLocal(), loadedAt: new Date() } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, reloadToken],
  );

  const data = source === 'device' ? localData : remoteData;
  const status = source === 'device' ? 'ready' : remoteStatus;

  // Status is flipped to 'loading' by the caller (connect / refresh) so this
  // effect only ever writes terminal states — no synchronous setState on mount.
  useEffect(() => {
    let cancelled = false;
    if (source !== 'supabase' || !client) return undefined;
    (async () => {
      try {
        const [participants, sessions, blocks, trials] = await Promise.all([
          fetchAll(client, 'participants'),
          fetchAll(client, 'sessions'),
          fetchAll(client, 'orientation_blocks'),
          fetchAll(client, 'trials'),
        ]);
        if (cancelled) return;
        setRemoteData({ participants, sessions, blocks, trials, loadedAt: new Date() });
        setError(null);
        setRemoteStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        setRemoteStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [client, reloadToken, source]);

  const load = useCallback(() => {
    if (source === 'supabase') setRemoteStatus('loading');
    setReloadToken((t) => t + 1);
  }, [source]);

  const switchSource = useCallback((next) => {
    setSelected({ participant: null, session: null });
    setError(null);
    if (next === 'supabase') setRemoteStatus('loading');
    setSource(next);
  }, []);

  // ── derived indexes ──
  const derived = useMemo(() => {
    if (!data) return null;
    const { participants, sessions, blocks, trials } = data;

    const blockById = new Map(blocks.map((b) => [b.id, b]));
    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const participantById = new Map(participants.map((p) => [p.id, p]));

    // trial → session → participant
    const trialsBySession = new Map();
    const trialsByBlock = new Map();
    const orphanTrials = [];
    for (const t of trials) {
      const block = blockById.get(t.block_id);
      if (!block) { orphanTrials.push(t); continue; }
      if (!trialsByBlock.has(block.id)) trialsByBlock.set(block.id, []);
      trialsByBlock.get(block.id).push(t);
      if (!trialsBySession.has(block.session_id)) trialsBySession.set(block.session_id, []);
      trialsBySession.get(block.session_id).push(t);
    }

    const blocksBySession = new Map();
    for (const b of blocks) {
      if (!blocksBySession.has(b.session_id)) blocksBySession.set(b.session_id, []);
      blocksBySession.get(b.session_id).push(b);
    }
    for (const list of blocksBySession.values()) list.sort((a, b) => a.block_order - b.block_order);

    const sessionsByParticipant = new Map();
    for (const s of sessions) {
      if (!sessionsByParticipant.has(s.participant_id)) sessionsByParticipant.set(s.participant_id, []);
      sessionsByParticipant.get(s.participant_id).push(s);
    }
    for (const list of sessionsByParticipant.values()) {
      list.sort((a, b) => new Date(a.timestamp_start) - new Date(b.timestamp_start));
    }

    const trialsByParticipant = new Map();
    for (const [sid, list] of trialsBySession) {
      const s = sessionById.get(sid);
      if (!s) continue;
      if (!trialsByParticipant.has(s.participant_id)) trialsByParticipant.set(s.participant_id, []);
      trialsByParticipant.get(s.participant_id).push(...list);
    }

    const answered = trials.filter((t) => !t.timeout);
    const rts = answered.map((t) => t.reaction_time_ms).filter((v) => typeof v === 'number');

    const byVersion = ['ego', 'allo'].map((v) => {
      const ids = new Set(sessions.filter((s) => s.version === v).map((s) => s.id));
      const ts = trials.filter((t) => ids.has(blockById.get(t.block_id)?.session_id));
      const ok = ts.filter((t) => t.accuracy).length;
      return { version: v, trials: ts.length, correct: ok, rt: median(ts.filter((t) => !t.timeout).map((t) => t.reaction_time_ms)) };
    });

    const layouts = new Map();
    for (const t of trials) {
      const k = t.layout ?? 'unknown';
      const cur = layouts.get(k) ?? { total: 0, correct: 0 };
      cur.total += 1;
      if (t.accuracy) cur.correct += 1;
      layouts.set(k, cur);
    }

    const orientErrors = blocks
      .map((b) => b.orientation_error_deg)
      .filter((v) => typeof v === 'number')
      .map(Math.abs);

    return {
      blockById, sessionById, participantById,
      trialsBySession, trialsByBlock, blocksBySession, sessionsByParticipant, trialsByParticipant,
      orphanTrials,
      totals: {
        participants: participants.length,
        sessions: sessions.length,
        completed: sessions.filter((s) => s.timestamp_end).length,
        trials: trials.length,
        correct: trials.filter((t) => t.accuracy).length,
        timeouts: trials.filter((t) => t.timeout).length,
        medianRt: median(rts),
        blocks: blocks.length,
        orientErr: median(orientErrors),
      },
      byVersion,
      layouts,
      rts,
    };
  }, [data]);

  const exportTrials = () => {
    if (!data || !derived) return;
    const header = [
      'participant_code', 'device_os', 'device_model', 'timezone',
      'session_id', 'version', 'session_type', 'session_start', 'day_index',
      'block_order', 'target_allocentric_direction', 'final_facing_direction',
      'orientation_error_deg', 'orientation_latency_ms',
      'trial_index', 'layout', 'square_first', 'correct_answer',
      'participant_response', 'accuracy', 'reaction_time_ms', 'timeout',
      'options_shown', 'trial_timestamp', 'app_version',
    ];
    const rows = [];
    for (const t of data.trials) {
      const b = derived.blockById.get(t.block_id);
      const s = b ? derived.sessionById.get(b.session_id) : null;
      const p = s ? derived.participantById.get(s.participant_id) : null;
      rows.push([
        p?.participant_code, p?.device_os, p?.device_model, p?.timezone,
        s?.id, s?.version, s?.session_type, s?.timestamp_start, s?.day_index,
        b?.block_order, b?.target_allocentric_direction, b?.final_facing_direction,
        b?.orientation_error_deg, b?.orientation_latency_ms,
        t.trial_index, t.layout, t.square_first, t.correct_answer,
        t.participant_response, t.accuracy, t.reaction_time_ms, t.timeout,
        t.options_shown, t.timestamp, t.app_version,
      ]);
    }
    downloadCsv(`nt2-nav-trials-${new Date().toISOString().slice(0, 10)}.csv`, header, rows);
  };

  if (source === 'supabase' && !cfg) {
    return (
      <Shell>
        <div className="source-switch">
          <button onClick={() => switchSource('device')}>← Back to this device&apos;s data</button>
        </div>
        <ConnectForm onConnect={(next) => { setRemoteStatus('loading'); setCfg(next); }} />
      </Shell>
    );
  }

  const stored = localCounts();

  return (
    <Shell>
      <header className="topbar">
        <div>
          <h1>NT2 Navigation — Data</h1>
          <p className="muted small">
            {source === 'device'
              ? `Saved on this device · ${stored.trials} trial${stored.trials === 1 ? '' : 's'} recorded`
              : `${cfg.url.replace('https://', '')}${cfg.fromEnv ? ' · from build env' : ' · from this browser'}`}
            {data && ` · loaded ${data.loadedAt.toLocaleTimeString()}`}
          </p>
        </div>
        <div className="actions">
          <div className="seg">
            <button
              className={source === 'device' ? 'on' : ''}
              onClick={() => source !== 'device' && switchSource('device')}
            >
              This device
            </button>
            <button
              className={source === 'supabase' ? 'on' : ''}
              onClick={() => source !== 'supabase' && switchSource('supabase')}
            >
              Supabase
            </button>
          </div>
          <button onClick={load} disabled={status === 'loading'}>
            {status === 'loading' ? 'Loading…' : 'Refresh'}
          </button>
          <button onClick={exportTrials} disabled={!derived?.totals.trials}>Export CSV</button>
          {source === 'supabase' && (
            <button
              className="ghost"
              onClick={() => {
                localStorage.removeItem(CFG_KEY);
                setCfg(null);
                setRemoteData(null);
                setRemoteStatus('idle');
              }}
            >
              Disconnect
            </button>
          )}
          {source === 'device' && stored.trials > 0 && (
            <button
              className="ghost"
              onClick={() => {
                const ok = window.confirm(
                  `Delete all ${stored.trials} trials saved on this device? Export the CSV first — this cannot be undone.`,
                );
                if (!ok) return;
                clearLocal();
                load();
              }}
            >
              Clear device data
            </button>
          )}
        </div>
      </header>

      {source === 'device' && (
        <div className="card note">
          Every session is written to this browser as it runs, so nothing is lost when
          Supabase is not set up or the phone drops offline. It only lives in{' '}
          <strong>this</strong> browser though — export the CSV before clearing site
          data or switching devices.
        </div>
      )}

      {status === 'error' && (
        <div className="card error">
          <strong>Could not load data.</strong>
          <p>{error}</p>
          <p className="muted small">
            Check the URL and anon key, and that RLS allows SELECT for the anon role.
          </p>
        </div>
      )}

      {status === 'loading' && !data && <div className="card muted">Loading…</div>}

      {derived && (
        <>
          <section className="stats">
            <Stat label="Participants" value={derived.totals.participants} />
            <Stat
              label="Sessions"
              value={derived.totals.sessions}
              sub={`${derived.totals.completed} completed`}
            />
            <Stat
              label="Trials"
              value={derived.totals.trials}
              sub={`${derived.totals.blocks} orientation blocks`}
            />
            <Stat
              label="Accuracy"
              value={pct(derived.totals.correct, derived.totals.trials)}
              sub={`${derived.totals.correct} correct`}
            />
            <Stat
              label="Median RT"
              value={ms(derived.totals.medianRt)}
              sub="timeouts excluded"
            />
            <Stat
              label="Timeouts"
              value={pct(derived.totals.timeouts, derived.totals.trials)}
              sub={`${derived.totals.timeouts} trials`}
            />
          </section>

          <section className="grid-2">
            <BarChart
              title="Accuracy by condition"
              bars={derived.byVersion.map((v) => ({
                label: v.version.toUpperCase(),
                value: v.trials ? (v.correct / v.trials) * 100 : 0,
                caption: `(${v.correct}/${v.trials}, median ${ms(v.rt)})`,
              }))}
              format={(v) => `${v.toFixed(1)}%`}
              empty="No trials recorded yet"
            />
            <BarChart
              title="Accuracy by layout"
              bars={[...derived.layouts.entries()].map(([k, v]) => ({
                label: k,
                value: (v.correct / v.total) * 100,
                caption: `(${v.correct}/${v.total})`,
              }))}
              format={(v) => `${v.toFixed(1)}%`}
              empty="No trials recorded yet"
            />
          </section>

          <ParticipantsTable
            data={data}
            derived={derived}
            selected={selected}
            setSelected={setSelected}
          />

          {derived.orphanTrials.length > 0 && (
            <div className="card warn">
              {derived.orphanTrials.length} trial(s) reference a missing orientation block and are
              excluded from the per-participant rollups.
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

// ─── participants / sessions / trials drill-down ──────────

function ParticipantsTable({ data, derived, selected, setSelected }) {
  const { participants } = data;
  if (!participants.length) {
    return <div className="card muted">No participants yet. Run a session to populate the database.</div>;
  }

  const openParticipant = selected.participant
    ? derived.participantById.get(selected.participant)
    : null;
  const sessions = openParticipant
    ? derived.sessionsByParticipant.get(openParticipant.id) ?? []
    : [];
  const openSession = selected.session ? derived.sessionById.get(selected.session) : null;

  return (
    <>
      <div className="card">
        <h3>Participants</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Code</th><th>Sessions</th><th>Trials</th><th>Accuracy</th>
                <th>Median RT</th><th>Device</th><th>First seen</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => {
                const ts = derived.trialsByParticipant.get(p.id) ?? [];
                const correct = ts.filter((t) => t.accuracy).length;
                const rt = median(ts.filter((t) => !t.timeout).map((t) => t.reaction_time_ms));
                const active = selected.participant === p.id;
                return (
                  <tr
                    key={p.id}
                    className={active ? 'row active' : 'row'}
                    onClick={() => setSelected({ participant: active ? null : p.id, session: null })}
                  >
                    <td className="mono">{p.participant_code}</td>
                    <td>{(derived.sessionsByParticipant.get(p.id) ?? []).length}</td>
                    <td>{ts.length}</td>
                    <td><Accuracy correct={correct} total={ts.length} /></td>
                    <td>{ms(rt)}</td>
                    <td className="muted small truncate" title={[p.device_os, p.device_model].filter(Boolean).join(' · ')}>
                      {describeDevice(p) || '—'}
                    </td>
                    <td className="muted small">{fmtDate(p.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {openParticipant && (
        <div className="card">
          <h3>
            Sessions — <span className="mono">{openParticipant.participant_code}</span>
          </h3>
          {!sessions.length ? (
            <p className="muted">No sessions for this participant.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Started</th><th>Version</th><th>Type</th><th>Trials</th>
                    <th>Accuracy</th><th>Avg RT</th><th>Duration</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => {
                    const ts = derived.trialsBySession.get(s.id) ?? [];
                    const correct = ts.filter((t) => t.accuracy).length;
                    const active = selected.session === s.id;
                    return (
                      <tr
                        key={s.id}
                        className={active ? 'row active' : 'row'}
                        onClick={() => setSelected((prev) => ({ ...prev, session: active ? null : s.id }))}
                      >
                        <td className="muted small">{fmtDate(s.timestamp_start)}</td>
                        <td><span className="tag">{s.version}</span></td>
                        <td>{s.session_type}</td>
                        <td>{ts.length}</td>
                        <td><Accuracy correct={correct} total={ts.length} /></td>
                        <td>{ms(s.avg_reaction_time_ms)}</td>
                        <td className="muted small">{duration(s.timestamp_start, s.timestamp_end)}</td>
                        <td>
                          {s.timestamp_end
                            ? <span className="pill good">complete</span>
                            : <span className="pill low">abandoned</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {openSession && <SessionDetail session={openSession} derived={derived} />}
    </>
  );
}

function SessionDetail({ session, derived }) {
  const blocks = derived.blocksBySession.get(session.id) ?? [];
  return (
    <div className="card">
      <h3>Session detail — {session.version} / {session.session_type}</h3>
      {!blocks.length ? (
        <p className="muted">No orientation blocks recorded for this session.</p>
      ) : (
        blocks.map((b) => {
          const trials = (derived.trialsByBlock.get(b.id) ?? [])
            .sort((x, y) => x.trial_index - y.trial_index);
          return (
            <div className="block" key={b.id}>
              <div className="block-head">
                <strong>Block {b.block_order}</strong>
                <span className="muted small">
                  target {num(b.target_allocentric_direction)}° · faced {num(b.final_facing_direction)}° ·
                  error {b.orientation_error_deg == null ? '—' : `${b.orientation_error_deg.toFixed(1)}°`} ·
                  latency {ms(b.orientation_latency_ms)}
                </span>
              </div>
              <div className="table-scroll">
                <table className="dense">
                  <thead>
                    <tr>
                      <th>#</th><th>Layout</th><th>Square first</th><th>Correct</th>
                      <th>Response</th><th>Hit</th><th>RT</th><th>Options</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trials.map((t) => (
                      <tr key={t.id}>
                        <td>{t.trial_index}</td>
                        <td>{t.layout}</td>
                        <td>{String(t.square_first)}</td>
                        <td className="mono">{t.correct_answer}</td>
                        <td className="mono">{t.timeout ? <span className="muted">timeout</span> : num(t.participant_response)}</td>
                        <td>{t.accuracy ? <span className="pill good">✓</span> : <span className="pill low">✗</span>}</td>
                        <td>{ms(t.reaction_time_ms)}</td>
                        <td className="muted small">{(t.options_shown ?? []).join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── shell + styles ───────────────────────────────────────

function Shell({ children }) {
  return (
    <div className="dash">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');

        .dash {
          --bg: #f6f7f9;
          --card: #ffffff;
          --line: #e4e7ec;
          --text: #16181d;
          --muted: #6b7280;
          --accent: #3b5bdb;
          --good: #12805c;
          --good-bg: #e6f6f0;
          --mid: #9a6700;
          --mid-bg: #fdf3d7;
          --low: #b42318;
          --low-bg: #fdecea;
          position: absolute;
          inset: 0;
          overflow-y: auto;
          overflow-x: hidden;
          background: var(--bg);
          color: var(--text);
          font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .dash * { box-sizing: border-box; }

        .topbar {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 16px; flex-wrap: wrap;
        }
        .topbar h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
        .actions { display: flex; gap: 8px; flex-wrap: wrap; }

        .dash button {
          font: inherit; font-weight: 500; padding: 8px 14px; border-radius: 8px;
          border: 1px solid var(--line); background: var(--card); color: var(--text);
          cursor: pointer;
        }
        .dash button:hover:not(:disabled) { border-color: #c7cbd4; }
        .dash button:disabled { opacity: 0.45; cursor: default; }
        .dash button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
        .dash button.ghost { background: transparent; color: var(--muted); }

        .muted { color: var(--muted); }
        .small { font-size: 12px; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }

        .card {
          background: var(--card); border: 1px solid var(--line);
          border-radius: 12px; padding: 16px;
        }
        .card h3 { font-size: 14px; font-weight: 600; margin-bottom: 12px; }
        .card.error { border-color: #f2b8b5; background: var(--low-bg); }
        .card.warn { border-color: #f0d9a8; background: var(--mid-bg); font-size: 13px; }
        .card.note { font-size: 13px; color: var(--muted); line-height: 1.5; }

        .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
        .seg button { border: none; border-radius: 0; background: var(--card); padding: 8px 12px; }
        .seg button + button { border-left: 1px solid var(--line); }
        .seg button.on { background: #eef2ff; color: var(--accent); font-weight: 600; }

        .source-switch { margin-bottom: 4px; }
        .source-switch button { background: transparent; border: none; color: var(--muted); padding: 4px 0; }

        .stats {
          display: grid; gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        }
        .stat {
          background: var(--card); border: 1px solid var(--line);
          border-radius: 12px; padding: 14px 16px;
        }
        .stat-label { font-size: 12px; color: var(--muted); font-weight: 500; }
        .stat-value { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin-top: 2px; }
        .stat-sub { font-size: 12px; color: var(--muted); margin-top: 2px; }

        .grid-2 { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }

        .bars { display: flex; flex-direction: column; gap: 10px; }
        .bar-row { display: grid; grid-template-columns: 72px 1fr auto; align-items: center; gap: 10px; }
        .bar-label { font-size: 12px; font-weight: 600; }
        .bar-track { height: 10px; background: #eef0f4; border-radius: 999px; overflow: hidden; }
        .bar-fill { height: 100%; background: var(--accent); border-radius: 999px; }
        .bar-value { font-size: 12px; font-weight: 600; white-space: nowrap; }
        .bar-caption { color: var(--muted); font-weight: 400; }

        .table-scroll { overflow-x: auto; }
        .dash table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .dash th {
          text-align: left; font-size: 11px; text-transform: uppercase;
          letter-spacing: 0.04em; color: var(--muted); font-weight: 600;
          padding: 6px 10px; border-bottom: 1px solid var(--line); white-space: nowrap;
        }
        .dash td { padding: 8px 10px; border-bottom: 1px solid #f0f1f4; white-space: nowrap; }
        .dash td.truncate { max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
        .dash tr.row { cursor: pointer; }
        .dash tr.row:hover td { background: #f8f9fb; }
        .dash tr.row.active td { background: #eef2ff; }
        table.dense td, table.dense th { padding: 5px 10px; }

        .pill {
          display: inline-block; padding: 2px 8px; border-radius: 999px;
          font-size: 12px; font-weight: 600;
        }
        .pill.good { background: var(--good-bg); color: var(--good); }
        .pill.mid  { background: var(--mid-bg);  color: var(--mid); }
        .pill.low  { background: var(--low-bg);  color: var(--low); }
        .tag {
          display: inline-block; padding: 2px 8px; border-radius: 6px;
          background: #eef2ff; color: var(--accent); font-size: 12px; font-weight: 600;
        }

        .block { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 12px; }
        .block:first-of-type { border-top: none; padding-top: 0; margin-top: 0; }
        .block-head { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; margin-bottom: 6px; }

        .connect { display: flex; align-items: center; justify-content: center; min-height: 70vh; }
        .connect-card { width: min(460px, 100%); display: flex; flex-direction: column; gap: 12px; }
        .connect-card h2 { font-size: 18px; font-weight: 700; }
        .connect-card label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 500; }
        .connect-card input {
          font: inherit; font-size: 13px; padding: 9px 11px; border-radius: 8px;
          border: 1px solid var(--line); background: #fff;
        }
        .connect-card input:focus { outline: 2px solid #c7d2fe; outline-offset: -1px; }

        @media (max-width: 640px) {
          .dash { padding: 14px; }
          .topbar h1 { font-size: 18px; }
          .stat-value { font-size: 22px; }
        }
      `}</style>
      {children}
    </div>
  );
}
