"use client";

import { useEffect, useMemo, useRef } from "react";
import { WHEEL_ORDER, colorOf, WHEEL_INDEX } from "@/lib/roulette/constants";
import { cn } from "@/lib/utils";
import { sfx } from "@/lib/sound/engine";

/**
 * RouletteWheel — purely presentational. The result is decided elsewhere
 * (commit–reveal / contract) and passed in; the animation is choreographed so the
 * ball deterministically lands in that pocket. Nothing here influences the outcome.
 */
const STEP = 360 / 37;
const R_OUT = 200;
const R_TRACK = 176;
const R_POCKET_OUT = 164;
const R_POCKET_IN = 114;
const R_NUMBER = 146;
const R_BALL_REST = 138;

const WHEEL_DURATION = 7600; // ms
const BALL_DURATION = 5600;
const DROP_DURATION = 700;
const WHEEL_TURNS = 4;
const BALL_TURNS = 7;

const easeOutQuart = (x: number) => 1 - Math.pow(1 - x, 4);
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const mod = (a: number, n: number) => ((a % n) + n) % n;
const pocketAngle = (n: number) => WHEEL_INDEX[n] * STEP;

function annulus(r1: number, r2: number, a0: number, a1: number) {
  const toXY = (r: number, a: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    // Round so server and client render byte-identical markup (no hydration diffs).
    return [Math.round((200 + r * Math.cos(rad)) * 100) / 100, Math.round((200 + r * Math.sin(rad)) * 100) / 100];
  };
  const [x0, y0] = toXY(r2, a0);
  const [x1, y1] = toXY(r2, a1);
  const [x2, y2] = toXY(r1, a1);
  const [x3, y3] = toXY(r1, a0);
  return `M${x0},${y0} A${r2},${r2} 0 0 1 ${x1},${y1} L${x2},${y2} A${r1},${r1} 0 0 0 ${x3},${y3} Z`;
}

export interface RouletteWheelProps {
  /** Committed result to land on. Required while `spinning`. */
  result: number | null;
  spinning: boolean;
  onComplete?: () => void;
  /** Last settled result, used to keep the ball resting in its pocket between rounds. */
  restingResult?: number | null;
  className?: string;
  reducedMotion?: boolean;
}

export function RouletteWheel({ result, spinning, onComplete, restingResult = null, className, reducedMotion }: RouletteWheelProps) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const angleRef = useRef(0);
  const raf = useRef(0);
  const ballRestAngleRef = useRef<number | null>(restingResult != null ? pocketAngle(restingResult) : null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const pockets = useMemo(
    () =>
      WHEEL_ORDER.map((n, i) => {
        const a0 = i * STEP - STEP / 2;
        const a1 = i * STEP + STEP / 2;
        const c = colorOf(n);
        return { n, i, d: annulus(R_POCKET_IN, R_POCKET_OUT, a0, a1), fill: c === "red" ? "var(--casino-red)" : c === "green" ? "var(--roulette-green)" : "#121412", angle: i * STEP };
      }),
    [],
  );

  const paint = (wheelAngle: number, ballAngle: number | null, ballR: number) => {
    if (wheelRef.current) wheelRef.current.style.transform = `rotate(${wheelAngle}deg)`;
    if (ballRef.current) {
      if (ballAngle == null) ballRef.current.style.opacity = "0";
      else {
        ballRef.current.style.opacity = "1";
        ballRef.current.style.transform = `translate(-50%, -50%) rotate(${ballAngle}deg) translateY(${(-ballR / R_OUT) * 50}cqw)`;
      }
    }
  };

  // Idle: gentle rotation with the ball resting in the last pocket.
  useEffect(() => {
    if (spinning) return;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = t - last;
      last = t;
      if (!reducedMotion) angleRef.current = mod(angleRef.current + dt * 0.004, 360);
      const rest = ballRestAngleRef.current;
      paint(angleRef.current, rest == null ? null : angleRef.current + rest, R_BALL_REST);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [spinning, reducedMotion]);

  // Spin choreography.
  useEffect(() => {
    if (!spinning || result == null) return;
    cancelAnimationFrame(raf.current);
    const target = pocketAngle(result);
    const start = angleRef.current;
    const wheelTotal = WHEEL_TURNS * 360 + mod(-target - start, 360);
    const wheelAt = (t: number) => start + wheelTotal * easeOutQuart(Math.min(1, t / WHEEL_DURATION));

    const ballStart = mod(start + (ballRestAngleRef.current ?? 0), 360);
    const ballEndAbs = wheelAt(BALL_DURATION) + target;
    const ballTotal = BALL_TURNS * 360 + mod(ballStart - ballEndAbs, 360);
    const ballAt = (t: number) => ballStart - ballTotal * easeOutCubic(Math.min(1, t / BALL_DURATION));

    if (reducedMotion) {
      angleRef.current = mod(start + wheelTotal, 360);
      ballRestAngleRef.current = target;
      paint(angleRef.current, angleRef.current + target, R_BALL_REST);
      const id = setTimeout(() => onCompleteRef.current?.(), 700);
      return () => clearTimeout(id);
    }

    const t0 = performance.now();
    let lastTickPocket = -1;
    let dropped = false;
    let done = false;
    const loop = (now: number) => {
      const t = now - t0;
      const w = wheelAt(t);
      let b: number;
      let r = R_TRACK;
      if (t < BALL_DURATION) {
        b = ballAt(t);
        // ball tick as it passes frets in the final approach
        const rel = mod(b - w, 360);
        const pocket = Math.floor(rel / STEP);
        if (t > BALL_DURATION - 2200 && pocket !== lastTickPocket) {
          lastTickPocket = pocket;
          sfx.tick();
        }
        if (glowRef.current) glowRef.current.style.opacity = String(0.35 + 0.25 * Math.min(1, t / 1500));
      } else {
        const p = Math.min(1, (t - BALL_DURATION) / DROP_DURATION);
        if (!dropped) {
          dropped = true;
          sfx.drop();
        }
        const wobble = (1 - p) * 6 * Math.sin(p * Math.PI * 4);
        b = w + target + wobble;
        r = R_BALL_REST + (R_TRACK - R_BALL_REST) * Math.pow(1 - p, 2) * Math.abs(Math.cos(p * Math.PI * 3));
      }
      paint(w, b, r);
      if (t >= WHEEL_DURATION) {
        if (!done) {
          done = true;
          angleRef.current = mod(w, 360);
          ballRestAngleRef.current = target;
          if (glowRef.current) glowRef.current.style.opacity = "0.35";
          onCompleteRef.current?.();
        }
        return;
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [spinning, result, reducedMotion]);

  useEffect(() => {
    if (!spinning && restingResult != null) ballRestAngleRef.current = pocketAngle(restingResult);
  }, [restingResult, spinning]);

  return (
    <div className={cn("relative aspect-square w-full select-none", className)} style={{ containerType: "inline-size" }} role="img" aria-label={spinning ? "Roulette wheel spinning" : restingResult != null ? `Roulette wheel resting on ${restingResult}` : "Roulette wheel"}>
      {/* ambient glow */}
      <div ref={glowRef} className="pointer-events-none absolute inset-[-12%] rounded-full opacity-35 blur-3xl transition-opacity" style={{ background: "radial-gradient(circle, var(--accent-soft), transparent 60%)" }} aria-hidden />

      <div ref={wheelRef} className="absolute inset-0 will-change-transform" style={{ transformOrigin: "50% 50%" }}>
        <svg viewBox="0 0 400 400" className="h-full w-full drop-shadow-[0_30px_40px_rgba(0,0,0,0.35)]" aria-hidden>
          <defs>
            <radialGradient id="rim" cx="50%" cy="40%" r="65%">
              <stop offset="0%" stopColor="#2a2d2a" />
              <stop offset="70%" stopColor="#0f110f" />
              <stop offset="100%" stopColor="#050605" />
            </radialGradient>
            <radialGradient id="track" cx="50%" cy="45%" r="60%">
              <stop offset="0%" stopColor="#1d201d" />
              <stop offset="100%" stopColor="#0a0c0a" />
            </radialGradient>
            <radialGradient id="cone" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#3a3d3a" />
              <stop offset="60%" stopColor="#151815" />
              <stop offset="100%" stopColor="#0a0c0a" />
            </radialGradient>
            <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#d9dcd6" />
              <stop offset="50%" stopColor="#7d817c" />
              <stop offset="100%" stopColor="#e8eae6" />
            </linearGradient>
            <radialGradient id="light" cx="35%" cy="25%" r="70%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
              <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>

          <circle cx="200" cy="200" r={R_OUT} fill="url(#rim)" />
          <circle cx="200" cy="200" r={R_OUT - 1} fill="none" stroke="url(#metal)" strokeWidth="1.2" opacity="0.7" />
          <circle cx="200" cy="200" r={R_TRACK + 8} fill="url(#track)" />
          <circle cx="200" cy="200" r={R_TRACK + 8} fill="none" stroke="#000" strokeOpacity="0.5" strokeWidth="1" />
          <circle cx="200" cy="200" r={R_POCKET_OUT + 2} fill="url(#metal)" opacity="0.9" />

          {pockets.map((p) => (
            <path key={p.n} d={p.d} fill={p.fill} stroke="#0a0c0a" strokeWidth="0.6" />
          ))}
          {pockets.map((p) => (
            <line
              key={`fret-${p.n}`}
              x1="200"
              y1={200 - R_POCKET_IN}
              x2="200"
              y2={200 - R_POCKET_OUT - 2}
              stroke="url(#metal)"
              strokeWidth="1.4"
              transform={`rotate(${p.angle + STEP / 2} 200 200)`}
              opacity="0.9"
            />
          ))}
          {pockets.map((p) => (
            <text
              key={`num-${p.n}`}
              x="200"
              y={200 - R_NUMBER}
              fill="#ffffff"
              fontSize="11.5"
              fontFamily="var(--font-sans)"
              fontWeight="500"
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${p.angle} 200 200)`}
            >
              {p.n}
            </text>
          ))}

          <circle cx="200" cy="200" r={R_POCKET_IN} fill="url(#cone)" />
          <circle cx="200" cy="200" r={R_POCKET_IN} fill="none" stroke="url(#metal)" strokeWidth="1.5" />
          <circle cx="200" cy="200" r={78} fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="1" />
          {/* turret */}
          <g>
            <circle cx="200" cy="200" r="24" fill="url(#metal)" />
            <circle cx="200" cy="200" r="16" fill="#0f110f" />
            <circle cx="200" cy="200" r="6" fill="url(#metal)" />
            {[0, 90, 180, 270].map((a) => (
              <g key={a} transform={`rotate(${a} 200 200)`}>
                <rect x="197" y="128" width="6" height="52" rx="3" fill="url(#metal)" />
                <circle cx="200" cy="126" r="6.5" fill="url(#metal)" />
              </g>
            ))}
          </g>
          <circle cx="200" cy="200" r={R_OUT} fill="url(#light)" />
        </svg>
      </div>

      {/* ball */}
      <div
        ref={ballRef}
        className="pointer-events-none absolute left-1/2 top-1/2 h-[4.2cqw] w-[4.2cqw] rounded-full opacity-0 will-change-transform"
        style={{
          background: "radial-gradient(circle at 35% 30%, #ffffff 0%, #e6e8e4 35%, #9a9e98 100%)",
          boxShadow: "0 2px 4px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(0,0,0,0.3)",
          transformOrigin: "50% 50%",
        }}
        aria-hidden
      />
    </div>
  );
}
