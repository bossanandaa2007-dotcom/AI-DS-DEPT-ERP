import { useId } from 'react'

/**
 * Flat 2D mascot for the login welcome sequence — a cute white robot with a dark visor, glowing
 * eyes and chest panel, modelled on the reference art but drawn as clean vector shapes (no 3D, no
 * photoreal detail). Pure SVG + CSS, transforms/opacity only, and **no SVG filters** — glows are
 * faked with soft radial gradients so nothing repaints per frame.
 *
 * `center` — the opening pose: floats, right arm raised out to the side, hand waving.
 * `peek`   — both arms rest at the sides; used when it tucks into the top-left of the hero title.
 *
 * Motion lives in CSS classes (globals.css `robot-*`), so `prefers-reduced-motion` flattens it all.
 */
interface WelcomeRobotProps {
  mode: 'center' | 'peek'
  className?: string
  decorative?: boolean
}

/** Cartoon hand — rounded palm, four fingers, a thumb. Wrist at the local origin, fingers up. */
function Hand({ fill }: { fill: string }) {
  return (
    <g>
      <rect x="-11" y="-16" width="22" height="20" rx="8" fill={fill} />
      <rect x="-10.5" y="-25" width="6" height="13" rx="3" fill={fill} />
      <rect x="-3.5" y="-28" width="6" height="16" rx="3" fill={fill} />
      <rect x="3.5" y="-26" width="6" height="14" rx="3" fill={fill} />
      <rect x="9.5" y="-23" width="5.5" height="11" rx="2.75" fill={fill} />
      <ellipse cx="-12.5" cy="-3" rx="5.5" ry="7.5" fill={fill} transform="rotate(-28 -12.5 -3)" />
    </g>
  )
}

export function WelcomeRobot({ mode, className = '', decorative = false }: WelcomeRobotProps) {
  const raw = useId()
  const uid = raw.replace(/[^a-zA-Z0-9_-]/g, '')
  const shell = `rb-shell-${uid}`
  const visor = `rb-visor-${uid}`
  const chestFill = `rb-chest-${uid}`
  const soft = `rb-soft-${uid}`
  const shellUrl = `url(#${shell})`
  const softUrl = `url(#${soft})`
  const waving = mode === 'center'

  return (
    <svg
      viewBox="0 0 220 232"
      className={`block h-auto ${className}`}
      role={decorative ? 'presentation' : 'img'}
      aria-label={decorative ? undefined : 'Friendly robot waving hello'}
      aria-hidden={decorative || undefined}
    >
      <defs>
        <linearGradient id={shell} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d7e3ee" />
        </linearGradient>
        <linearGradient id={visor} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#173a54" />
          <stop offset="1" stopColor="#050b13" />
        </linearGradient>
        <radialGradient id={chestFill} cx="0.5" cy="0.38" r="0.75">
          <stop offset="0" stopColor="#b9ecff" />
          <stop offset="0.5" stopColor="#3bb4f2" />
          <stop offset="1" stopColor="#1f83d6" />
        </radialGradient>
        <radialGradient id={soft}>
          <stop offset="0" stopColor="#67d2ff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#67d2ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* antennas */}
      <g fill={shellUrl}>
        <path d="M78 40C70 26 62 12 66 2c11 5 19 19 24 36z" />
        <path d="M142 40c8-14 16-28 12-38-11 5-19 19-24 36z" />
      </g>

      {/* floating rig: everything that bobs together */}
      <g className={mode === 'center' ? 'robot-float' : ''}>
        {/* body pod */}
        <path d="M56 132c0-14 24-20 54-20s54 6 54 20c0 42-22 70-54 70s-54-28-54-70z" fill={shellUrl} />
        <ellipse cx="110" cy="128" rx="43" ry="9" fill="#ffffff" opacity="0.4" />
        {/* chest panel with a soft glow */}
        <ellipse cx="110" cy="160" rx="33" ry="29" fill={softUrl} />
        <rect x="90" y="144" width="40" height="32" rx="13" fill={`url(#${chestFill})`} />
        <rect x="95" y="148" width="24" height="8" rx="4" fill="#d7f2ff" opacity="0.6" />

        {/* feet */}
        <ellipse cx="93" cy="205" rx="13" ry="9" fill={shellUrl} />
        <ellipse cx="127" cy="205" rx="13" ry="9" fill={shellUrl} />

        {/* head */}
        <rect x="54" y="30" width="112" height="88" rx="42" fill={shellUrl} />
        <rect x="66" y="36" width="88" height="18" rx="9" fill="#ffffff" opacity="0.5" />
        <rect x="62" y="40" width="96" height="66" rx="31" fill={`url(#${visor})`} />
        <ellipse cx="90" cy="60" rx="20" ry="10" fill="#ffffff" opacity="0.09" />

        {/* eyes — soft glow behind, bright core (only the core blinks) */}
        <ellipse cx="97" cy="72" rx="15" ry="18" fill={softUrl} />
        <ellipse cx="123" cy="72" rx="15" ry="18" fill={softUrl} />
        <g className="robot-eyes">
          <rect x="90" y="63" width="14" height="19" rx="7" fill="#dff4ff" />
          <rect x="116" y="63" width="14" height="19" rx="7" fill="#dff4ff" />
        </g>

        {/* arms — drawn last so neither hand is clipped by the body. Both use the same Hand at the
            same rotation, so the hands are always identical in size. In `peek` both simply hang;
            in `center` the right one is swapped for the raised, waving arm. */}
        <g>
          <path d="M64 130 56 178" stroke={shellUrl} strokeWidth="16" strokeLinecap="round" />
          <g transform="translate(53 186) rotate(190)">
            <Hand fill={shellUrl} />
          </g>
        </g>
        {waving ? (
          <g className="robot-wave-arm robot-wave-arm--waving">
            <path d="M156 130 186 74" stroke={shellUrl} strokeWidth="16" strokeLinecap="round" />
            <g transform="translate(190 68) rotate(8)">
              <Hand fill={shellUrl} />
            </g>
          </g>
        ) : (
          <g>
            <path d="M156 130 164 178" stroke={shellUrl} strokeWidth="16" strokeLinecap="round" />
            <g transform="translate(167 186) rotate(190)">
              <Hand fill={shellUrl} />
            </g>
          </g>
        )}
      </g>
    </svg>
  )
}
