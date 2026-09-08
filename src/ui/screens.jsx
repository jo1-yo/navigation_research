import { useEffect, useState } from 'react';
import { C, T, R, SP } from './theme.js';
import {
  Screen, LargeTitle, Button, Card, Row, SectionLabel, Metric,
  Progress, Segmented, Sheet, Alert, Glyph, Hint,
} from './kit.jsx';
import { Droplet, Avatar } from './Droplet.jsx';

/**
 * Every screen that is identical between the egocentric and allocentric versions,
 * written once. Both version files render these and keep only what actually
 * differs: the trial question, the answer key, and which participant record they
 * store. Before this, each of those 1000-line files carried its own copy of all
 * of it, and any visual fix had to be made twice.
 */

// ─── sign in ──────────────────────────────────────────────

export function LoginScreen({ versionLabel, onLogin }) {
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    if (!code.trim()) return setError('Enter your participant code.');
    if (!email.trim() || !email.includes('@') || !email.includes('.edu')) {
      return setError('Enter your university email address.');
    }
    onLogin({ participantCode: code.trim(), email: email.trim() });
  };

  const field = {
    ...T.body, width: '100%', border: 'none', outline: 'none', background: 'transparent',
    padding: `13px ${SP.gutter}px`, color: C.label, fontFamily: 'inherit',
  };

  return (
    <Screen center grouped>
      <div style={{ alignSelf: 'center' }}>
        <Droplet mood="excited" size={72} />
      </div>
      <div style={{ marginBottom: 8, textAlign: 'center' }}>
        <LargeTitle subtitle={versionLabel}>Navigation Learning</LargeTitle>
      </div>

      <Card>
        <div style={{ borderBottom: `0.5px solid ${C.separator}` }}>
          <input
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(''); }}
            placeholder="Participant code"
            autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            style={{ ...field, letterSpacing: '0.08em' }}
          />
        </div>
        <input
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(''); }}
          placeholder="University email"
          type="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          style={field}
        />
      </Card>

      {error
        ? <Hint tint={C.red}>{error}</Hint>
        : <Hint>Your code was given to you by the research team.</Hint>}

      <Button onClick={submit}>Continue</Button>
    </Screen>
  );
}

// ─── instructions ─────────────────────────────────────────

export function InstructionsScreen({ onContinue }) {
  return (
    <Screen center>
      <LargeTitle>How to hold your phone</LargeTitle>
      <img
        src={`${import.meta.env.BASE_URL}ins.png`}
        alt="Standing upright, holding the phone in front of you"
        style={{ width: '100%', maxWidth: 300, alignSelf: 'center', borderRadius: R.card, objectFit: 'contain' }}
      />
      <p style={{ ...T.body, color: C.secondary, margin: 0 }}>
        Stand upright and hold the phone in front of you, as if taking a photo of
        what is ahead. You will see the objects through the camera.
      </p>
      <div style={{ flex: '0 0 8px' }} />
      <Button onClick={onContinue}>Continue</Button>
    </Screen>
  );
}

// ─── permissions ──────────────────────────────────────────

export function PermissionsScreen({ onContinue, onRequestPermission }) {
  const [status, setStatus] = useState('pending');
  const [message, setMessage] = useState('');
  const secure = typeof window !== 'undefined' && window.isSecureContext;

  const enable = async () => {
    if (!secure) {
      setStatus('denied');
      setMessage('This page is not on https, so the compass cannot be used. Open the https link and try again.');
      return;
    }
    if (await onRequestPermission()) {
      setStatus('granted');
      setTimeout(onContinue, 400);
    } else {
      setStatus('denied');
      setMessage('Permission was not granted. If no dialog appeared, allow Motion & Orientation Access in Settings › Safari, then tap again.');
    }
  };

  return (
    <Screen center grouped>
      <LargeTitle subtitle="The trials need to know which way you are facing.">
        Allow access
      </LargeTitle>

      <Card>
        <Permission
          icon="compass" title="Compass and motion"
          body="Detects the direction you are facing. The trials cannot run without it."
        />
        <Permission
          icon="training" title="Camera"
          body="Shows the objects in the room in front of you." last
        />
      </Card>

      {status === 'granted' && <Hint tint={C.green}>Allowed. One moment…</Hint>}
      {status === 'denied' && <Hint tint={C.red}>{message}</Hint>}

      <Button onClick={enable}>Allow compass access</Button>
      <Hint>iOS requires you to tap this yourself.</Hint>
    </Screen>
  );
}

function Permission({ icon, title, body, last = false }) {
  return (
    <div style={{
      display: 'flex', gap: 14, padding: `14px ${SP.gutter}px`,
      borderBottom: last ? 'none' : `0.5px solid ${C.separator}`,
    }}>
      <div style={{ color: C.accent, marginTop: 1 }}><Glyph name={icon} size={22} /></div>
      <div>
        <p style={{ ...T.body, color: C.label, margin: 0 }}>{title}</p>
        <p style={{ ...T.footnote, color: C.secondary, margin: '2px 0 0' }}>{body}</p>
      </div>
    </div>
  );
}

// ─── between blocks ───────────────────────────────────────

export function RestScreen({ onContinue }) {
  return (
    <Screen center>
      <LargeTitle>Take a break</LargeTitle>
      <img
        src={`${import.meta.env.BASE_URL}rest.png`}
        alt="Looking around"
        style={{ width: '100%', maxWidth: 260, alignSelf: 'center', borderRadius: R.card, objectFit: 'contain' }}
      />
      <p style={{ ...T.body, color: C.secondary, margin: 0 }}>
        Look around and take in the space you are standing in. Continue when you
        are ready.
      </p>
      <div style={{ flex: '0 0 8px' }} />
      <Button onClick={onContinue}>Continue</Button>
    </Screen>
  );
}

export function TimeoutScreen() {
  return (
    <Screen center>
      <div style={{ alignSelf: 'center' }}><Droplet mood="sad" size={96} /></div>
      <h2 style={{ ...T.title2, textAlign: 'center', margin: 0 }}>Time&rsquo;s up</h2>
      <Hint>You have 15 seconds to answer each trial.</Hint>
    </Screen>
  );
}

// ─── results ──────────────────────────────────────────────

export function ResultsScreen({ correctCount, totalTrials, streak, avgTime, points, onBackToHome }) {
  return (
    <Screen center grouped>
      <div style={{ alignSelf: 'center' }}>
        <Droplet mood={correctCount >= 10 ? 'excited' : 'happy'} size={92} />
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ ...T.largeTitle, fontSize: 56, color: C.label, fontVariantNumeric: 'tabular-nums' }}>
          {correctCount}<span style={{ color: C.tertiary }}>/{totalTrials}</span>
        </div>
        <p style={{ ...T.body, color: C.secondary, margin: '2px 0 0' }}>correct this session</p>
      </div>

      {points != null && (
        <p style={{ ...T.title3, color: C.green, textAlign: 'center', margin: 0 }}>+{points} points</p>
      )}

      <Card style={{ display: 'flex' }}>
        <Metric value={avgTime ? `${(avgTime / 1000).toFixed(1)}s` : '—'} label="Average time" />
        <div style={{ width: '0.5px', background: C.separator }} />
        <Metric value={streak} label="Day streak" />
      </Card>

      <div style={{ flex: '0 0 8px' }} />
      <Button onClick={onBackToHome}>Done</Button>
    </Screen>
  );
}

// ─── tabs ─────────────────────────────────────────────────

// Module scope, so the offer is made once per app launch rather than on every
// return to this tab.
let remindersOffered = false;

export function TrainingTab({ onStartSession, sessionsToday, participantCode, trainingHistory, onProfile, target = 4 }) {
  const [view, setView] = useState('today');

  // Reaching the home screen is the first moment when a sheet cannot cover
  // something the participant is in the middle of. <ReminderSetup /> decides
  // whether there is anything worth asking.
  useEffect(() => {
    if (remindersOffered) return;
    remindersOffered = true;
    window.dispatchEvent(new Event('nla:offer-reminders'));
  }, []);

  return (
    <Screen grouped>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <LargeTitle subtitle={participantCode ? `Participant ${participantCode}` : undefined}>
          Training
        </LargeTitle>
        <Avatar size={40} onClick={onProfile} />
      </div>

      <Segmented
        value={view}
        onChange={setView}
        options={[{ id: 'today', label: 'Today' }, { id: 'history', label: 'History' }]}
      />

      {view === 'today' ? (
        <>
          <Card style={{ padding: SP.gutter }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <span style={{ ...T.body, color: C.label }}>Sessions today</span>
              <span style={{ ...T.headline, color: C.label, fontVariantNumeric: 'tabular-nums' }}>
                {sessionsToday} <span style={{ color: C.tertiary, fontWeight: 400 }}>of {target}</span>
              </span>
            </div>
            <Progress value={(sessionsToday / target) * 100} />
          </Card>

          <Button onClick={onStartSession}>Start a session</Button>
          <Hint>Twelve trials, about five minutes. Stand where you can turn around.</Hint>
        </>
      ) : trainingHistory.length === 0 ? (
        <Hint>No sessions yet.</Hint>
      ) : (
        <>
          <SectionLabel>Past sessions</SectionLabel>
          <Card>
            {trainingHistory.map((s, i) => (
              <Row
                key={`${s.date}-${i}`}
                label={s.date}
                value={`${s.correct}/12 · ${s.avgTime ? `${(s.avgTime / 1000).toFixed(1)}s` : '—'}`}
                last={i === trainingHistory.length - 1}
              />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

export function TestingTab({ onStartTest }) {
  return (
    <Screen center grouped>
      <LargeTitle subtitle="Same format as training: twelve trials across six directions, without feedback.">
        Weekly test
      </LargeTitle>
      <div style={{ flex: '0 0 8px' }} />
      <Button onClick={onStartTest}>Start the test</Button>
    </Screen>
  );
}

export function ProfileTab({
  participantCode, versionLabel, totalSessions, totalCorrect, totalPoints, streak,
  onSwitchVersion, onRemindersSetup,
}) {
  // Earned off recorded rows, never invented: 10 points a correct answer, 50 a
  // completed session, and thresholds on counts the participant actually reached.
  const badges = [
    { label: '3-day streak', earned: streak >= 3 },
    { label: 'Week warrior', earned: streak >= 7 },
    { label: '10 sessions', earned: totalSessions >= 10 },
    { label: '100 correct', earned: totalCorrect >= 100 },
  ].filter((b) => b.earned);
  return (
    <Screen grouped>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '4px 0 8px' }}>
        <Avatar size={84} />
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ ...T.title2, margin: 0 }}>{participantCode || 'Profile'}</h1>
          <p style={{ ...T.subhead, color: C.secondary, margin: '2px 0 0' }}>{versionLabel}</p>
        </div>
      </div>

      <SectionLabel>Your training</SectionLabel>
      <Card>
        <Row label="Points" value={totalPoints ?? 0} />
        <Row label="Day streak" value={streak} />
        <Row label="Sessions completed" value={totalSessions} />
        <Row label="Correct answers" value={totalCorrect} last />
      </Card>

      {badges.length > 0 && (
        <>
          <SectionLabel>Earned</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: `0 ${SP.gutter}px` }}>
            {badges.map((b) => (
              <span key={b.label} style={{
                ...T.footnote, fontWeight: 600, color: C.accent,
                background: 'rgba(0,122,255,0.12)', borderRadius: R.pill, padding: '6px 12px',
              }}>{b.label}</span>
            ))}
          </div>
        </>
      )}

      <SectionLabel>Settings</SectionLabel>
      <Card>
        <Row label="Reminders" onClick={onRemindersSetup} />
        <Row label="Experiment version" value={versionLabel?.split(' ')[0]} onClick={onSwitchVersion} last />
      </Card>
    </Screen>
  );
}

// ─── overlays ─────────────────────────────────────────────

export function VersionSheet({ onSelect, onClose }) {
  return (
    <Sheet onClose={onClose}>
      <h3 style={{ ...T.title3, margin: '0 0 2px' }}>Experiment version</h3>
      <p style={{ ...T.footnote, color: C.secondary, margin: '0 0 18px' }}>
        Switching reloads the app. Recorded sessions are not affected.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button variant="tinted" onClick={() => onSelect('ego')}>Egocentric</Button>
        <Button variant="tinted" onClick={() => onSelect('allo')}>Allocentric</Button>
        <Button variant="plain" onClick={onClose}>Cancel</Button>
      </div>
    </Sheet>
  );
}

export function PauseAlert({ onResume, onQuit }) {
  return (
    <Alert
      title="Paused"
      message="Your progress so far is saved."
      actions={[
        { label: 'Resume', onClick: onResume },
        { label: 'End session', onClick: onQuit, destructive: true },
      ]}
    />
  );
}
