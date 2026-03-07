import React, { useState, useEffect, useRef, useCallback } from 'react';
import { feedbackCorrect, feedbackWrong } from './haptics.js';
import { upsertParticipant, createSession, createOrientationBlock, updateOrientationBlock, createTrial, completeSession } from './lib/db.js';

const playCorrectFeedback = feedbackCorrect;
const playIncorrectFeedback = feedbackWrong;

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
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const response = await DeviceOrientationEvent.requestPermission();
        setPermission(response);
        return response === 'granted';
      } catch (err) {
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

// Droplet mascot
const Droplet = ({ mood = 'happy', size = 120 }) => {
  const expressions = {
    happy: { eyes: '◠', mouth: '‿', sparkle: true },
    sad: { eyes: '•', mouth: '︵', sparkle: false },
    excited: { eyes: '✦', mouth: '▽', sparkle: true },
    thinking: { eyes: '•', mouth: '~', sparkle: false }
  };
  const expr = expressions[mood] || expressions.happy;
  
  return (
    <svg viewBox="0 0 100 130" width={size} height={size * 1.3}>
      <ellipse cx="50" cy="125" rx="35" ry="5" fill="rgba(0,0,0,0.1)" />
      <path d="M50 5 C50 5 85 50 85 80 C85 105 70 115 50 115 C30 115 15 105 15 80 C15 50 50 5 50 5Z" 
        fill="url(#dropletGradient)" stroke="#3BB5E8" strokeWidth="2" />
      <ellipse cx="35" cy="55" rx="8" ry="12" fill="rgba(255,255,255,0.5)" />
      <text x="35" y="78" fontSize="16" textAnchor="middle" fill="#1a1a2e">{expr.eyes}</text>
      <text x="65" y="78" fontSize="16" textAnchor="middle" fill="#1a1a2e">{expr.eyes}</text>
      <text x="50" y="95" fontSize="14" textAnchor="middle" fill="#1a1a2e">{expr.mouth}</text>
      {expr.sparkle && <text x="75" y="45" fontSize="14" fill="#FFD700">✦</text>}
      <defs>
        <linearGradient id="dropletGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7DD8F7" />
          <stop offset="50%" stopColor="#4FC3F7" />
          <stop offset="100%" stopColor="#29B6F6" />
        </linearGradient>
      </defs>
    </svg>
  );
};

// Navigation bar with pause button
const NavBar = ({ showPause = false, onPause, isPaused = false }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    borderBottom: '1px solid #eee'
  }}>
    <button style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>☰</button>
    <span style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '18px' }}>NLA</span>
    {showPause ? (
      <button 
        onClick={onPause}
        style={{
          background: isPaused ? '#4CAF50' : '#ff9800',
          border: 'none',
          borderRadius: '50%',
          width: 32,
          height: 32,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          color: 'white'
        }}
      >{isPaused ? '▶' : '⏸'}</button>
    ) : (
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #4FC3F7, #29B6F6)' }} />
    )}
  </div>
);

// Bottom navigation - Updated icons
const BottomNav = ({ activeTab = 'training', onTabChange }) => {
  const tabs = [
    { id: 'training', icon: '🏋️', label: 'Training' },
    { id: 'testing', icon: '📝', label: 'Testing' },
    { id: 'ranking', icon: '🏆', label: 'Ranking' },
    { id: 'profile', icon: '👤', label: 'Profile' }
  ];
  
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'center',
      padding: '8px 10px',
      borderTop: '1px solid #eee',
      background: 'white'
    }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '20px',
            opacity: activeTab === tab.id ? 1 : 0.4,
            cursor: 'pointer',
            padding: '4px 8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2
          }}
        >
          <span>{tab.icon}</span>
          <span style={{ fontSize: '10px', color: activeTab === tab.id ? '#1a1a2e' : '#888' }}>{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

// Pause Modal
const PauseModal = ({ onResume, onQuit }) => (
  <div style={{
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200
  }}>
    <div style={{
      background: 'white',
      borderRadius: '20px',
      padding: '32px',
      textAlign: 'center',
      width: '80%',
      maxWidth: 300
    }}>
      <h2 style={{ marginBottom: 8 }}>⏸ Paused</h2>
      <p style={{ color: '#666', marginBottom: 24, fontSize: '14px' }}>Take a break! Your progress is saved.</p>
      
      <button
        onClick={onResume}
        style={{
          width: '100%',
          padding: '14px',
          background: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: 500,
          cursor: 'pointer',
          marginBottom: 12
        }}
      >▶ Resume Training</button>
      
      <button
        onClick={onQuit}
        style={{
          width: '100%',
          padding: '14px',
          background: 'white',
          color: '#f44336',
          border: '2px solid #f44336',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: 500,
          cursor: 'pointer'
        }}
      >🏠 Back to Home</button>
    </div>
  </div>
);

// Login Screen
const LoginScreen = ({ onLogin }) => {
  const [participantCode, setParticipantCode] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  
  const handleSubmit = () => {
    if (!participantCode.trim()) { setError('Please enter your participant code'); return; }
    if (!email.trim() || !email.includes('@') || !email.includes('.edu')) {
      setError('Please enter a valid school email (.edu)'); return;
    }
    onLogin({ participantCode, email });
  };
  
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '60px 30px', minHeight: '100%',
      background: 'linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)'
    }}>
      <div style={{ marginBottom: 40 }}><Droplet mood="excited" size={80} /></div>
      
      <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', fontWeight: 600, marginBottom: 8 }}>
        Navigation Learning
      </h1>
      <p style={{ color: '#666', fontSize: '14px', marginBottom: 8 }}>ALLO Training Version</p>
      <p style={{ color: '#888', fontSize: '12px', marginBottom: 40 }}>Allocentric (Cardinal Directions)</p>
      
      <div style={{ width: '100%', maxWidth: 300 }}>
        <label style={{ fontSize: '14px', fontWeight: 500, marginBottom: 6, display: 'block' }}>Participant Code</label>
        <input
          type="text" placeholder="Enter your unique code" value={participantCode}
          onChange={e => setParticipantCode(e.target.value.toUpperCase())}
          style={{
            width: '100%', padding: '14px 16px', border: '1px solid #ddd', borderRadius: '8px',
            fontSize: '16px', marginBottom: 16, boxSizing: 'border-box',
            textTransform: 'uppercase', letterSpacing: '2px'
          }}
        />
        
        <label style={{ fontSize: '14px', fontWeight: 500, marginBottom: 6, display: 'block' }}>School Email</label>
        <input
          type="email" placeholder="yourname@university.edu" value={email}
          onChange={e => setEmail(e.target.value)}
          style={{
            width: '100%', padding: '14px 16px', border: '1px solid #ddd', borderRadius: '8px',
            fontSize: '16px', marginBottom: 8, boxSizing: 'border-box'
          }}
        />
        
        {error && <p style={{ color: '#f44336', fontSize: '13px', marginTop: 8 }}>{error}</p>}
        
        <button onClick={handleSubmit} style={{
          width: '100%', padding: '14px', background: '#1a1a2e', color: 'white',
          border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 500,
          cursor: 'pointer', marginTop: 16
        }}>Continue</button>
      </div>
    </div>
  );
};

// Instructions Screen
const InstructionsScreen = ({ onContinue }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '40px 24px', minHeight: '100%', overflowY: 'auto'
  }}>
    <h1 style={{ fontSize: '22px', fontWeight: 600, marginBottom: 24 }}>Instructions</h1>
    <img
      src="/ins.png"
      alt="How to hold your phone"
      style={{ width: '80%', maxWidth: 280, borderRadius: '12px', marginBottom: 24, objectFit: 'contain' }}
    />
    <p style={{ fontSize: '15px', lineHeight: 1.7, color: '#333', textAlign: 'center', marginBottom: 32, maxWidth: 320 }}>
      Please stand upright and hold your phone flat and level, as shown in the image, with the screen parallel to the ground.
    </p>
    <button onClick={onContinue} style={{
      width: '100%', maxWidth: 300, padding: '16px', background: '#1a1a2e', color: 'white',
      border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 500, cursor: 'pointer'
    }}>Got it, Continue</button>
  </div>
);

// Permissions Screen
const PermissionsScreen = ({ onContinue, onRequestPermission }) => {
  const [permissionStatus, setPermissionStatus] = useState('pending');
  const [errorMsg, setErrorMsg] = useState('');

  const handleEnable = async () => {
    const success = await onRequestPermission();
    if (success) {
      setPermissionStatus('granted');
      setTimeout(() => onContinue(), 500);
    } else {
      setPermissionStatus('denied');
      setErrorMsg('Permission denied. Please enable motion sensors in your device settings.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '40px 30px', minHeight: '100%' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: 24 }}>Enable Permissions</h1>
      
      <div style={{ 
        background: '#fff3cd', border: '1px solid #ffc107', 
        borderRadius: '12px', padding: '16px', marginBottom: 24 
      }}>
        <p style={{ fontSize: '14px', color: '#856404', marginBottom: 8 }}>
          <strong>Important for iOS users:</strong>
        </p>
        <p style={{ fontSize: '13px', color: '#856404' }}>
          You must tap the "Enable" button below to grant compass access. This cannot be done automatically.
        </p>
      </div>
      
      {[
        { icon: '🧭', title: 'Device Orientation (Required)', desc: 'To detect which direction you\'re facing' },
        { icon: '📍', title: 'Location Services', desc: 'To determine absolute directions' },
        { icon: '🔔', title: 'Notifications', desc: 'To receive training reminders' }
      ].map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: '20px' }}>{item.icon}</span>
          <div>
            <p style={{ fontWeight: 500, marginBottom: 4 }}>{item.title}</p>
            <p style={{ fontSize: '13px', color: '#666' }}>{item.desc}</p>
          </div>
        </div>
      ))}
      
      {permissionStatus === 'granted' && (
        <div style={{ background: '#d4edda', border: '1px solid #28a745', borderRadius: '8px', padding: '12px', marginTop: 16 }}>
          <p style={{ color: '#155724', fontSize: '14px' }}>Permissions granted! Redirecting...</p>
        </div>
      )}
      
      {permissionStatus === 'denied' && (
        <div style={{ background: '#f8d7da', border: '1px solid #dc3545', borderRadius: '8px', padding: '12px', marginTop: 16 }}>
          <p style={{ color: '#721c24', fontSize: '14px' }}>{errorMsg}</p>
        </div>
      )}
      
      <div style={{ flex: 1 }} />
      
      <button onClick={handleEnable} style={{
        width: '100%', padding: '16px', background: '#1a1a2e', color: 'white',
        border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 500, cursor: 'pointer'
      }}>Enable Compass Access</button>
      
      <p style={{ textAlign: 'center', fontSize: '12px', color: '#888', marginTop: 12 }}>
        Tap the button above to enable device orientation
      </p>
    </div>
  );
};

// Training Tab (Dashboard)
const TrainingTab = ({ onStartSession, sessionsToday, participantCode, trainingHistory }) => {
  const [showHistory, setShowHistory] = useState(false);
  const progress = (sessionsToday / 4) * 100;
  
  return (
    <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
      <p style={{ fontSize: '12px', color: '#888', marginBottom: 16 }}>Participant: {participantCode}</p>
      
      {/* Tabs */}
      <div style={{ display: 'flex', background: '#f5f5f5', borderRadius: '25px', padding: '4px', marginBottom: 24 }}>
        <button onClick={() => setShowHistory(false)} style={{
          flex: 1, padding: '10px 16px', border: 'none', borderRadius: '20px',
          background: !showHistory ? '#1a1a2e' : 'transparent',
          color: !showHistory ? 'white' : '#666', fontSize: '13px', fontWeight: 500, cursor: 'pointer'
        }}>Today's Session</button>
        <button onClick={() => setShowHistory(true)} style={{
          flex: 1, padding: '10px 16px', border: 'none', borderRadius: '20px',
          background: showHistory ? '#1a1a2e' : 'transparent',
          color: showHistory ? 'white' : '#666', fontSize: '13px', fontWeight: 500, cursor: 'pointer'
        }}>Training History</button>
      </div>
      
      {!showHistory ? (
        <>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: 8 }}>{sessionsToday} / 4 completed today</p>
          <div style={{ width: '100%', height: 8, background: '#e0e0e0', borderRadius: 4, marginBottom: 32 }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #4FC3F7, #29B6F6)', borderRadius: 4 }} />
          </div>
          
          <button onClick={onStartSession} style={{
            padding: '16px 32px', background: 'white', border: '2px solid #1a1a2e',
            borderRadius: '8px', fontSize: '16px', fontWeight: 500, cursor: 'pointer'
          }}>Start New Session</button>
          
          <p style={{ fontSize: '12px', color: '#888', marginTop: 16 }}>Mode: Allocentric (Cardinal Directions)</p>
        </>
      ) : (
        <div>
          <h3 style={{ fontSize: '16px', marginBottom: 16 }}>Past Training Sessions</h3>
          {trainingHistory.length === 0 ? (
            <p style={{ color: '#888', fontSize: '14px' }}>No training history yet. Complete your first session!</p>
          ) : (
            trainingHistory.map((session, i) => (
              <div key={i} style={{
                background: '#f8f9fa', borderRadius: '12px', padding: '16px', marginBottom: 12
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 500 }}>{session.date}</span>
                  <span style={{ color: '#4CAF50', fontWeight: 600 }}>{session.correct}/12 correct</span>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: '13px', color: '#666' }}>
                  <span>⏱ Avg: {session.avgTime}ms</span>
                  <span>📊 Accuracy: {Math.round(session.correct / 12 * 100)}%</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// Testing Tab
const TestingTab = ({ onStartTest }) => (
  <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
    <span style={{ fontSize: '60px', marginBottom: 20 }}>📝</span>
    <h2 style={{ marginBottom: 8 }}>Weekly Test</h2>
    <p style={{ color: '#666', textAlign: 'center', marginBottom: 24, fontSize: '14px' }}>
      Test your navigation skills. Same format as training — 12 trials across 6 directions.
    </p>
    <button onClick={onStartTest} style={{
      padding: '14px 28px', background: '#1a1a2e', color: 'white',
      border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer'
    }}>Start Test</button>
    <p style={{ fontSize: '12px', color: '#888', marginTop: 16 }}>Mode: Allocentric (Cardinal Directions)</p>
  </div>
);

// Ranking Tab
const RankingTab = ({ currentStreak }) => {
  const leaderboard = [
    { name: 'Alex M.', days: 45, points: 4520 },
    { name: 'Sarah K.', days: 42, points: 4180 },
    { name: 'You', days: currentStreak, points: currentStreak * 100 + 50, isYou: true },
    { name: 'Mike R.', days: 38, points: 3750 },
    { name: 'Emma L.', days: 35, points: 3420 },
    { name: 'Chris P.', days: 32, points: 3100 },
    { name: 'Lisa T.', days: 28, points: 2780 },
    { name: 'David W.', days: 25, points: 2450 },
  ].sort((a, b) => b.days - a.days);
  
  return (
    <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
      <h2 style={{ marginBottom: 4 }}>🏆 Leaderboard</h2>
      <p style={{ color: '#888', fontSize: '13px', marginBottom: 20 }}>Ranked by consecutive training days</p>
      
      {leaderboard.map((user, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', marginBottom: 8,
          background: user.isYou ? 'linear-gradient(135deg, #E3F2FD, #BBDEFB)' : '#f8f9fa',
          borderRadius: '12px',
          border: user.isYou ? '2px solid #2196F3' : 'none'
        }}>
          <span style={{
            width: 28, height: 28, borderRadius: '50%',
            background: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#e0e0e0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', fontWeight: 600
          }}>{i + 1}</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: user.isYou ? 600 : 500, color: user.isYou ? '#1976D2' : '#333' }}>
              {user.name} {user.isYou && '⭐'}
            </p>
            <p style={{ fontSize: '12px', color: '#888' }}>{user.points} points</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontWeight: 600, color: '#4CAF50' }}>{user.days} days</p>
            <p style={{ fontSize: '11px', color: '#888' }}>streak</p>
          </div>
        </div>
      ))}
    </div>
  );
};

// Profile Tab
const ProfileTab = ({ participantCode, totalPoints, currentStreak, totalSessions, totalCorrect }) => (
  <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
    <div style={{ textAlign: 'center', marginBottom: 32 }}>
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: 'linear-gradient(135deg, #4FC3F7, #29B6F6)',
        margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <Droplet mood="happy" size={50} />
      </div>
      <h2 style={{ marginBottom: 4 }}>{participantCode}</h2>
      <p style={{ color: '#888', fontSize: '14px' }}>ALLO Training</p>
    </div>
    
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
      {[
        { label: 'Current Streak', value: `${currentStreak} days`, icon: '🔥', color: '#FF5722' },
        { label: 'Total Points', value: totalPoints, icon: '⭐', color: '#FFC107' },
        { label: 'Sessions Done', value: totalSessions, icon: '📊', color: '#2196F3' },
        { label: 'Total Correct', value: totalCorrect, icon: '✅', color: '#4CAF50' }
      ].map((stat, i) => (
        <div key={i} style={{
          background: '#f8f9fa', borderRadius: '12px', padding: '16px', textAlign: 'center'
        }}>
          <span style={{ fontSize: '24px' }}>{stat.icon}</span>
          <p style={{ fontSize: '20px', fontWeight: 700, color: stat.color, marginTop: 8 }}>{stat.value}</p>
          <p style={{ fontSize: '12px', color: '#888', marginTop: 4 }}>{stat.label}</p>
        </div>
      ))}
    </div>
    
    <div style={{ background: '#f8f9fa', borderRadius: '12px', padding: '16px' }}>
      <h3 style={{ fontSize: '14px', marginBottom: 12 }}>Achievements</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {currentStreak >= 3 && <span style={{ background: '#FFE0B2', padding: '6px 12px', borderRadius: '20px', fontSize: '12px' }}>🌟 3-Day Streak</span>}
        {currentStreak >= 7 && <span style={{ background: '#C8E6C9', padding: '6px 12px', borderRadius: '20px', fontSize: '12px' }}>🏅 Week Warrior</span>}
        {totalSessions >= 10 && <span style={{ background: '#BBDEFB', padding: '6px 12px', borderRadius: '20px', fontSize: '12px' }}>💪 10 Sessions</span>}
        {totalCorrect >= 100 && <span style={{ background: '#E1BEE7', padding: '6px 12px', borderRadius: '20px', fontSize: '12px' }}>🎯 100 Correct</span>}
      </div>
    </div>
  </div>
);

// Orientation Screen
const OrientationScreen = ({ targetDirection, deviceHeading, onCalibrated, onPause, isPaused }) => {
  const [simulatedHeading, setSimulatedHeading] = useState(0);
  const currentHeading = deviceHeading !== null ? deviceHeading : simulatedHeading;
  
  const directionLabels = {
    0: 'North', 45: 'Northeast', 90: 'East', 135: 'Southeast',
    180: 'South', 225: 'Southwest', 270: 'West', 315: 'Northwest'
  };
  
  const diff = ((targetDirection - currentHeading) % 360 + 360) % 360;
  const arrowRotation = diff > 180 ? diff - 360 : diff;
  const isAligned = Math.abs(arrowRotation) < 15;
  
  useEffect(() => {
    if (deviceHeading !== null || isPaused) return;
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') setSimulatedHeading(prev => (prev + 15) % 360);
      else if (e.key === 'ArrowLeft') setSimulatedHeading(prev => (prev - 15 + 360) % 360);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deviceHeading, isPaused]);
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <NavBar showPause onPause={onPause} isPaused={isPaused} />
      
      <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: 16 }}>Orientation</h1>
        
        <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#333', marginBottom: 20 }}>
          Place your phone flat on your palm. Face in the direction of the arrow.
        </p>
        
        <div style={{
          textAlign: 'center', marginBottom: 12, padding: '8px 16px',
          background: '#f5f5f5', borderRadius: '8px', fontSize: '14px'
        }}>
          Your heading: <strong>{currentHeading}°</strong>
          {deviceHeading === null && <span style={{ color: '#888' }}> (Use ← → keys or buttons)</span>}
        </div>
        
        {/* Arrow */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 100 100" width="140" height="140"
            style={{ transform: `rotate(${arrowRotation}deg)`, transition: 'transform 0.15s ease-out' }}>
            <circle cx="50" cy="50" r="45" fill="none" stroke="#ddd" strokeWidth="1" strokeDasharray="4,4" />
            <path d="M50 10 L65 45 L55 45 L55 80 L45 80 L45 45 L35 45 Z" fill={isAligned ? '#4CAF50' : '#1a1a2e'} />
            {isAligned && <circle cx="50" cy="50" r="48" fill="none" stroke="#4CAF50" strokeWidth="3" opacity="0.5" />}
          </svg>
          
          <p style={{ fontSize: '14px', color: '#666', marginTop: 12 }}>
            Target: <strong>{directionLabels[targetDirection]}</strong> ({targetDirection}°)
          </p>
        </div>
        
        {/* Rotation controls */}
        {deviceHeading === null && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 16 }}>
            <button onClick={() => setSimulatedHeading(prev => (prev - 15 + 360) % 360)} style={{
              width: 56, height: 56, borderRadius: '50%', border: '2px solid #1a1a2e',
              background: 'white', fontSize: '24px', cursor: 'pointer'
            }}>←</button>
            <button onClick={() => setSimulatedHeading(prev => (prev + 15) % 360)} style={{
              width: 56, height: 56, borderRadius: '50%', border: '2px solid #1a1a2e',
              background: 'white', fontSize: '24px', cursor: 'pointer'
            }}>→</button>
          </div>
        )}
        
        {isAligned && (
          <button onClick={onCalibrated} style={{
            padding: '16px', background: '#4CAF50', color: 'white',
            border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 500, cursor: 'pointer'
          }}>✓ Aligned! Continue</button>
        )}
      </div>
    </div>
  );
};

// Rest Screen — shown after every 2 orientation phases
const RestScreen = ({ onContinue }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '40px 24px', height: '100%', overflowY: 'auto'
  }}>
    <h2 style={{ fontSize: '22px', fontWeight: 600, marginBottom: 20 }}>Take a Break</h2>
    <img
      src="/rest.png"
      alt="Look around"
      style={{ width: '80%', maxWidth: 260, borderRadius: '12px', marginBottom: 20, objectFit: 'contain' }}
    />
    <p style={{ fontSize: '16px', lineHeight: 1.7, color: '#333', textAlign: 'center', marginBottom: 12, maxWidth: 320 }}>
      Please take a moment to look around and observe the environment around you.
    </p>
    <p style={{ fontSize: '14px', color: '#888', textAlign: 'center', marginBottom: 32, maxWidth: 300 }}>
      When you are ready, tap the button below to continue.
    </p>
    <button onClick={onContinue} style={{
      width: '100%', maxWidth: 300, padding: '16px', background: '#1a1a2e', color: 'white',
      border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 500, cursor: 'pointer'
    }}>Continue</button>
  </div>
);

// Trial Screen
const TrialScreen = ({ trialNumber, totalTrials, shapeConfig, onResponse, isTimeout, onPause, isPaused }) => {
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const [localShowFeedback, setLocalShowFeedback] = useState(false);
  const startTimeRef = useRef(Date.now());
  const timerRef = useRef(null);
  
  const [shuffledOptions, setShuffledOptions] = useState(() =>
    [...(shapeConfig?.options || ['To the north', 'To the east', 'To the south', 'To the west'])].sort(() => Math.random() - 0.5)
  );
  
  // Reset state and re-shuffle options when trial changes
  useEffect(() => {
    setSelectedAnswer(null);
    setLocalShowFeedback(false);
    setTimeLeft(15);
    startTimeRef.current = Date.now();
    setShuffledOptions([...(shapeConfig?.options || ['To the north', 'To the east', 'To the south', 'To the west'])].sort(() => Math.random() - 0.5));
  }, [trialNumber, shapeConfig]);

  // Single timer effect — only one interval at a time
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (isPaused || localShowFeedback || selectedAnswer !== null || timeLeft <= 0) return;

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          onResponse(null, 15000);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [trialNumber, isPaused, localShowFeedback, selectedAnswer, timeLeft, onResponse]);
  
  const handleSelect = (option) => {
    if (localShowFeedback || selectedAnswer !== null || isPaused) return;
    if (timerRef.current) clearInterval(timerRef.current);
    
    const reactionTime = Date.now() - startTimeRef.current;
    const isCorrect = option === shapeConfig.correctAnswer;
    if (isCorrect) playCorrectFeedback(); else playIncorrectFeedback();
    setSelectedAnswer(option);
    setLocalShowFeedback(true);
    
    setTimeout(() => onResponse(option, reactionTime), 3000);
  };
  
  const getButtonStyle = (option) => {
    const base = {
      padding: '16px 18px', border: '1px solid #ddd', borderRadius: '8px',
      fontSize: '17px', cursor: (localShowFeedback || selectedAnswer || isPaused) ? 'default' : 'pointer',
      background: 'white', fontWeight: 500, transition: 'all 0.2s ease'
    };
    
    if (localShowFeedback && selectedAnswer) {
      if (option === shapeConfig.correctAnswer) return { ...base, background: '#4CAF50', color: 'white', borderColor: '#4CAF50' };
      if (option === selectedAnswer && option !== shapeConfig.correctAnswer) return { ...base, background: '#f44336', color: 'white', borderColor: '#f44336' };
    }
    return base;
  };
  
  if (isTimeout) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <NavBar showPause onPause={onPause} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <Droplet mood="sad" size={120} />
          <h2 style={{ marginTop: 20 }}>Time's up!</h2>
          <p style={{ color: '#666', marginTop: 8, fontSize: '16px' }}>You have <strong>15 seconds</strong> to respond.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <NavBar showPause onPause={onPause} isPaused={isPaused} />
      
      <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column' }}>
        <p style={{ fontSize: '14px', color: '#888', marginBottom: 12 }}>Trial {trialNumber} of {totalTrials}</p>
        
        <div style={{
          background: '#f8f9fa', borderRadius: '12px', padding: '14px',
          marginBottom: 12, fontSize: '15px', lineHeight: 1.5
        }}>
          Identify the circle's location compared to the square. <strong>15 seconds</strong> to respond.
        </div>
        
        {/* Timer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1, height: 8, background: '#e0e0e0', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              width: `${(timeLeft / 15) * 100}%`, height: '100%',
              background: timeLeft <= 3 ? '#f44336' : timeLeft <= 5 ? '#FF9800' : '#4FC3F7',
              transition: 'width 1s linear'
            }} />
          </div>
          <span style={{ fontSize: '16px', fontWeight: 600, color: timeLeft <= 3 ? '#f44336' : '#666', minWidth: 28 }}>{timeLeft}s</span>
        </div>
        
        {/* Shapes */}
        {shapeConfig?.layout?.startsWith('diag-') ? (
          <div style={{ flex: 1, position: 'relative' }}>
            {/* Square */}
            <div style={{
              width: 80, height: 80, background: '#e0e0e0', borderRadius: 4, border: '2px solid #ccc',
              position: 'absolute',
              ...(shapeConfig.layout === 'diag-nwse'
                ? (shapeConfig.squareFirst ? { top: '10%', left: '15%' } : { bottom: '10%', right: '15%' })
                : (shapeConfig.squareFirst ? { top: '10%', right: '15%' } : { bottom: '10%', left: '15%' })
              )
            }} />
            {/* Circle */}
            <div style={{
              width: 80, height: 80, background: '#e0e0e0', borderRadius: '50%', border: '2px solid #ccc',
              position: 'absolute',
              ...(shapeConfig.layout === 'diag-nwse'
                ? (shapeConfig.squareFirst ? { bottom: '10%', right: '15%' } : { top: '10%', left: '15%' })
                : (shapeConfig.squareFirst ? { bottom: '10%', left: '15%' } : { top: '10%', right: '15%' })
              )
            }} />
          </div>
        ) : (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40,
            flexDirection: shapeConfig?.layout === 'vertical' ? 'column' : 'row'
          }}>
            <div style={{
              width: 80, height: 80, background: '#e0e0e0', borderRadius: 4, border: '2px solid #ccc',
              order: shapeConfig?.squareFirst ? 0 : 1
            }} />
            <div style={{
              width: 80, height: 80, background: '#e0e0e0', borderRadius: '50%', border: '2px solid #ccc',
              order: shapeConfig?.squareFirst ? 1 : 0
            }} />
          </div>
        )}
        
        <p style={{ fontSize: '17px', marginBottom: 14, fontWeight: 500 }}>
          Compared to the square, the circle is ______
        </p>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {shuffledOptions.map(option => (
            <button key={option} onClick={() => handleSelect(option)} disabled={localShowFeedback || selectedAnswer || isPaused}
              style={getButtonStyle(option)}>{option}</button>
          ))}
        </div>
      </div>
    </div>
  );
};

// Results Screen
const ResultsScreen = ({ correctCount, totalTrials, streak, avgTime, onBackToHome }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <NavBar />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <Droplet mood={correctCount >= 10 ? 'excited' : 'happy'} size={120} />
      
      <h2 style={{ marginTop: 20, marginBottom: 8 }}>You got {correctCount}/{totalTrials} correct! 🎉</h2>
      <p style={{ color: '#666' }}>You're on a <strong>{streak}-day streak!</strong></p>
      
      <div style={{ display: 'flex', gap: 16, marginTop: 24 }}>
        <div style={{ background: '#f8f9fa', borderRadius: '12px', padding: '16px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: '24px', fontWeight: 700, color: '#4CAF50' }}>+{correctCount * 10 + 50}</p>
          <p style={{ fontSize: '12px', color: '#888' }}>Points</p>
        </div>
        <div style={{ background: '#f8f9fa', borderRadius: '12px', padding: '16px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: '24px', fontWeight: 700, color: '#2196F3' }}>{avgTime}ms</p>
          <p style={{ fontSize: '12px', color: '#888' }}>Avg Time</p>
        </div>
      </div>
      
      <button onClick={onBackToHome} style={{
        marginTop: 32, padding: '14px 32px', background: '#1a1a2e', color: 'white',
        border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer'
      }}>Back to Home</button>
    </div>
  </div>
);

// Main App
export default function NavigationLearningAppALLO() {
  const [screen, setScreen] = useState('login');
  const [activeTab, setActiveTab] = useState('training');
  const [sessionMode, setSessionMode] = useState('training');
  const [participantData, setParticipantData] = useState(null);
  const [orientationPhase, setOrientationPhase] = useState(0);
  const [trialPhase, setTrialPhase] = useState(0);
  const [sessionData, setSessionData] = useState({ responses: [], correctCount: 0 });
  const [isTrialTimeout, setIsTrialTimeout] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  
  // Stats
  const [sessionsToday, setSessionsToday] = useState(1);
  const [streak, setStreak] = useState(3);
  const [totalPoints, setTotalPoints] = useState(350);
  const [totalSessions, setTotalSessions] = useState(5);
  const [totalCorrect, setTotalCorrect] = useState(48);
  const [trainingHistory, setTrainingHistory] = useState([
    { date: 'Jan 5, 2026', correct: 10, avgTime: 2340 },
    { date: 'Jan 4, 2026', correct: 11, avgTime: 2120 },
    { date: 'Jan 3, 2026', correct: 9, avgTime: 2560 }
  ]);
  
  const { heading: deviceHeading, requestPermission } = useDeviceOrientation();

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

  // Upload session summary when results screen is shown (sessionData is guaranteed final)
  useEffect(() => {
    if (screen === 'results' && dbSessionId.current) {
      const validTimes = sessionData.responses.map(r => r.reactionTime).filter(t => t < 15000);
      completeSession(dbSessionId.current, {
        totalCorrect: sessionData.correctCount,
        totalTrials: 12,
        avgReactionTimeMs: validTimes.length > 0 ? Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length) : 0,
      });
    }
  }, [screen, sessionData]);
  
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
      width: '100%', minHeight: '100dvh', margin: '0 auto',
      background: 'white', overflow: 'hidden',
      fontFamily: '"DM Sans", -apple-system, sans-serif', position: 'relative'
    }}>
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
        {screen === 'login' && <LoginScreen onLogin={(data) => {
          setParticipantData(data);
          setScreen('instructions');
          upsertParticipant(data.participantCode, {
            deviceOs: navigator.userAgent,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }).then(p => { if (p) dbParticipantId.current = p.id; });
        }} />}
        
        {screen === 'instructions' && <InstructionsScreen onContinue={() => setScreen('permissions')} />}
        
        {screen === 'permissions' && (
          <PermissionsScreen onContinue={() => setScreen('dashboard')} onRequestPermission={requestPermission} />
        )}
        
        {screen === 'dashboard' && (
          <>
            <NavBar />
            {activeTab === 'training' && (
              <TrainingTab 
                onStartSession={handleStartSession} 
                sessionsToday={sessionsToday}
                participantCode={participantData?.participantCode}
                trainingHistory={trainingHistory}
              />
            )}
            {activeTab === 'testing' && <TestingTab onStartTest={handleStartTest} />}
            {activeTab === 'ranking' && <RankingTab currentStreak={streak} />}
            {activeTab === 'profile' && (
              <ProfileTab 
                participantCode={participantData?.participantCode}
                totalPoints={totalPoints}
                currentStreak={streak}
                totalSessions={totalSessions}
                totalCorrect={totalCorrect}
              />
            )}
            <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
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
            onResponse={handleTrialResponse}
            isTimeout={isTrialTimeout}
            onPause={handlePause}
            isPaused={isPaused}
          />
        )}
        
        {screen === 'results' && (
          <ResultsScreen
            correctCount={sessionData.correctCount}
            totalTrials={totalTrials}
            streak={streak}
            avgTime={avgTime}
            onBackToHome={handleQuitToHome}
          />
        )}
      </div>
      
      {showPauseModal && <PauseModal onResume={handleResume} onQuit={handleQuitToHome} />}
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@500;600&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body, #root { height: 100%; width: 100%; overflow: hidden; }
        button:active { transform: scale(0.98); }
      `}</style>
    </div>
  );
}
