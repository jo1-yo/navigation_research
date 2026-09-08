import { useEffect, useId, useState } from 'react';
import { AVATAR_COLORS, DEFAULT_AVATAR, readProfile, subscribeProfile } from '../lib/profile.js';

/**
 * The droplet mascot, redrawn.
 *
 * The first version was unreadable at the sizes it is actually used at: its face
 * was made of text glyphs (◠ ‿ ✦) which turn to mush below about 60px, its
 * three-stop cyan-to-orange gradient did not read as water, and it sat inside an
 * orange circle that gave it no contrast at all. This one is built from real
 * vector shapes, carries a two-stop gradient in the participant's chosen colour,
 * and drops the face automatically when it is too small to hold one — so the
 * 40px avatar reads as a clean droplet rather than a smudge.
 */

const FACE_MIN_SIZE = 44;

export function Droplet({ mood = 'happy', size = 120, color, shadow = true, face }) {
  const id = useId();
  const profile = useProfileValue();
  const [light, deep] = AVATAR_COLORS[color || profile.avatar] || AVATAR_COLORS[DEFAULT_AVATAR];
  const showFace = face ?? size >= FACE_MIN_SIZE;

  // Eyes and mouth per mood, as geometry rather than characters.
  const faces = {
    happy: { eye: 'dot', mouth: 'M42 79 Q50 86 58 79' },
    excited: { eye: 'arc', mouth: 'M41 77 Q50 88 59 77' },
    sad: { eye: 'dot', mouth: 'M42 84 Q50 77 58 84' },
    thinking: { eye: 'dot', mouth: 'M43 82 L57 82' },
  };
  const f = faces[mood] || faces.happy;

  return (
    <svg
      viewBox="0 0 100 116" width={size} height={size * 1.16}
      style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="18%" y1="8%" x2="86%" y2="96%">
          <stop offset="0%" stopColor={light} />
          <stop offset="100%" stopColor={deep} />
        </linearGradient>
        <radialGradient id={`${id}-s`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.18)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>

      {shadow && <ellipse cx="50" cy="106" rx="26" ry="6" fill={`url(#${id}-s)`} />}

      {/* A real teardrop: a point at the top opening into a round bulb. */}
      <path
        d="M50 6 C50 6 21 45 21 67 C21 85.5 34 98 50 98 C66 98 79 85.5 79 67 C79 45 50 6 50 6 Z"
        fill={`url(#${id}-g)`}
      />
      {/* Specular highlight — what makes it read as liquid rather than a blob. */}
      <ellipse cx="37" cy="60" rx="6.5" ry="11" fill="rgba(255,255,255,0.45)" transform="rotate(-16 37 60)" />
      <ellipse cx="60" cy="82" rx="4" ry="6" fill="rgba(255,255,255,0.18)" />

      {showFace && (
        <g fill="rgba(255,255,255,0.95)" stroke="rgba(255,255,255,0.95)">
          {f.eye === 'dot' ? (
            <>
              <circle cx="41" cy="68" r="4.2" strokeWidth="0" />
              <circle cx="59" cy="68" r="4.2" strokeWidth="0" />
            </>
          ) : (
            <>
              <path d="M37 69 Q41 63 45 69" fill="none" strokeWidth="3" strokeLinecap="round" />
              <path d="M55 69 Q59 63 63 69" fill="none" strokeWidth="3.4" strokeLinecap="round" />
            </>
          )}
          <path d={f.mouth} fill="none" strokeWidth="3.4" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

/**
 * The participant's avatar: the droplet on a soft tint of its own colour, so the
 * droplet actually stands out against it. `size` is the circle's diameter.
 */
export function Avatar({ size = 80, mood = 'happy', color, onClick, label = 'Profile' }) {
  const profile = useProfileValue();
  const key = color || profile.avatar;
  const [light, deep] = AVATAR_COLORS[key] || AVATAR_COLORS[DEFAULT_AVATAR];

  const style = {
    width: size, height: size, borderRadius: '50%',
    background: `linear-gradient(160deg, ${light}2E, ${deep}1F)`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', padding: 0, flexShrink: 0,
    cursor: onClick ? 'pointer' : 'default',
    WebkitTapHighlightColor: 'transparent',
  };
  const inner = <Droplet mood={mood} size={size * 0.6} color={key} shadow={false} face={size >= 64} />;
  return onClick
    ? <button onClick={onClick} aria-label={label} style={style}>{inner}</button>
    : <div style={style}>{inner}</div>;
}

/** Re-render when the participant changes their colour. */
function useProfileValue() {
  const [profile, setProfile] = useState(readProfile);
  useEffect(() => subscribeProfile(setProfile), []);
  return profile;
}
