/**
 * Haptic feedback module for mobile web.
 *
 * - Android Chrome: navigator.vibrate works, even in silent mode.
 * - iOS Safari: Vibration API not supported. Falls back to visual-only.
 * - Respects prefers-reduced-motion and user opt-out.
 */

const CAN_VIBRATE = typeof navigator !== 'undefined' && 'vibrate' in navigator;

// Throttle state
let lastFire = 0;
const THROTTLE_MS = 150;

// User preference (persisted in localStorage)
const STORAGE_KEY = 'haptics_enabled';

export function isHapticsEnabled() {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) return stored === 'true';
  // Respect prefers-reduced-motion
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  return true;
}

export function setHapticsEnabled(enabled) {
  localStorage.setItem(STORAGE_KEY, String(enabled));
}

export function supportsVibration() {
  return CAN_VIBRATE;
}

// Vibration patterns (ms). Single number = vibrate duration. Array = [vibrate, pause, vibrate, ...]
const PATTERNS = {
  selection: [15],
  correct:   [40],
  wrong:     [80, 40, 80],
};

/**
 * Trigger haptic feedback.
 * @param {'selection' | 'correct' | 'wrong'} type
 */
export function haptic(type) {
  if (!isHapticsEnabled()) return false;

  // Throttle
  const now = Date.now();
  if (now - lastFire < THROTTLE_MS) return false;
  lastFire = now;

  if (CAN_VIBRATE) {
    try {
      navigator.vibrate(PATTERNS[type] || PATTERNS.selection);
      return true;
    } catch (e) {
      return false;
    }
  }

  return false; // no vibration available
}

/**
 * Play audio feedback (separate from haptic, works on both platforms).
 * Uses Web Audio API. Works even in iOS silent mode IF media volume > 0.
 */
export function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;

    if (type === 'correct') {
      // Two-note ascending chime: G5 → C6, like a "success arrival" tone
      const notes = [
        { freq: 784, start: 0, dur: 0.15 },     // G5
        { freq: 1047, start: 0.12, dur: 0.25 },  // C6
      ];
      notes.forEach(({ freq, start, dur }) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.35, t + start);
        g.gain.setValueAtTime(0.35, t + start + dur * 0.6);
        g.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(t + start); o.stop(t + start + dur);
      });
    }

    if (type === 'wrong') {
      for (let i = 0; i < 2; i++) {
        const off = i * 0.15;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = 130;
        g.gain.setValueAtTime(0.4, t + off);
        g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.1);
        o.connect(g); g.connect(ctx.destination);
        o.start(t + off); o.stop(t + off + 0.1);
      }
    }

    setTimeout(() => ctx.close(), 500);
  } catch (e) { /* silent */ }
}

/**
 * Combined feedback: haptic + sound. Call on user gesture (click/tap).
 */
export function feedbackCorrect() {
  haptic('correct');
  playSound('correct');
}

export function feedbackWrong() {
  haptic('wrong');
  playSound('wrong');
}

export function feedbackSelection() {
  haptic('selection');
}
