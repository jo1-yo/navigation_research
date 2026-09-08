import { useEffect, useRef, useState } from 'react';
import { C, T, R, SP, SAFE, FONT } from './theme.js';
import { NavBar, IconButton, Button, Glyph, Hint, Screen } from './kit.jsx';
import ARStage from '../ARStage.jsx';
import { feedbackCorrect, feedbackWrong } from '../haptics.js';

/**
 * The two screens that actually run the experiment, shared by both versions.
 *
 * They used to exist twice, differing only in the question sentence, one accent
 * colour and a stray `!== null` — which meant every timing fix had to be made in
 * two places and one of them was eventually going to be missed. What genuinely
 * differs between the conditions is the question text and the answer key, so those
 * arrive as props and everything else lives here once.
 */

const TRIAL_SECONDS = 15;

// ─── orientation ──────────────────────────────────────────

/**
 * The pre-block alignment step: turn the body until the two needles coincide.
 *
 * `showFacing` displays the live compass label. It is off by default on purpose.
 * The egocentric version used to show it and the allocentric one deliberately did
 * not — in the allocentric condition the label is close to the answer itself, so
 * showing it in only one condition made the two differ in the information
 * available to the participant. Pass it if you want the old egocentric behaviour.
 */
export function OrientationScreen({
  targetDirection, deviceHeading, onCalibrated, onPause, isPaused,
  showDirection = false, showFacing = false,
}) {
  const [simulatedHeading, setSimulatedHeading] = useState(0);

  const usingRealCompass = deviceHeading !== null;
  const heading = usingRealCompass ? deviceHeading : simulatedHeading;

  const diff = ((targetDirection - heading) % 360 + 360) % 360;
  const signed = diff > 180 ? diff - 360 : diff; // > 0 → turn right
  const aligned = Math.abs(signed) < 15;

  // Desktop runs in simulation mode; the arrow keys stand in for turning around.
  useEffect(() => {
    if (usingRealCompass || isPaused) return;
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setSimulatedHeading((h) => (h + 15) % 360);
      else if (e.key === 'ArrowLeft') setSimulatedHeading((h) => (h - 15 + 360) % 360);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [usingRealCompass, isPaused]);

  return (
    <>
      <NavBar
        title="Orientation"
        right={<IconButton name="pause" onClick={onPause} label="Pause" />}
      />
      <Screen top={false}>
        <p style={{ ...T.subhead, color: C.secondary, margin: 0, textAlign: 'center' }}>
          Hold the phone upright in front of you and turn your body until the dark
          arrow lines up with the green one.
        </p>

        <ARStage
          variant="orient"
          deviceHeading={heading}
          anchorBearing={targetDirection}
          aligned={aligned}
        />

        <p style={{
          ...T.title3, textAlign: 'center', margin: 0,
          color: aligned ? C.green : C.label, fontVariantNumeric: 'tabular-nums',
        }}>
          {aligned
            ? 'Facing the right direction'
            : signed > 0
              ? `Turn right ${Math.round(Math.abs(signed))}°`
              : `Turn left ${Math.round(Math.abs(signed))}°`}
        </p>

        {showDirection && <Hint>Face {labelFor(targetDirection)}</Hint>}
        {showFacing && <Hint>Currently facing {labelFor(heading)} · {Math.round(heading)}°</Hint>}

        {!usingRealCompass && (
          <>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <Button variant="tinted" full={false} onClick={() => setSimulatedHeading((h) => (h - 15 + 360) % 360)} style={{ minWidth: 88 }}>←</Button>
              <Button variant="tinted" full={false} onClick={() => setSimulatedHeading((h) => (h + 15) % 360)} style={{ minWidth: 88 }}>→</Button>
            </div>
            <Hint>Simulation mode — no compass on this device.</Hint>
          </>
        )}

        <div style={{ flex: 1, minHeight: 8 }} />
        <Button onClick={onCalibrated} disabled={!aligned}>Continue</Button>
      </Screen>
    </>
  );
}

const DIRECTIONS = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
function labelFor(deg) {
  return DIRECTIONS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

// ─── trial ────────────────────────────────────────────────

export function TrialScreen({
  trialNumber, totalTrials, shapeConfig, question, onResponse, isTimeout,
  onPause, isPaused, showFeedback = false, deviceHeading = null, anchorBearing = null,
}) {
  const [selected, setSelected] = useState(null);
  const [timeLeft, setTimeLeft] = useState(TRIAL_SECONDS);
  const [feedbackShown, setFeedbackShown] = useState(false);

  // Deliberation clock. performance.now() is monotonic — Date.now() can jump
  // (NTP sync, DST, a manual clock change) and silently corrupt a reaction time.
  // It is started by the per-trial effect below rather than during render, so the
  // first trial is timed from the same moment as every later one (the old code
  // started trial 1 at render and the rest after paint — a small inconsistency
  // that landed entirely in trial 1's reaction time).
  const startedAt = useRef(0);
  const pausedMs = useRef(0);
  const pauseStartedAt = useRef(null);
  const timer = useRef(null);

  // Shuffled by the same effect, for the same reason: no randomness during render.
  const [shuffled, setShuffled] = useState([]);

  useEffect(() => {
    setSelected(null);
    setFeedbackShown(false);
    setTimeLeft(TRIAL_SECONDS);
    startedAt.current = performance.now();
    pausedMs.current = 0;
    pauseStartedAt.current = null;
    setShuffled([...(shapeConfig?.options ?? [])].sort(() => Math.random() - 0.5));
  }, [trialNumber, shapeConfig]);

  // Time spent paused is not deliberation: bank each paused span and subtract it.
  useEffect(() => {
    if (isPaused) {
      if (pauseStartedAt.current === null) pauseStartedAt.current = performance.now();
    } else if (pauseStartedAt.current !== null) {
      pausedMs.current += performance.now() - pauseStartedAt.current;
      pauseStartedAt.current = null;
    }
  }, [isPaused]);

  // One interval at a time, and the updater stays pure: StrictMode double-invokes
  // updaters in dev, so a side effect inside one fires twice and double-inserts
  // the timeout trial. The timeout is reported from the effect below instead.
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (isPaused || feedbackShown || selected !== null || timeLeft <= 0) return;
    timer.current = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  }, [trialNumber, isPaused, feedbackShown, selected, timeLeft]);

  const timeoutFired = useRef(false);
  useEffect(() => { timeoutFired.current = false; }, [trialNumber, shapeConfig]);
  useEffect(() => {
    if (timeLeft === 0 && selected === null && !feedbackShown && !timeoutFired.current) {
      timeoutFired.current = true;
      onResponse(null, TRIAL_SECONDS * 1000);
    }
  }, [timeLeft, selected, feedbackShown, onResponse]);

  const choose = (option) => {
    if (feedbackShown || selected !== null || isPaused) return;
    if (timer.current) clearInterval(timer.current);
    // Milliseconds from the question appearing to this tap, paused spans removed.
    // Reading the clock is the whole point here, and this body runs on a tap and
    // never during render — which the purity rule cannot tell from a handler.
    // eslint-disable-next-line react-hooks/purity
    const reactionTime = Math.round(performance.now() - startedAt.current - pausedMs.current);
    const correct = option === shapeConfig.correctAnswer;
    if (showFeedback) (correct ? feedbackCorrect : feedbackWrong)();
    setSelected(option);
    setFeedbackShown(true);
    setTimeout(() => onResponse(option, reactionTime), showFeedback ? 3000 : 300);
  };

  if (isTimeout) {
    return (
      <>
        <NavBar title={`Trial ${trialNumber}`} right={<IconButton name="pause" onClick={onPause} label="Pause" />} />
        <Screen center top={false}>
          <div style={{ alignSelf: 'center', color: C.secondary }}><Glyph name="clock" size={56} strokeWidth={1.4} /></div>
          <h2 style={{ ...T.title2, textAlign: 'center', margin: 0 }}>Time&rsquo;s up</h2>
          <Hint>You have {TRIAL_SECONDS} seconds to answer each trial.</Hint>
        </Screen>
      </>
    );
  }

  const optionStyle = (option) => {
    const base = {
      minHeight: 52, padding: '14px 12px', borderRadius: R.control, ...T.headline,
      // Frosted white over the camera: legible on any scene without hiding it.
      background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      color: C.label, border: 'none', fontFamily: FONT,
      cursor: feedbackShown || selected !== null || isPaused ? 'default' : 'pointer',
      WebkitTapHighlightColor: 'transparent',
      transition: 'background 0.15s ease, color 0.15s ease',
    };
    if (showFeedback && feedbackShown && selected) {
      if (option === shapeConfig.correctAnswer) return { ...base, background: C.green, color: C.inverse };
      if (option === selected) return { ...base, background: C.red, color: C.inverse };
    }
    return base;
  };

  const urgent = timeLeft <= 3;

  return (
    <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0, overflow: 'hidden', background: '#000', fontFamily: FONT }}>
      {/* The camera view is the screen; the chrome floats over it, so nothing
          steals height from the objects. */}
      <ARStage
        fill
        layout={shapeConfig?.layout}
        squareFirst={shapeConfig?.squareFirst}
        deviceHeading={deviceHeading}
        anchorBearing={anchorBearing}
      />

      {/* Top: counter, pause, countdown. The scrim never takes a tap; the button
          opts back in. */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'none',
        padding: `calc(${SAFE.top} + 6px) ${SP.gutter}px 22px`,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0) 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: SP.tap }}>
          <span style={{ ...T.footnote, color: C.onDark, fontVariantNumeric: 'tabular-nums' }}>
            Trial {trialNumber} of {totalTrials}
          </span>
          <div style={{ pointerEvents: 'auto', margin: -10 }}>
            <IconButton name={isPaused ? 'play' : 'pause'} onClick={onPause} label="Pause" color={C.onDark} size={20} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.28)', borderRadius: R.pill, overflow: 'hidden' }}>
            <div style={{
              width: `${(timeLeft / TRIAL_SECONDS) * 100}%`, height: '100%',
              background: urgent ? C.red : C.onDark, borderRadius: R.pill, transition: 'width 1s linear',
            }} />
          </div>
          <span style={{
            ...T.footnote, color: urgent ? C.red : C.onDarkSecondary,
            fontVariantNumeric: 'tabular-nums', minWidth: 22, textAlign: 'right',
          }}>{timeLeft}</span>
        </div>
      </div>

      {/* Bottom: the question and the four answers. Its height sets how far down
          the objects may sit — see FILL_LOOK_Y in ARStage. */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: `32px ${SP.gutter - 4}px calc(${SAFE.bottom} + 14px)`,
        background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 26%, rgba(0,0,0,0.78) 100%)',
      }}>
        <p style={{ ...T.headline, color: C.onDark, margin: `0 4px 12px` }}>{question}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {shuffled.map((option) => (
            <button key={option} onClick={() => choose(option)} disabled={feedbackShown || selected !== null || isPaused} style={optionStyle(option)}>
              {option}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
