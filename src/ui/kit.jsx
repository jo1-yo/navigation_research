import { C, T, R, SP, SAFE, FONT } from './theme.js';

/**
 * The shared UI kit. Both experiment versions render through these, so a change
 * to how the app looks happens once rather than twice — the two 1000-line version
 * files used to carry their own identical copy of every screen.
 *
 * Everything here is deliberately plain: system font, one accent, hairline rules,
 * no shadows, no gradients, no emoji. iOS gets its polish from restraint and from
 * hitting the standard metrics (44pt targets, 16pt gutters, 17pt body), not from
 * decoration.
 */

// ─── icons ────────────────────────────────────────────────

/**
 * Inline SVG glyphs in place of the emoji the app used to use. Emoji render
 * differently on every platform, cannot take the accent colour, and are the single
 * loudest "unfinished" signal in a UI.
 */
export function Glyph({ name, size = 24, color = 'currentColor', strokeWidth = 1.7 }) {
  const paths = {
    // Tab bar
    training: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.5" /></>,
    testing: <><path d="M5 7.5h9M5 12h9M5 16.5h6" /><path d="M17.5 15.5l2 2 3-4" /></>,
    profile: <><circle cx="12" cy="8" r="3.6" /><path d="M5 19.5c1.2-3.4 3.8-5 7-5s5.8 1.6 7 5" /></>,
    // Actions and states
    chevron: <path d="M9 5l7 7-7 7" />,
    close: <path d="M6 6l12 12M18 6L6 18" />,
    check: <path d="M4.5 12.5l5 5 10-11" />,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3.5 2" /></>,
    pause: <><path d="M9.5 6v12M14.5 6v12" /></>,
    play: <path d="M8 5.5l10 6.5-10 6.5z" />,
    share: <><path d="M12 15.5V4.5M8.5 8L12 4.5 15.5 8" /><path d="M6 12.5v6a1.5 1.5 0 001.5 1.5h9a1.5 1.5 0 001.5-1.5v-6" /></>,
    plusSquare: <><rect x="4.5" y="4.5" width="15" height="15" rx="3.5" /><path d="M12 9v6M9 12h6" /></>,
    bell: <><path d="M12 4.5a5.5 5.5 0 00-5.5 5.5c0 4-1.5 5.5-1.5 5.5h14s-1.5-1.5-1.5-5.5A5.5 5.5 0 0012 4.5z" /><path d="M10 18.5a2 2 0 004 0" /></>,
    compass: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5l2.2 6.3-2.2-1.3-2.2 1.3z" /></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  };
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}
    >
      {paths[name] ?? null}
    </svg>
  );
}

// ─── layout ───────────────────────────────────────────────

/**
 * A screen. Owns the safe-area insets, which is the whole reason the installed app
 * used to sit too high: with a translucent status bar the web view fills the
 * display, so content has to be pushed back down by the inset itself.
 *
 * `center` vertically centres the content — the right default for the short,
 * single-purpose screens (sign in, instructions, results) that make up most of
 * this app and used to hug the top of the display.
 */
export function Screen({ children, center = false, grouped = false, pad = true, scroll = true, top = true }) {
  return (
    <div
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: center ? 'center' : 'flex-start',
        gap: SP.gap,
        padding: pad ? `${SP.gutter}px ${SP.gutter}px 24px` : 0,
        paddingTop: top ? `calc(${SAFE.top} + ${pad ? SP.gutter : 0}px)` : undefined,
        paddingBottom: `calc(${SAFE.bottom} + 24px)`,
        overflowY: scroll ? 'auto' : 'hidden',
        WebkitOverflowScrolling: 'touch',
        background: grouped ? C.grouped : C.bg,
        color: C.label,
        fontFamily: FONT,
      }}
    >
      {children}
    </div>
  );
}

/** iOS navigation bar: 44pt tall, centred title, hairline rule, optional slots. */
export function NavBar({ title, left, right, border = true }) {
  return (
    <div
      style={{
        flexShrink: 0,
        paddingTop: SAFE.top,
        background: C.bg,
        borderBottom: border ? `0.5px solid ${C.separator}` : 'none',
      }}
    >
      <div style={{ height: SP.tap, display: 'flex', alignItems: 'center', padding: `0 ${SP.gutter - 8}px`, position: 'relative' }}>
        <div style={{ width: 64, display: 'flex', justifyContent: 'flex-start' }}>{left}</div>
        <div style={{ flex: 1, textAlign: 'center', ...T.headline, color: C.label }}>{title}</div>
        <div style={{ width: 64, display: 'flex', justifyContent: 'flex-end' }}>{right}</div>
      </div>
    </div>
  );
}

/** The big left-aligned page title iOS uses at the top of a scroll view. */
export function LargeTitle({ children, subtitle }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h1 style={{ ...T.largeTitle, color: C.label, margin: 0 }}>{children}</h1>
      {subtitle && <p style={{ ...T.subhead, color: C.secondary, margin: '4px 0 0' }}>{subtitle}</p>}
    </div>
  );
}

export function TabBar({ active, onChange, tabs }) {
  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        borderTop: `0.5px solid ${C.separator}`,
        background: 'rgba(255,255,255,0.94)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        paddingBottom: SAFE.bottom,
      }}
    >
      {tabs.map((tab) => {
        const on = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              flex: 1, border: 'none', background: 'none', cursor: 'pointer',
              padding: '7px 0 4px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 3, color: on ? C.accent : C.secondary,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Glyph name={tab.icon} size={26} strokeWidth={on ? 2 : 1.6} />
            <span style={{ fontSize: 10, fontWeight: on ? 600 : 500, letterSpacing: '0.01em' }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── controls ─────────────────────────────────────────────

/**
 * variant: 'filled' (the one primary action) | 'tinted' | 'plain' | 'destructive'
 */
export function Button({ children, onClick, variant = 'filled', disabled = false, full = true, style }) {
  const base = {
    width: full ? '100%' : undefined,
    minHeight: 50,
    padding: '14px 20px',
    borderRadius: R.control,
    ...T.headline,
    border: 'none',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.35 : 1,
    fontFamily: FONT,
    WebkitTapHighlightColor: 'transparent',
    transition: 'opacity 0.15s ease',
    ...style,
  };
  const variants = {
    filled: { background: C.accent, color: C.inverse },
    tinted: { background: 'rgba(0,122,255,0.12)', color: C.accent },
    plain: { background: 'transparent', color: C.accent },
    destructive: { background: 'transparent', color: C.red },
  };
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{ ...base, ...variants[variant] }}>
      {children}
    </button>
  );
}

/** A round 44pt icon button, for nav bars. */
export function IconButton({ name, onClick, label, color = C.accent, size = 22 }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: SP.tap, height: SP.tap, border: 'none', background: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color, WebkitTapHighlightColor: 'transparent', padding: 0,
      }}
    >
      <Glyph name={name} size={size} strokeWidth={1.9} />
    </button>
  );
}

/** The white block that grouped content sits in on a grey background. */
export function Card({ children, style }) {
  return (
    <div style={{ background: C.card, borderRadius: R.card, overflow: 'hidden', ...style }}>
      {children}
    </div>
  );
}

/** One row of a grouped list, with the hairline that stops short of the left edge. */
export function Row({ label, value, onClick, last = false, accessory }) {
  const inner = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: SP.tap, padding: `10px ${SP.gutter}px` }}>
      <span style={{ ...T.body, color: C.label, flex: 1, textAlign: 'left' }}>{label}</span>
      {value != null && <span style={{ ...T.body, color: C.secondary }}>{value}</span>}
      {accessory}
      {onClick && <Glyph name="chevron" size={16} color={C.tertiary} strokeWidth={2.2} />}
    </div>
  );
  return (
    <div style={{ borderBottom: last ? 'none' : `0.5px solid ${C.separator}`, marginLeft: 0 }}>
      {onClick ? (
        <button onClick={onClick} style={{ display: 'block', width: '100%', border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: FONT, WebkitTapHighlightColor: 'transparent' }}>
          {inner}
        </button>
      ) : inner}
    </div>
  );
}

/** Section header above a grouped card — uppercase footnote, Apple's own style. */
export function SectionLabel({ children }) {
  return (
    <p style={{ ...T.footnote, color: C.secondary, textTransform: 'uppercase', letterSpacing: '0.06em', margin: `4px ${SP.gutter}px 6px` }}>
      {children}
    </p>
  );
}

/** A single number with its caption — the whole of what the old stat tiles said. */
export function Metric({ value, label, color = C.label }) {
  return (
    <div style={{ flex: 1, padding: '14px 12px', textAlign: 'center' }}>
      <div style={{ ...T.title2, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ ...T.caption, color: C.secondary, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export function Progress({ value, tint = C.accent, height = 6 }) {
  return (
    <div style={{ height, background: C.fill, borderRadius: R.pill, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', background: tint, borderRadius: R.pill, transition: 'width 0.3s ease' }} />
    </div>
  );
}

/** Segmented control, as used to switch between two views. */
export function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', background: C.fill, borderRadius: 9, padding: 2 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              flex: 1, border: 'none', borderRadius: 7, padding: '7px 10px', cursor: 'pointer',
              background: on ? C.bg : 'transparent',
              boxShadow: on ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
              ...T.footnote, fontWeight: on ? 600 : 400, color: C.label,
              fontFamily: FONT, WebkitTapHighlightColor: 'transparent',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── overlays ─────────────────────────────────────────────

/** Bottom sheet, iOS radius and grabber, dismissed by tapping the scrim. */
export function Sheet({ children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontFamily: FONT,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 500, background: C.bg,
          borderRadius: `${R.sheet}px ${R.sheet}px 0 0`,
          padding: `10px ${SP.gutter + 4}px calc(${SAFE.bottom} + 20px)`,
          maxHeight: '88dvh', overflowY: 'auto',
        }}
      >
        <div style={{ width: 36, height: 5, borderRadius: R.pill, background: C.fillStrong, margin: '0 auto 18px' }} />
        {children}
      </div>
    </div>
  );
}

/** Centred alert, the shape iOS uses for a confirmation. */
export function Alert({ title, message, actions }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: FONT,
    }}>
      <div style={{
        width: '100%', maxWidth: 280, background: 'rgba(255,255,255,0.96)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 14, overflow: 'hidden', textAlign: 'center',
      }}>
        <div style={{ padding: '20px 16px 16px' }}>
          <h3 style={{ ...T.headline, margin: 0, color: C.label }}>{title}</h3>
          {message && <p style={{ ...T.footnote, color: C.label, margin: '4px 0 0' }}>{message}</p>}
        </div>
        {actions.map((a, i) => (
          <button
            key={a.label}
            onClick={a.onClick}
            style={{
              display: 'block', width: '100%', minHeight: SP.tap, border: 'none',
              borderTop: `0.5px solid ${C.separator}`, background: 'transparent',
              ...T.body, fontWeight: i === 0 ? 600 : 400,
              color: a.destructive ? C.red : C.accent, cursor: 'pointer', fontFamily: FONT,
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A short explanatory line under a control. */
export function Hint({ children, tint = C.secondary }) {
  return <p style={{ ...T.footnote, color: tint, margin: 0, textAlign: 'center' }}>{children}</p>;
}
