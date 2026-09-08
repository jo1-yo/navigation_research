import { useState, useEffect, useRef, useCallback } from 'react';
import {
  upsertParticipant, createSession, createOrientationBlock, updateOrientationBlock,
  createTrial, completeSession, getParticipantStats,
} from './lib/db.js';
import { APP_VERSION } from './lib/appVersion.js';
import { C, FONT } from './ui/theme.js';
import { TabBar } from './ui/kit.jsx';
import {
  LoginScreen, InstructionsScreen, PermissionsScreen, RestScreen, ResultsScreen,
  TrainingTab, TestingTab, ProfileTab, VersionSheet, PauseAlert,
} from './ui/screens.jsx';
import { OrientationScreen, TrialScreen } from './ui/trial.jsx';

/** The signed-in participant, if this device has one. Persistent sign-in is what
 *  lets a tap on a reminder notification land straight in a session. */
function readSavedParticipant() {
  try {
    const raw = localStorage.getItem('nla_participant_allo');
    const data = raw ? JSON.parse(raw) : null;
    return data?.participantCode ? data : null;
  } catch {
    localStorage.removeItem('nla_participant_allo');
    return null;
  }
}

const TABS = [
  { id: 'training', icon: 'training', label: 'Training' },
  { id: 'testing', icon: 'testing', label: 'Test' },
  { id: 'profile', icon: 'profile', label: 'Profile' },
];

// Compute compass heading from a DeviceOrientationEvent
function computeHeading(e) {
  // iOS Safari provides webkitCompassHeading (0 = North, clockwise)
  if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) {
    return Math.round(((e.webkitCompassHeading % 360) + 360) % 360);
  }
  // Android / other browsers: use alpha (convert to compass heading)
  if (typeof e.alpha === 'number') {
    return Math.round(((360 - e.alpha) % 360 + 360) % 360);
  }
  return null;
}

// Custom hook for device orientation
const useDeviceOrientation = () => {
  const [heading, setHeading] = useState(null);
  const [permission, setPermission] = useState('unknown');

  // Always listen for orientation events (after permission is granted the events fire)
  useEffect(() => {
    const handler = (e) => {
      const h = computeHeading(e);
      if (h !== null) setHeading(h);
    };
    window.addEventListener('deviceorientation', handler, true);
    window.addEventListener('deviceorientationabsolute', handler, true);
    return () => {
      window.removeEventListener('deviceorientation', handler, true);
      window.removeEventListener('deviceorientationabsolute', handler, true);
    };
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setPermission('denied');
      return false;
    }
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const response = await DeviceOrientationEvent.requestPermission();
        setPermission(response);
        return response === 'granted';
      } catch (err) {
        console.warn('[DeviceOrientation] requestPermission failed:', err);
        setPermission('denied');
        return false;
      }
    } else {
      setPermission('granted');
      return true;
    }
  }, []);

  return { heading, permission, requestPermission };
};

// ─── trial configuration ──────────────────────────────────
// Constant, and independent of any component state, so it lives at module
// scope: defining it inside the component made it a new object every render
// and left generateAllTrials's dependency list permanently wrong.

// 8 screen positions → direction label, for each facing direction
// Positions: top, bottom, left, right (cardinal layouts)
//            TL, TR, BL, BR (diagonal layouts)
const CARD_OPTIONS = ['To the north', 'To the east', 'To the south', 'To the west'];
const DIAG_OPTIONS = ['To the northeast', 'To the southeast', 'To the southwest', 'To the northwest'];

// Cardinal facings: top/bottom/left/right → cardinal answers, diag corners → diagonal answers
// Diagonal facings: top/bottom/left/right → diagonal answers, diag corners → cardinal answers
// Example: facing SW(225), top(forward)=SW, right(right hand)=NW, TR(between fwd & right)=W
const dirMap8 = {
  0:   { top:'To the north',     bottom:'To the south',     right:'To the east',      left:'To the west',
         TR:'To the northeast',  BR:'To the southeast',     BL:'To the southwest',    TL:'To the northwest' },
  45:  { top:'To the northeast', bottom:'To the southwest', right:'To the southeast',  left:'To the northwest',
         TR:'To the north',      BR:'To the west',          BL:'To the south',         TL:'To the east' },
  90:  { top:'To the east',      bottom:'To the west',      right:'To the south',      left:'To the north',
         TR:'To the southeast',  BR:'To the southwest',     BL:'To the northwest',     TL:'To the northeast' },
  135: { top:'To the southeast', bottom:'To the northwest', right:'To the southwest',  left:'To the northeast',
         TR:'To the east',       BR:'To the north',         BL:'To the west',          TL:'To the south' },
  180: { top:'To the south',     bottom:'To the north',     right:'To the west',       left:'To the east',
         TR:'To the southwest',  BR:'To the northwest',     BL:'To the northeast',     TL:'To the southeast' },
  225: { top:'To the southwest', bottom:'To the northeast', right:'To the northwest',  left:'To the southeast',
         TR:'To the south',      BR:'To the east',          BL:'To the north',         TL:'To the west' },
  270: { top:'To the west',      bottom:'To the east',      right:'To the north',      left:'To the south',
         TR:'To the northwest',  BR:'To the northeast',     BL:'To the southeast',     TL:'To the southwest' },
  315: { top:'To the northwest', bottom:'To the southeast', right:'To the northeast',  left:'To the southwest',
         TR:'To the west',       BR:'To the south',         BL:'To the east',          TL:'To the north' },
};

// Opposites — same-group constraint
const opposites = {
  'To the north':'To the south', 'To the south':'To the north',
  'To the east':'To the west',   'To the west':'To the east',
  'To the northeast':'To the southwest', 'To the southwest':'To the northeast',
  'To the northwest':'To the southeast', 'To the southeast':'To the northwest',
};

const optionsFor = (answer) => DIAG_OPTIONS.includes(answer) ? DIAG_OPTIONS : CARD_OPTIONS;

// All 8 possible trial configs for a given facing direction
const allConfigsForDir = (dir) => {
  const m = dirMap8[dir] || dirMap8[0];
  return [
    { layout: 'horizontal', squareFirst: true,  correctAnswer: m.right,  options: optionsFor(m.right) },
    { layout: 'horizontal', squareFirst: false, correctAnswer: m.left,   options: optionsFor(m.left) },
    { layout: 'vertical',   squareFirst: true,  correctAnswer: m.bottom, options: optionsFor(m.bottom) },
    { layout: 'vertical',   squareFirst: false, correctAnswer: m.top,    options: optionsFor(m.top) },
    { layout: 'diag-nwse',  squareFirst: true,  correctAnswer: m.BR,     options: optionsFor(m.BR) },
    { layout: 'diag-nwse',  squareFirst: false, correctAnswer: m.TL,     options: optionsFor(m.TL) },
    { layout: 'diag-nesw',  squareFirst: true,  correctAnswer: m.BL,     options: optionsFor(m.BL) },
    { layout: 'diag-nesw',  squareFirst: false, correctAnswer: m.TR,     options: optionsFor(m.TR) },
  ];
};

export default function NavigationLearningAppALLO({ onSwitchVersion }) {
  const [screen, setScreen] = useState(() => (readSavedParticipant() ? 'permissions' : 'login'));
  const [activeTab, setActiveTab] = useState('training');
  const [sessionMode, setSessionMode] = useState('training');
  const [participantData, setParticipantData] = useState(readSavedParticipant);
  const [orientationPhase, setOrientationPhase] = useState(0);
  const [trialPhase, setTrialPhase] = useState(0);
  const [sessionData, setSessionData] = useState({ responses: [], correctCount: 0 });
  const [isTrialTimeout, setIsTrialTimeout] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  
  // Real usage stats, loaded from recorded sessions once the participant is
  // known and refreshed after each completed run. Zeros until then — never mocked.
  const [sessionsToday, setSessionsToday] = useState(0);
  const [streak, setStreak] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [trainingHistory, setTrainingHistory] = useState([]);

  const refreshStats = useCallback(async (participantId) => {
    if (!participantId) return;
    const s = await getParticipantStats(participantId);
    if (!s) return;
    setSessionsToday(s.sessionsToday);
    setStreak(s.streak);
    setTotalPoints(s.totalPoints);
    setTotalSessions(s.totalSessions);
    setTotalCorrect(s.totalCorrect);
    setTrainingHistory(s.trainingHistory);
  }, []);

  const { heading: deviceHeading, requestPermission } = useDeviceOrientation();
  // A real compass, as opposed to desktop simulation mode.
  const isCompassWorking = deviceHeading !== null;

  // Register the restored participant with the backend once, on mount. The
  // participant itself was read during state init above; this effect exists only
  // for the network call and deliberately sets no state.
  useEffect(() => {
    if (!participantData?.participantCode) return;
    upsertParticipant(participantData.participantCode, {
      deviceOs: navigator.userAgent,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).then(p => { if (p) { dbParticipantId.current = p.id; refreshStats(p.id); } });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Supabase IDs (refs so they don't cause re-renders)
  const dbParticipantId = useRef(null);
  const dbSessionId = useRef(null);
  const dbBlockId = useRef(null);
  const blockStartTime = useRef(null);
  
  // 6 orientation phases × 2 trials = 12 total; pick 6 UNIQUE directions
  const [targetDirections] = useState(() => {
    const all = [0, 45, 90, 135, 180, 225, 270, 315];
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all.slice(0, 6);
  });

  // Pre-generate all 12 trials (6 blocks × 2) at session start
  // Each block: pick 2 random configs, no opposite answers, no same layout
  const generateAllTrials = useCallback((directions) => {
    return directions.map(dir => {
      const pool = allConfigsForDir(dir);
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      const first = shuffled[0];
      const second = shuffled.find(c =>
        c.layout !== first.layout &&
        c.correctAnswer !== opposites[first.correctAnswer]
      ) || shuffled[1];
      return Math.random() > 0.5 ? [first, second] : [second, first];
    });
  }, []);

  const [allTrialBlocks, setAllTrialBlocks] = useState(() => generateAllTrials(targetDirections));
  const currentShapeConfig = allTrialBlocks[orientationPhase]?.[trialPhase] || allTrialBlocks[0][0];

  const totalTrials = 12;
  const currentTrialNumber = orientationPhase * 2 + trialPhase + 1;
  
  const handlePause = () => {
    setIsPaused(true);
    setShowPauseModal(true);
  };
  
  const handleResume = () => {
    setIsPaused(false);
    setShowPauseModal(false);
  };
  
  const handleQuitToHome = () => {
    setIsPaused(false);
    setShowPauseModal(false);
    setScreen('dashboard');
    setActiveTab(sessionMode);
  };
  
  const startSession = (mode) => {
    setSessionMode(mode);
    setOrientationPhase(0);
    setTrialPhase(0);
    setSessionData({ responses: [], correctCount: 0 });
    setAllTrialBlocks(generateAllTrials(targetDirections));
    setIsTrialTimeout(false);
    setIsPaused(false);
    setScreen('orientation');
    if (dbParticipantId.current) {
      createSession({ participantId: dbParticipantId.current, version: 'allo', sessionType: mode })
        .then(s => { if (s) dbSessionId.current = s.id; });
    }
  };

  const handleStartSession = () => startSession('training');
  const handleStartTest = () => startSession('testing');
  
  const handleOrientationCalibrated = () => {
    setScreen('trial');
    blockStartTime.current = Date.now();
    if (dbSessionId.current) {
      createOrientationBlock({
        sessionId: dbSessionId.current,
        blockOrder: orientationPhase,
        targetDirection: targetDirections[orientationPhase],
      }).then(b => {
        if (b) {
          dbBlockId.current = b.id;
          updateOrientationBlock(b.id, {
            finalFacingDirection: deviceHeading,
            orientationErrorDeg: deviceHeading !== null
              ? Math.abs(((targetDirections[orientationPhase] - deviceHeading + 540) % 360) - 180)
              : null,
          });
        }
      });
    }
  };
  
  const handleRestDone = () => { setScreen('orientation'); };

  const advanceTrialOrOrientation = useCallback(() => {
    if (trialPhase < 1) {
      setTrialPhase(prev => prev + 1);
    } else if (orientationPhase < 5) {
      const nextPhase = orientationPhase + 1;
      setOrientationPhase(nextPhase);
      setTrialPhase(0);
      // Show rest screen after every 2 phases (after phase 1→2 and phase 3→4)
      if (nextPhase === 2 || nextPhase === 4) {
        setScreen('rest');
      } else {
        setScreen('orientation');
      }
    } else {
      // Calculate avg time
      const times = sessionData.responses.map(r => r.reactionTime).filter(t => t < 15000);
      const avgTime = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
      
      // Update stats
      setTotalPoints(prev => prev + sessionData.correctCount * 10 + 50);
      setTotalSessions(prev => prev + 1);
      setTotalCorrect(prev => prev + sessionData.correctCount);
      setSessionsToday(prev => prev + 1);
      setTrainingHistory(prev => [{
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        correct: sessionData.correctCount,
        avgTime
      }, ...prev]);
      
      setScreen('results');
    }
  }, [trialPhase, orientationPhase, sessionData]);

  // Upload session summary when results screen is shown (sessionData is guaranteed
  // final), then re-pull stats so home/profile show recorded truth, not the
  // optimistic in-memory increments.
  useEffect(() => {
    if (screen === 'results' && dbSessionId.current) {
      const validTimes = sessionData.responses.map(r => r.reactionTime).filter(t => t < 15000);
      completeSession(dbSessionId.current, {
        totalCorrect: sessionData.correctCount,
        totalTrials: 12,
        avgReactionTimeMs: validTimes.length > 0 ? Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length) : 0,
      }).then(() => refreshStats(dbParticipantId.current));
    }
  }, [screen, sessionData]); // eslint-disable-line react-hooks/exhaustive-deps
  
  const handleTrialResponse = useCallback((response, reactionTime) => {
    const isTimeout = response === null;
    const isCorrect = isTimeout ? false : response === currentShapeConfig.correctAnswer;

    // Upload trial to Supabase (fire-and-forget)
    if (dbBlockId.current) {
      createTrial({
        blockId: dbBlockId.current,
        trialIndex: trialPhase,
        layout: currentShapeConfig.layout,
        squareFirst: currentShapeConfig.squareFirst,
        correctAnswer: currentShapeConfig.correctAnswer,
        participantResponse: response,
        accuracy: isCorrect,
        reactionTimeMs: reactionTime,
        timeout: isTimeout,
        optionsShown: currentShapeConfig.options,
        appVersion: APP_VERSION,
      });
    }

    if (isTimeout) {
      setIsTrialTimeout(true);
      setTimeout(() => {
        setIsTrialTimeout(false);
        advanceTrialOrOrientation();
      }, 2500);
      return;
    }
    
    setSessionData(prev => ({
      responses: [...prev.responses, { response, correctAnswer: currentShapeConfig.correctAnswer, isCorrect, reactionTime }],
      correctCount: prev.correctCount + (isCorrect ? 1 : 0)
    }));
    
    setTimeout(() => advanceTrialOrOrientation(), 100);
  }, [currentShapeConfig, advanceTrialOrOrientation, trialPhase]);
  
  const avgTime = sessionData.responses.length > 0 
    ? Math.round(sessionData.responses.filter(r => r.reactionTime < 15000).reduce((a, b) => a + b.reactionTime, 0) / sessionData.responses.filter(r => r.reactionTime < 15000).length)
    : 0;
  
  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      background: C.bg, color: C.label, fontFamily: FONT,
      WebkitFontSmoothing: 'antialiased',
    }}>
      {screen === 'login' && (
        <LoginScreen
          versionLabel="Allocentric"
          onLogin={(data) => {
            localStorage.setItem('nla_participant_allo', JSON.stringify(data));
            setParticipantData(data);
            setScreen('instructions');
            upsertParticipant(data.participantCode, {
              deviceOs: navigator.userAgent,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }).then(p => { if (p) { dbParticipantId.current = p.id; refreshStats(p.id); } });
          }}
        />
      )}

      {screen === 'instructions' && <InstructionsScreen onContinue={() => setScreen('permissions')} />}

      {screen === 'permissions' && (
        <PermissionsScreen onContinue={() => setScreen('dashboard')} onRequestPermission={requestPermission} />
      )}

      {screen === 'dashboard' && (
        <>
          {activeTab === 'training' && (
            <TrainingTab
              onStartSession={handleStartSession}
              sessionsToday={sessionsToday}
              participantCode={participantData?.participantCode}
              trainingHistory={trainingHistory}
              onProfile={() => setActiveTab('profile')}
            />
          )}
          {activeTab === 'testing' && <TestingTab onStartTest={handleStartTest} />}
          {activeTab === 'profile' && (
            <ProfileTab
              participantCode={participantData?.participantCode}
              versionLabel="Allocentric"
              totalSessions={totalSessions}
              totalCorrect={totalCorrect}
              totalPoints={totalPoints}
              streak={streak}
              onSwitchVersion={() => setShowVersionModal(true)}
              onRemindersSetup={() => window.dispatchEvent(new Event('nla:open-reminders'))}
            />
          )}
          <TabBar active={activeTab} onChange={setActiveTab} tabs={TABS} />
        </>
      )}

      {screen === 'rest' && <RestScreen onContinue={handleRestDone} />}

      {screen === 'orientation' && (
        <OrientationScreen
          targetDirection={targetDirections[orientationPhase]}
          deviceHeading={deviceHeading}
          onCalibrated={handleOrientationCalibrated}
          onPause={handlePause}
          isPaused={isPaused}
        />
      )}

      {screen === 'trial' && (
        <TrialScreen
          key={`${orientationPhase}-${trialPhase}`}
          trialNumber={currentTrialNumber}
          totalTrials={totalTrials}
          shapeConfig={currentShapeConfig}
          question="Compared to the square, the circle is ______"
          onResponse={handleTrialResponse}
          isTimeout={isTrialTimeout}
          onPause={handlePause}
          isPaused={isPaused}
          showFeedback={sessionMode === 'training'}
          deviceHeading={isCompassWorking ? deviceHeading : null}
          anchorBearing={targetDirections[orientationPhase]}
        />
      )}

      {screen === 'results' && (
        <ResultsScreen
          correctCount={sessionData.correctCount}
          totalTrials={totalTrials}
          streak={streak}
          avgTime={avgTime}
          points={sessionData.correctCount * 10 + 50}
          onBackToHome={handleQuitToHome}
        />
      )}

      {showPauseModal && <PauseAlert onResume={handleResume} onQuit={handleQuitToHome} />}
      {showVersionModal && (
        <VersionSheet
          onSelect={(v) => { setShowVersionModal(false); if (onSwitchVersion) onSwitchVersion(v); }}
          onClose={() => setShowVersionModal(false)}
        />
      )}
    </div>
  );
}
