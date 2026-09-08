import { useId } from 'react';

/**
 * The droplet mascot — the app's own character, kept exactly as it was drawn.
 *
 * The path, gradient, highlight and the four expressions are unchanged from the
 * original; only two things are different. The gradient now gets a unique id per
 * instance (two droplets on one screen shared one id before, which is invalid SVG
 * and can make one of them render with the other's fill), and the drop shadow
 * ellipse is optional so the mascot can sit inside the avatar circle cleanly.
 */
export function Droplet({ mood = 'happy', size = 120, shadow = true }) {
  const gradientId = useId();

  const expressions = {
    happy: { eyes: '◠', mouth: '‿', sparkle: true },
    sad: { eyes: '•', mouth: '︵', sparkle: false },
    excited: { eyes: '✦', mouth: '▽', sparkle: true },
    thinking: { eyes: '•', mouth: '~', sparkle: false },
  };
  const expr = expressions[mood] || expressions.happy;

  return (
    <svg viewBox="0 0 100 130" width={size} height={size * 1.3} style={{ display: 'block', flexShrink: 0 }}>
      {shadow && <ellipse cx="50" cy="125" rx="35" ry="5" fill="rgba(0,0,0,0.1)" />}
      <path
        d="M50 5 C50 5 85 50 85 80 C85 105 70 115 50 115 C30 115 15 105 15 80 C15 50 50 5 50 5Z"
        fill={`url(#${gradientId})`} stroke="#E67E22" strokeWidth="2"
      />
      <ellipse cx="35" cy="55" rx="8" ry="12" fill="rgba(255,255,255,0.5)" />
      <text x="35" y="78" fontSize="16" textAnchor="middle" fill="#E67E22">{expr.eyes}</text>
      <text x="65" y="78" fontSize="16" textAnchor="middle" fill="#E67E22">{expr.eyes}</text>
      <text x="50" y="95" fontSize="14" textAnchor="middle" fill="#E67E22">{expr.mouth}</text>
      {expr.sparkle && <text x="75" y="45" fontSize="14" fill="#FFD700">✦</text>}
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7DD8F7" />
          <stop offset="50%" stopColor="#F39C12" />
          <stop offset="100%" stopColor="#E67E22" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * The participant's avatar: the mascot in the app's gradient circle, as it was on
 * the old profile screen. `size` is the circle's diameter.
 */
export function Avatar({ size = 80, mood = 'happy', onClick, label = 'Profile' }) {
  const style = {
    width: size, height: size, borderRadius: '50%',
    background: 'linear-gradient(135deg, #F39C12, #E67E22)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', padding: 0, flexShrink: 0, overflow: 'hidden',
    cursor: onClick ? 'pointer' : 'default',
    WebkitTapHighlightColor: 'transparent',
  };
  // The droplet is taller than it is wide, so it is inset a little to sit centred
  // in the circle rather than poking out of the top and bottom.
  const inner = <Droplet mood={mood} size={size * 0.56} shadow={false} />;
  return onClick
    ? <button onClick={onClick} aria-label={label} style={style}>{inner}</button>
    : <div style={style}>{inner}</div>;
}
