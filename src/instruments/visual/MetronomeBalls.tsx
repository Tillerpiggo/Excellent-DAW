'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';
import { useProjectStore } from '@/stores/projectStore';
import { Instrument } from '../types';

interface MetronomeBallsProps {
  trackId: string;
}

// Color palettes: [background, foreground, accent, glow, tertiary]
interface Palette { bg: number; fg: number; accent: number; glow: number; tertiary: number }

const PALETTES: Record<string, Palette> = {
  default:  { bg: 0xf5f2eb, fg: 0x1a2744, accent: 0xb5563e, glow: 0xb5563e, tertiary: 0x4a7a6f }, // paper & ink, teal-green
  sepia:    { bg: 0xe8dcc8, fg: 0x3b2612, accent: 0x8b5e34, glow: 0xc4883a, tertiary: 0x6b7f4a }, // aged parchment, olive
  midnight: { bg: 0x0d1117, fg: 0xc9d1d9, accent: 0xd4a847, glow: 0xd4a847, tertiary: 0x58a6c9 }, // dark with gold, steel blue
  botanical:{ bg: 0xeae6df, fg: 0x2d4a3e, accent: 0xb47a4e, glow: 0x6b8f6b, tertiary: 0x8a5a7a }, // forest & amber, dusty mauve
  plum:     { bg: 0xf0e8f0, fg: 0x3a1f4a, accent: 0xc25a7c, glow: 0xc25a7c, tertiary: 0x5a8a6a }, // deep purple & rose, sage
};

const PALETTE_KEYS = Object.keys(PALETTES);

// MIDI trigger pitches
const PITCH_FG = 48;      // C3 — foreground update
const PITCH_BG = 50;      // D3 — background flower update
const PITCH_GLOW = 52;    // E3 — glow pulse
const PITCH_INK = 54;     // F#3 — ink dot rotation
const PITCH_INVERT = 56;  // G#3 — toggle color inversion
const PITCH_PAL_SEPIA = 58;     // A#3 — sepia palette
const PITCH_PAL_MIDNIGHT = 60;  // C4 — midnight palette
const PITCH_PAL_BOTANICAL = 62; // D4 — botanical palette
const PITCH_PAL_PLUM = 64;      // E4 — plum palette

// Sustained-effect pitch ranges (active while note is held)
const PITCH_WAVE_MIN = 66;  // F#4 — ink-on-water (lowest spatial freq)
const PITCH_WAVE_MAX = 70;  // A#4 — ink-on-water (highest spatial freq)
const PITCH_WARP_MIN = 72;  // C5  — warp field (lowest spatial freq)
const PITCH_WARP_MAX = 76;  // E5  — warp field (highest spatial freq)
const PITCH_SPIRAL = 78;    // F#5 — trigger spiral dots from bg centers
const PITCH_CRAZY_INK = 80; // G#5 — crazy polar ink dots
const PITCH_SCALE_POP = 82; // A#5 — squash & scale pop
const PITCH_LINE_WEIGHT = 84; // C6 — line weight punch
const PITCH_SNARE_L = 86;  // D6 — snare pattern over left panel
const PITCH_SNARE_C = 88;  // E6 — snare pattern over center panel
const PITCH_SNARE_R = 90;  // F#6 — snare pattern over right panel

// Spiral dot constants
const SPIRAL_DOTS_PER_TRIGGER = 3;    // one per background panel center
const SPIRAL_ARMS = 5;                // dots per arm burst
const SPIRAL_GROWTH = 8;              // how fast spiral radius grows per step
const SPIRAL_FADE_PER_STEP = 0.06;    // opacity lost per 1/32 note step
const SPIRAL_MAX_STEPS = 24;          // max steps before removal
const SPIRAL_ROTATION_PER_KICK = Math.PI / 12; // how much kick rotates spiral base

// Crazy polar ink constants
const CRAZY_INK_POSITIONS = 256;      // sample points along polar path
const CRAZY_INK_DOTS_PER_TRIGGER = 12; // blobs placed per trigger
const CRAZY_INK_ORBIT_FRAC = 0.30;   // orbit radius as fraction of panel width
const CRAZY_INK_BLOB_MULT = 0.8;     // smaller blobs
const CRAZY_INK_BLOB_VERTS = 8;
const CRAZY_INK_BLOB_NOISE = 0.25;
const CRAZY_INK_FADE_PER_STEP = 0.15;

// Scale pop: 2-step sequence — instant hit, snap back on next 1/16th
const SCALE_POP_STEPS: number[] = [1.03, 1.0];

// Line weight: instant boost, snaps back after 1 sixteenth-note tick
const LINE_WEIGHT_OPACITY_MULT = 2.2;
const LINE_WEIGHT_DOT_MULT = 1.5;
const LINE_WEIGHT_HOLD_TICKS = 1;

// Snare bounce pattern
const SNARE_BALLS = 20;
const SNARE_SPEED = 2.5;
const SNARE_BOUNCE_RADIUS = 120;  // pattern-space radius of the imaginary circle
const SNARE_LINE_OPACITY = 0.25;
const SNARE_KICK_STEP = 4;   // degrees per trigger
const SNARE_SNARE_STEP = 3;
const SNARE_EVOLVE_KICK_STEP = 1.5;  // degrees per 1/32 note auto-evolution
const SNARE_EVOLVE_SNARE_STEP = 1.0;
const SNARE_PITCHES = [PITCH_SNARE_L, PITCH_SNARE_C, PITCH_SNARE_R];

// Effect tuning
const WAVE_FREQ_MIN = 2.0;    // spatial freq low end
const WAVE_FREQ_MAX = 14.0;   // spatial freq high end
const WAVE_AMP_SCALE = 0.012; // * viewport width * (velocity/127)
const WAVE_SPEED = 1.8;       // temporal oscillation speed

const WARP_FOLD_MIN = 3.0;         // pitch 72 → 3-fold (trefoil)
const WARP_FOLD_MAX = 8.0;        // pitch 76 → 8-fold (octagonal)
const WARP_AMP_SCALE = 0.018;     // punchy amplitude
const WARP_BASE_SPEED = 0.6;      // slow temporal drift

const EFFECT_LERP = 0.08;     // smooth amplitude ramp per frame

const DEFAULTS = {
  balls: 24,
  kickStart: 37,      // degrees
  snareStart: 53,     // degrees
  kickStep: 3,        // degrees per trigger
  snareStep: 2,       // degrees per trigger
  speed: 2,
  dotSize: 2,
  lineOpacity: 0.2,
  fgMultiplier: 1,    // multiplier for foreground angle changes
  bgMultiplier: 4,    // multiplier for background angle changes
};

// Simulation constants
const SIM_BEATS = 200;
const STEPS_PER_BEAT = 30;
const BG_BALLS = 32;
const BG_SPEED = 3;
const BG_LINE_OPACITY = 0.12;
const BG_SCALE = 1.8;
const PATTERN_EXTENT = 500; // pattern-space half-size
const MAX_EXTENT = PATTERN_EXTENT * 2; // ball cutoff distance

function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

// Background rotation per trigger
const BG_ROTATION_STEP = (Math.PI * 2) / 24;

// Ink dot constants
const INK_POSITIONS = 128;            // sample points along the polar path
const INK_DOTS = 4;                   // new blobs placed per trigger
const INK_ORBIT_FRAC = 0.35;         // base orbit radius as fraction of panel width
const INK_BLOB_MULT = 2.0;           // blob radius = dotSize * scale * this
const INK_BLOB_VERTS = 10;           // vertices per blob shape
const INK_BLOB_NOISE = 0.35;         // max radial noise as fraction of radius
const INK_FADE_PER_STEP = 0.2;       // opacity lost per PITCH_INK trigger

/** Polar path function — complex curve that stays near baseR, never crosses center.
 *  Combines several harmonics for an organic, flower-like orbit. */
function inkPolarPath(slot: number, baseR: number): [number, number] {
  const t = (slot / INK_POSITIONS) * Math.PI * 2;
  const r = baseR * (1
    + 0.12 * Math.sin(3 * t)
    + 0.08 * Math.cos(5 * t)
    + 0.06 * Math.sin(7 * t)
    + 0.04 * Math.cos(11 * t)
  );
  return [Math.cos(t) * r, Math.sin(t) * r];
}

/** Simple deterministic hash for ink blob noise (only changes with seed) */
function inkHash(a: number, b: number, c: number, d: number): number {
  let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791) ^ (d * 41729501);
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = (h >> 16) ^ h;
  return (h & 0xffff) / 0xffff; // 0–1
}

/** Crazy polar path — wild multi-harmonic curve with sharp petals and loops */
function crazyPolarPath(slot: number, baseR: number): [number, number] {
  const t = (slot / CRAZY_INK_POSITIONS) * Math.PI * 2;
  const r = baseR * (1
    + 0.25 * Math.sin(5 * t)
    + 0.18 * Math.cos(7 * t)
    + 0.15 * Math.sin(11 * t)
    + 0.12 * Math.cos(13 * t)
    + 0.10 * Math.sin(17 * t)
    + 0.08 * Math.cos(19 * t)
    + 0.06 * Math.sin(23 * t)
    + 0.04 * Math.cos(29 * t)
  );
  return [Math.cos(t) * r, Math.sin(t) * r];
}

/** Spiral dot — born at a background center, spirals outward each 1/32 note */
interface SpiralDot {
  panelIndex: number;   // which background panel (0, 1, 2)
  baseAngle: number;    // initial spiral angle
  step: number;         // current step along spiral (advances each 1/32 note)
  opacity: number;      // fades each step
  seed: number;         // for blob shape noise
}

/** Persistent ink blob — placed once, fades over subsequent triggers */
interface InkBlob {
  slot: number;   // position slot (0–31)
  opacity: number;
  seed: number;   // deterministic shape seed
}

/** Geometry whose vertices can be displaced each frame by wave/warp effects */
interface DisplaceableGeom {
  attr: THREE.BufferAttribute;
  base: Float32Array; // snapshot of undisplaced positions
}

interface Trajectory {
  points: Float32Array; // interleaved x,y pairs
  count: number;        // number of points
}

/** Precompute all ball trajectories for the metronome pattern */
function computePattern(
  balls: number,
  kickAngle: number,  // radians
  snareAngle: number, // radians
  baseSpeed: number,
): Trajectory[] {
  const result: Trajectory[] = [];
  const maxPoints = SIM_BEATS * STEPS_PER_BEAT + 1;

  for (let i = 0; i < balls; i++) {
    let angle = (i / balls) * Math.PI * 2;
    let x = 0;
    let y = 0;
    const pts = new Float32Array(maxPoints * 2);
    pts[0] = 0;
    pts[1] = 0;
    let count = 1;
    let alive = true;

    for (let beat = 0; beat < SIM_BEATS && alive; beat++) {
      const bim = beat % 4;
      let speed: number;
      if (bim === 0 || bim === 2) {
        angle += kickAngle;
        speed = Math.abs(baseSpeed);
      } else {
        angle -= snareAngle;
        speed = -Math.abs(baseSpeed);
      }
      const dx = Math.cos(angle) * speed;
      const dy = Math.sin(angle) * speed;

      for (let s = 0; s < STEPS_PER_BEAT && alive; s++) {
        x += dx;
        y += dy;
        if (Math.abs(x) > MAX_EXTENT || Math.abs(y) > MAX_EXTENT) {
          alive = false;
        } else {
          pts[count * 2] = x;
          pts[count * 2 + 1] = y;
          count++;
        }
      }
    }

    result.push({ points: pts, count });
  }
  return result;
}

/** Precompute ball trajectories that bounce off an imaginary circle of given radius.
 *  Balls reflect off the circle boundary instead of flying to infinity. */
function computePatternBounce(
  balls: number,
  kickAngle: number,
  snareAngle: number,
  baseSpeed: number,
  bounceRadius: number,
): Trajectory[] {
  const result: Trajectory[] = [];
  const maxPoints = SIM_BEATS * STEPS_PER_BEAT + 1;

  for (let i = 0; i < balls; i++) {
    let angle = (i / balls) * Math.PI * 2;
    let x = 0;
    let y = 0;
    const pts = new Float32Array(maxPoints * 2);
    pts[0] = 0;
    pts[1] = 0;
    let count = 1;

    for (let beat = 0; beat < SIM_BEATS; beat++) {
      const bim = beat % 4;
      let speed: number;
      if (bim === 0 || bim === 2) {
        angle += kickAngle;
        speed = Math.abs(baseSpeed);
      } else {
        angle -= snareAngle;
        speed = -Math.abs(baseSpeed);
      }
      let dx = Math.cos(angle) * speed;
      let dy = Math.sin(angle) * speed;

      for (let s = 0; s < STEPS_PER_BEAT; s++) {
        let nx = x + dx;
        let ny = y + dy;
        const dist = Math.sqrt(nx * nx + ny * ny);

        // Bounce off the circle boundary
        if (dist > bounceRadius && dist > 0.001) {
          // Normal at hit point (pointing inward)
          const normX = -nx / dist;
          const normY = -ny / dist;
          // Reflect velocity: v' = v - 2(v·n)n
          const dot = dx * normX + dy * normY;
          dx = dx - 2 * dot * normX;
          dy = dy - 2 * dot * normY;
          // Place on boundary and apply reflected step
          nx = (nx / dist) * bounceRadius + dx;
          ny = (ny / dist) * bounceRadius + dy;
        }

        x = nx;
        y = ny;
        pts[count * 2] = x;
        pts[count * 2 + 1] = y;
        count++;
        if (count >= maxPoints) break;
      }
      if (count >= maxPoints) break;
    }

    result.push({ points: pts, count });
  }
  return result;
}

/** Build THREE.Line objects from trajectories with dot at each endpoint */
function buildLines(
  parent: THREE.Group,
  trajectories: Trajectory[],
  scale: number,
  color: number,
  opacity: number,
  dotSize: number,
  disposables: (() => void)[],
  displaceables?: DisplaceableGeom[],
) {
  for (const traj of trajectories) {
    if (traj.count < 2) continue;

    const positions = new Float32Array(traj.count * 3);
    for (let i = 0; i < traj.count; i++) {
      positions[i * 3] = traj.points[i * 2] * scale;
      positions[i * 3 + 1] = traj.points[i * 2 + 1] * scale;
      positions[i * 3 + 2] = 0;
    }
    const geom = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(positions, 3);
    geom.setAttribute('position', attr);
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: false,
    });
    const line = new THREE.Line(geom, mat);
    parent.add(line);
    disposables.push(() => { geom.dispose(); mat.dispose(); });

    // Track for displacement effects
    if (displaceables) {
      displaceables.push({ attr, base: new Float32Array(positions) });
    }

    // Dot at final position
    const lx = traj.points[(traj.count - 1) * 2] * scale;
    const ly = traj.points[(traj.count - 1) * 2 + 1] * scale;
    const dotGeom = new THREE.CircleGeometry(dotSize * scale * 0.5, 12);
    const dotMat = new THREE.MeshBasicMaterial({ color, depthWrite: false, depthTest: false });
    const dot = new THREE.Mesh(dotGeom, dotMat);
    dot.position.set(lx, ly, 0);
    parent.add(dot);
    disposables.push(() => { dotGeom.dispose(); dotMat.dispose(); });
  }
}

/** Build an irregular ink-blob shape (noisy circle) */
function buildInkBlob(
  parent: THREE.Group,
  cx: number,
  cy: number,
  baseRadius: number,
  color: number,
  opacity: number,
  seed: number,
  disposables: (() => void)[],
) {
  const shape = new THREE.Shape();
  for (let v = 0; v < INK_BLOB_VERTS; v++) {
    const noise = inkHash(seed, v, 0, 0) * 2 - 1; // -1 to 1
    const r = baseRadius * (1 + noise * INK_BLOB_NOISE);
    const angle = (v / INK_BLOB_VERTS) * Math.PI * 2;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (v === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  }
  shape.closePath();

  const geom = new THREE.ShapeGeometry(shape);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(cx, cy, 0);
  parent.add(mesh);
  disposables.push(() => { geom.dispose(); mat.dispose(); });
}

/** Render all persistent ink blobs around the panel center */
function renderInkBlobs(
  parent: THREE.Group,
  orbitRadius: number,
  color: number,
  dotSize: number,
  scale: number,
  blobs: InkBlob[],
  disposables: (() => void)[],
) {
  const blobR = dotSize * scale * INK_BLOB_MULT;

  for (const blob of blobs) {
    const [x, y] = inkPolarPath(blob.slot, orbitRadius);
    buildInkBlob(parent, x, y, blobR, color, blob.opacity, blob.seed, disposables);
  }
}

/** Build a smaller ink blob for the crazy polar system */
function buildCrazyInkBlob(
  parent: THREE.Group,
  cx: number,
  cy: number,
  baseRadius: number,
  color: number,
  opacity: number,
  seed: number,
  disposables: (() => void)[],
) {
  const shape = new THREE.Shape();
  for (let v = 0; v < CRAZY_INK_BLOB_VERTS; v++) {
    const noise = inkHash(seed, v, 1, 0) * 2 - 1;
    const r = baseRadius * (1 + noise * CRAZY_INK_BLOB_NOISE);
    const angle = (v / CRAZY_INK_BLOB_VERTS) * Math.PI * 2;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (v === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  }
  shape.closePath();
  const geom = new THREE.ShapeGeometry(shape);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, depthTest: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(cx, cy, 0);
  parent.add(mesh);
  disposables.push(() => { geom.dispose(); mat.dispose(); });
}

/** Render crazy polar ink blobs around panel center */
function renderCrazyInkBlobs(
  parent: THREE.Group,
  orbitRadius: number,
  color: number,
  dotSize: number,
  scale: number,
  blobs: InkBlob[],
  disposables: (() => void)[],
) {
  const blobR = dotSize * scale * CRAZY_INK_BLOB_MULT;
  for (const blob of blobs) {
    const [x, y] = crazyPolarPath(blob.slot, orbitRadius);
    buildCrazyInkBlob(parent, x, y, blobR, color, blob.opacity, blob.seed, disposables);
  }
}

/** Render spiral dots emanating from a center point */
function renderSpiralDots(
  parent: THREE.Group,
  centerX: number,
  centerY: number,
  color: number,
  dotSize: number,
  scale: number,
  dots: SpiralDot[],
  panelIndex: number,
  spiralBaseAngle: number,
  disposables: (() => void)[],
) {
  const blobR = dotSize * scale * 0.6; // smaller than regular ink blobs
  for (const dot of dots) {
    if (dot.panelIndex !== panelIndex) continue;
    // Archimedean spiral: r = a + b*theta
    const theta = dot.baseAngle + spiralBaseAngle + dot.step * 0.5;
    const r = SPIRAL_GROWTH * scale * dot.step;
    const x = centerX + Math.cos(theta) * r;
    const y = centerY + Math.sin(theta) * r;
    buildInkBlob(parent, x, y, blobR, color, dot.opacity, dot.seed, disposables);
  }
}

function MetronomeBallsVisual({ trackId }: MetronomeBallsProps) {
  const rootRef = useRef<THREE.Group>(null);
  const engineRef = useRef(getVisualPlaybackEngine());
  const bpm = useProjectStore((s) => s.project.bpm);
  const initRef = useRef(false);

  // Mutable angle state
  const fgKickAngle = useRef(0);
  const fgSnareAngle = useRef(0);
  const bgKickAngle = useRef(0);
  const bgSnareAngle = useRef(0);
  const bgRotation = useRef(0);
  const inkStep = useRef(0); // current ink rotation slot (0–31)
  const inkBlobs = useRef<InkBlob[]>([]); // persistent fading blobs
  const inkSeedCounter = useRef(0); // monotonic seed for blob shapes
  const inverted = useRef(false); // color inversion toggle
  const paletteKey = useRef('default'); // active palette name

  // Spiral dot state
  const spiralDots = useRef<SpiralDot[]>([]);
  const spiralSeedCounter = useRef(0);
  const spiralBaseAngle = useRef(0); // rotated by kicks
  const lastSpiralStepTime = useRef(0); // ms timestamp of last 1/32 advance

  // Crazy polar ink state
  const crazyInkStep = useRef(0);
  const crazyInkBlobs = useRef<InkBlob[]>([]);
  const crazyInkSeedCounter = useRef(0);

  // Scale pop state — step index into SCALE_POP_STEPS, -1 = inactive
  const scalePopStep = useRef(-1);
  const scalePopTickTime = useRef(0); // ms timestamp of last 1/16th tick for this effect

  // Line weight state — remaining 1/16th ticks of boost, 0 = inactive
  const lineWeightTicks = useRef(0);
  const lineWeightTickTime = useRef(0);

  // Continuous ink fade timer (both regular + crazy ink)
  const lastInkFadeTime = useRef(0);

  // Snare bounce pattern state — per panel (L=0, C=1, R=2)
  const snareActive = useRef([false, false, false]); // true while note is held
  const snareKickAngle = useRef([deg2rad(20), deg2rad(20), deg2rad(20)]);
  const snareSnareAngle = useRef([deg2rad(15), deg2rad(15), deg2rad(15)]);
  const snareEvolveTime = useRef(0); // ms timestamp of last 1/32 evolution tick

  // Track params to detect changes
  const prevParamsRef = useRef('');

  // Per-pitch note-on count tracking (previous frame's counts)
  const prevPitchCountsRef = useRef(new Map<number, number>());

  // Glow pulse state
  const glowMeshRef = useRef<THREE.Mesh | null>(null);
  const glowOpacity = useRef(0);

  // Displacement effect state
  const displaceRef = useRef<DisplaceableGeom[]>([]);
  const waveAmpSmooth = useRef(0);
  const waveFreqSmooth = useRef(WAVE_FREQ_MIN);
  const warpAmpSmooth = useRef(0);
  const warpFoldSmooth = useRef(WARP_FOLD_MIN);

  // Disposable cleanup functions
  const disposablesRef = useRef<(() => void)[]>([]);

  const { viewport } = useThree();

  function clearScene() {
    for (const fn of disposablesRef.current) fn();
    disposablesRef.current = [];
    displaceRef.current = [];
    const root = rootRef.current;
    if (!root) return;
    while (root.children.length > 0) {
      root.remove(root.children[0]);
    }
  }

  function buildScene(p: {
    balls: number; kickStep: number; snareStep: number;
    speed: number; dotSize: number; lineOpacity: number;
  }) {
    const root = rootRef.current;
    if (!root) return;
    clearScene();

    // Apply line weight boost if active
    const lwActive = lineWeightTicks.current > 0;
    const effectiveOpacity = lwActive ? p.lineOpacity * LINE_WEIGHT_OPACITY_MULT : p.lineOpacity;
    const effectiveDotSize = lwActive ? p.dotSize * LINE_WEIGHT_DOT_MULT : p.dotSize;

    const vw = viewport.width;
    const vh = viewport.height;
    const panelWidth = vw / 3;
    const fgScale = panelWidth / PATTERN_EXTENT;

    // Resolve colors from palette + inversion
    const pal = PALETTES[paletteKey.current] ?? PALETTES.default;
    const inv = inverted.current;
    const colBg = inv ? pal.fg : pal.bg;
    const colFg = inv ? pal.bg : pal.fg;
    const colAccent = inv ? pal.bg : pal.accent;
    const colGlow = inv ? pal.bg : pal.glow;
    const colTertiary = inv ? pal.bg : pal.tertiary;

    // === 0. Full-viewport paper backdrop (renderOrder -1) ===
    const paperGeom = new THREE.PlaneGeometry(vw * 2, vh * 2);
    const paperMat = new THREE.MeshBasicMaterial({
      color: colBg,
      depthWrite: false,
      depthTest: false,
    });
    const paperPlane = new THREE.Mesh(paperGeom, paperMat);
    paperPlane.renderOrder = -1;
    root.add(paperPlane);
    disposablesRef.current.push(() => { paperGeom.dispose(); paperMat.dispose(); });

    // === 1. Background flower (renderOrder 0) ===
    const bgGroup = new THREE.Group();
    bgGroup.renderOrder = 0;
    bgGroup.position.z = 0;
    bgGroup.rotation.z = bgRotation.current;

    const bgS = fgScale * BG_SCALE;
    const bgTrajs = computePattern(BG_BALLS, bgKickAngle.current, bgSnareAngle.current, BG_SPEED);
    buildLines(bgGroup, bgTrajs, bgS, colAccent, BG_LINE_OPACITY, p.dotSize, disposablesRef.current, displaceRef.current);
    root.add(bgGroup);

    // === 2. Compute foreground trajectories (shared by all 3 panels) ===
    const fgTrajs = computePattern(p.balls, fgKickAngle.current, fgSnareAngle.current, p.speed);

    // Compute bounding box of foreground pattern
    let bbMinX = Infinity, bbMinY = Infinity, bbMaxX = -Infinity, bbMaxY = -Infinity;
    for (const t of fgTrajs) {
      for (let i = 0; i < t.count; i++) {
        const px = t.points[i * 2];
        const py = t.points[i * 2 + 1];
        if (px < bbMinX) bbMinX = px;
        if (py < bbMinY) bbMinY = py;
        if (px > bbMaxX) bbMaxX = px;
        if (py > bbMaxY) bbMaxY = py;
      }
    }
    // Add padding (10 pattern-units)
    const pad = 10;
    bbMinX -= pad; bbMinY -= pad; bbMaxX += pad; bbMaxY += pad;
    const maskW = (bbMaxX - bbMinX) * fgScale;
    const maskH = (bbMaxY - bbMinY) * fgScale;
    const maskCx = ((bbMaxX + bbMinX) / 2) * fgScale;
    const maskCy = ((bbMaxY + bbMinY) / 2) * fgScale;

    // === 3. Mask rectangles (z = -0.25, renderOrder 1) ===
    for (let pi = 0; pi < 3; pi++) {
      const panelX = (pi - 1) * panelWidth;
      const mGeom = new THREE.PlaneGeometry(maskW, maskH);
      const mMat = new THREE.MeshBasicMaterial({ color: colBg, depthWrite: false, depthTest: false });
      const mask = new THREE.Mesh(mGeom, mMat);
      mask.renderOrder = 1;
      mask.position.set(panelX + maskCx, maskCy, 0);
      root.add(mask);
      disposablesRef.current.push(() => { mGeom.dispose(); mMat.dispose(); });
    }

    // === 4. Foreground panels (z = 0, renderOrder 2) ===
    const inkOrbitR = panelWidth * INK_ORBIT_FRAC;
    const crazyOrbitR = panelWidth * CRAZY_INK_ORBIT_FRAC;
    for (let pi = 0; pi < 3; pi++) {
      const panelGroup = new THREE.Group();
      panelGroup.renderOrder = 2;
      panelGroup.position.x = (pi - 1) * panelWidth;
      buildLines(panelGroup, fgTrajs, fgScale, colFg, effectiveOpacity, effectiveDotSize, disposablesRef.current, displaceRef.current);
      renderInkBlobs(panelGroup, inkOrbitR, colFg, effectiveDotSize, fgScale, inkBlobs.current, disposablesRef.current);
      renderCrazyInkBlobs(panelGroup, crazyOrbitR, colFg, effectiveDotSize, fgScale, crazyInkBlobs.current, disposablesRef.current);
      renderSpiralDots(panelGroup, 0, 0, colFg, effectiveDotSize, fgScale, spiralDots.current, pi, spiralBaseAngle.current, disposablesRef.current);
      root.add(panelGroup);
    }

    // === 4b. Snare bounce patterns — rendered on top of fg (renderOrder 2.5) ===
    const snareScale = (panelWidth * 0.8) / SNARE_BOUNCE_RADIUS; // fit inside panel
    for (let pi = 0; pi < 3; pi++) {
      if (!snareActive.current[pi]) continue;
      const snareTrajs = computePatternBounce(
        SNARE_BALLS,
        snareKickAngle.current[pi],
        snareSnareAngle.current[pi],
        SNARE_SPEED,
        SNARE_BOUNCE_RADIUS,
      );
      const snareGroup = new THREE.Group();
      snareGroup.renderOrder = 2;
      snareGroup.position.x = (pi - 1) * panelWidth;
      buildLines(snareGroup, snareTrajs, snareScale, colTertiary, SNARE_LINE_OPACITY, p.dotSize * 0.7, disposablesRef.current);
      root.add(snareGroup);
    }

    // === 5. Glow overlay (renderOrder 3) ===
    const glowRadius = Math.max(vw, vh) * 0.6;
    const glowGeom = new THREE.CircleGeometry(glowRadius, 48);
    const glowMat = new THREE.MeshBasicMaterial({
      color: colGlow,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.renderOrder = 3;
    root.add(glow);
    glowMeshRef.current = glow;
    disposablesRef.current.push(() => { glowGeom.dispose(); glowMat.dispose(); });
  }

  useFrame(() => {
    const root = rootRef.current;
    if (!root) return;
    const state = engineRef.current.getTrackState(trackId);
    if (!state) return;

    const balls = (state.params.balls as number) ?? DEFAULTS.balls;
    const kickStep = (state.params.kickStep as number) ?? DEFAULTS.kickStep;
    const snareStep = (state.params.snareStep as number) ?? DEFAULTS.snareStep;
    const speed = (state.params.speed as number) ?? DEFAULTS.speed;
    const dotSize = (state.params.dotSize as number) ?? DEFAULTS.dotSize;
    const lineOpacity = (state.params.lineOpacity as number) ?? DEFAULTS.lineOpacity;
    const fgMultiplier = (state.params.fgMultiplier as number) ?? DEFAULTS.fgMultiplier;
    const bgMultiplier = (state.params.bgMultiplier as number) ?? DEFAULTS.bgMultiplier;

    const p = { balls, kickStep, snareStep, speed, dotSize, lineOpacity };

    // Check if params changed (rebuild without angle change)
    const paramsKey = `${balls},${speed},${dotSize},${lineOpacity},${fgMultiplier},${bgMultiplier}`;

    // Initial build
    if (!initRef.current) {
      initRef.current = true;
      const kickStart = (state.params.kickStart as number) ?? DEFAULTS.kickStart;
      const snareStart = (state.params.snareStart as number) ?? DEFAULTS.snareStart;
      fgKickAngle.current = deg2rad(kickStart);
      fgSnareAngle.current = deg2rad(snareStart);
      bgKickAngle.current = deg2rad(kickStart);
      bgSnareAngle.current = deg2rad(snareStart);
      prevParamsRef.current = paramsKey;
      buildScene(p);
      return;
    }

    // Rebuild on param change
    if (paramsKey !== prevParamsRef.current) {
      prevParamsRef.current = paramsKey;
      buildScene(p);
      return;
    }

    // Detect per-pitch note-on triggers using deterministic pitch counts
    const prevCounts = prevPitchCountsRef.current;
    let needsRebuild = false;

    for (const [pitch, count] of state.pitchNoteOnCounts) {
      const prevCount = prevCounts.get(pitch) ?? 0;
      const delta = count - prevCount;
      if (delta <= 0) continue;

      if (pitch === PITCH_FG) {
        // Foreground update — increment fg angles per trigger
        for (let i = 0; i < delta; i++) {
          fgKickAngle.current += deg2rad(kickStep) * fgMultiplier;
          fgSnareAngle.current += deg2rad(snareStep) * fgMultiplier;
          // Rotate the spiral base angle on each kick
          spiralBaseAngle.current += SPIRAL_ROTATION_PER_KICK;
        }
        needsRebuild = true;
      } else if (pitch === PITCH_BG) {
        // Background flower update — increment bg angles + rotate per trigger
        for (let i = 0; i < delta; i++) {
          bgKickAngle.current += deg2rad(kickStep) * bgMultiplier;
          bgSnareAngle.current += deg2rad(snareStep) * bgMultiplier;
          bgRotation.current += BG_ROTATION_STEP;
        }
        needsRebuild = true;
      } else if (pitch === PITCH_INK) {
        for (let i = 0; i < delta; i++) {
          // Advance rotation
          inkStep.current = (inkStep.current + 1) % INK_POSITIONS;

          // Spawn 4 new blobs at evenly spaced positions from current step
          for (let d = 0; d < INK_DOTS; d++) {
            const slot = (inkStep.current + d * (INK_POSITIONS / INK_DOTS)) % INK_POSITIONS;
            inkBlobs.current.push({
              slot,
              opacity: 1.0,
              seed: inkSeedCounter.current++,
            });
          }
        }
        needsRebuild = true;
      } else if (pitch === PITCH_INVERT) {
        // Toggle color inversion (each note-on flips)
        for (let i = 0; i < delta; i++) {
          inverted.current = !inverted.current;
        }
        needsRebuild = true;
      } else if (pitch === PITCH_GLOW) {
        // Glow pulse — flash to full opacity
        glowOpacity.current = 0.25;
      } else if (pitch === PITCH_SPIRAL) {
        // Spawn spiral dots from center of all 3 panels
        for (let i = 0; i < delta; i++) {
          for (let pi = 0; pi < 3; pi++) {
            for (let arm = 0; arm < SPIRAL_ARMS; arm++) {
              spiralDots.current.push({
                panelIndex: pi,
                baseAngle: (arm / SPIRAL_ARMS) * Math.PI * 2,
                step: 0,
                opacity: 1.0,
                seed: spiralSeedCounter.current++,
              });
            }
          }
        }
        // Initialize timing if first spiral
        if (lastSpiralStepTime.current === 0) {
          lastSpiralStepTime.current = performance.now();
        }
        needsRebuild = true;
      } else if (pitch === PITCH_CRAZY_INK) {
        for (let i = 0; i < delta; i++) {
          // Advance rotation
          crazyInkStep.current = (crazyInkStep.current + 1) % CRAZY_INK_POSITIONS;

          // Spawn dots evenly spaced along the crazy polar path
          for (let d = 0; d < CRAZY_INK_DOTS_PER_TRIGGER; d++) {
            const slot = (crazyInkStep.current + d * Math.floor(CRAZY_INK_POSITIONS / CRAZY_INK_DOTS_PER_TRIGGER)) % CRAZY_INK_POSITIONS;
            crazyInkBlobs.current.push({
              slot,
              opacity: 1.0,
              seed: crazyInkSeedCounter.current++,
            });
          }
        }
        needsRebuild = true;
      } else if (pitch === PITCH_SCALE_POP) {
        // Start scale pop sequence from step 0
        scalePopStep.current = 0;
        scalePopTickTime.current = performance.now();
      } else if (pitch === PITCH_LINE_WEIGHT) {
        // Activate line weight boost
        lineWeightTicks.current = LINE_WEIGHT_HOLD_TICKS;
        lineWeightTickTime.current = performance.now();
        needsRebuild = true;
      } else if (SNARE_PITCHES.includes(pitch)) {
        // Snare note-on: update angles for this panel
        const pi = SNARE_PITCHES.indexOf(pitch);
        for (let i = 0; i < delta; i++) {
          snareKickAngle.current[pi] += deg2rad(SNARE_KICK_STEP);
          snareSnareAngle.current[pi] += deg2rad(SNARE_SNARE_STEP);
        }
        needsRebuild = true;
      }
    }

    // === Snare sustained check — active while note is held ===
    {
      let snareChanged = false;
      for (let pi = 0; pi < 3; pi++) {
        const held = state.activeNotes.has(SNARE_PITCHES[pi]);
        if (held !== snareActive.current[pi]) {
          snareActive.current[pi] = held;
          snareChanged = true;
        }
      }
      // Initialize evolution timer when any snare becomes active
      const anyActive = snareActive.current.some(a => a);
      if (anyActive && snareEvolveTime.current === 0) {
        snareEvolveTime.current = performance.now();
      }
      if (!anyActive) {
        snareEvolveTime.current = 0;
      }
      if (snareChanged) needsRebuild = true;
    }

    // Palette switches — last (highest pitch) wins, odd repeats toggle on, even toggle off
    const palPitches: [number, string][] = [
      [PITCH_PAL_SEPIA, 'sepia'],
      [PITCH_PAL_MIDNIGHT, 'midnight'],
      [PITCH_PAL_BOTANICAL, 'botanical'],
      [PITCH_PAL_PLUM, 'plum'],
    ];
    let winningPalKey: string | null = null;
    let winningPalDelta = 0;
    for (const [pp, key] of palPitches) {
      const d = (state.pitchNoteOnCounts.get(pp) ?? 0) - (prevCounts.get(pp) ?? 0);
      if (d > 0) {
        // Highest pitch seen so far wins
        winningPalKey = key;
        winningPalDelta = d;
      }
    }
    if (winningPalKey !== null) {
      // Odd delta = activate, even delta = net no-op (toggle back)
      if (winningPalDelta % 2 === 1) {
        // Toggle: if already this palette → default, otherwise → this palette
        paletteKey.current = paletteKey.current === winningPalKey ? 'default' : winningPalKey;
      }
      // Even delta: pairs cancel out, no change
      needsRebuild = true;
    }

    // Snapshot current counts for next frame comparison
    prevPitchCountsRef.current = new Map(state.pitchNoteOnCounts);

    // === Spiral dot advancement (time-based, every 1/32 note) ===
    if (spiralDots.current.length > 0) {
      const now = performance.now();
      // Duration of a 1/32 note in ms: (60000 / bpm) / 8
      const thirtySecondMs = (60000 / bpm) / 8;
      const elapsed = now - lastSpiralStepTime.current;
      const steps = Math.floor(elapsed / thirtySecondMs);
      if (steps > 0) {
        lastSpiralStepTime.current += steps * thirtySecondMs;
        for (const dot of spiralDots.current) {
          dot.step += steps;
          dot.opacity -= SPIRAL_FADE_PER_STEP * steps;
        }
        // Remove dead or maxed-out dots
        spiralDots.current = spiralDots.current.filter(
          d => d.opacity > 0.01 && d.step < SPIRAL_MAX_STEPS
        );
        needsRebuild = true;
      }
    }

    // === Continuous ink fade (every 1/8th note) ===
    if (inkBlobs.current.length > 0 || crazyInkBlobs.current.length > 0) {
      const now = performance.now();
      const eighthMs = (60000 / bpm) / 2;
      if (lastInkFadeTime.current === 0) lastInkFadeTime.current = now;
      const elapsed = now - lastInkFadeTime.current;
      const ticks = Math.floor(elapsed / eighthMs);
      if (ticks > 0) {
        lastInkFadeTime.current += ticks * eighthMs;
        for (const blob of inkBlobs.current) blob.opacity -= INK_FADE_PER_STEP * ticks;
        for (const blob of crazyInkBlobs.current) blob.opacity -= CRAZY_INK_FADE_PER_STEP * ticks;
        inkBlobs.current = inkBlobs.current.filter(b => b.opacity > 0.01);
        crazyInkBlobs.current = crazyInkBlobs.current.filter(b => b.opacity > 0.01);
        needsRebuild = true;
      }
    }

    // === Snare pattern auto-evolution (every 1/32 note while held) ===
    if (snareEvolveTime.current > 0) {
      const now = performance.now();
      const thirtySecondMs = (60000 / bpm) / 8;
      const elapsed = now - snareEvolveTime.current;
      const ticks = Math.floor(elapsed / thirtySecondMs);
      if (ticks > 0) {
        snareEvolveTime.current += ticks * thirtySecondMs;
        for (let pi = 0; pi < 3; pi++) {
          if (!snareActive.current[pi]) continue;
          snareKickAngle.current[pi] += deg2rad(SNARE_EVOLVE_KICK_STEP) * ticks;
          snareSnareAngle.current[pi] += deg2rad(SNARE_EVOLVE_SNARE_STEP) * ticks;
        }
        needsRebuild = true;
      }
    }

    // === Scale pop & line weight tick advancement (1/16th note grid) ===
    {
      const now = performance.now();
      const sixteenthMs = (60000 / bpm) / 4;

      // Scale pop: advance step each 1/16th tick
      if (scalePopStep.current >= 0 && scalePopStep.current < SCALE_POP_STEPS.length - 1) {
        const elapsed = now - scalePopTickTime.current;
        const ticks = Math.floor(elapsed / sixteenthMs);
        if (ticks > 0) {
          scalePopTickTime.current += ticks * sixteenthMs;
          scalePopStep.current = Math.min(
            scalePopStep.current + ticks,
            SCALE_POP_STEPS.length - 1,
          );
        }
      }

      // Line weight: count down ticks each 1/16th
      if (lineWeightTicks.current > 0) {
        const elapsed = now - lineWeightTickTime.current;
        const ticks = Math.floor(elapsed / sixteenthMs);
        if (ticks > 0) {
          lineWeightTickTime.current += ticks * sixteenthMs;
          lineWeightTicks.current = Math.max(0, lineWeightTicks.current - ticks);
          needsRebuild = true;
        }
      }
    }

    if (needsRebuild) {
      buildScene(p);
    }

    // Apply scale pop directly on root (no rebuild needed)
    if (root && scalePopStep.current >= 0) {
      const s = SCALE_POP_STEPS[scalePopStep.current];
      root.scale.set(s, s, 1);
    }

    // Decay glow pulse (~150ms fade at 60fps)
    if (glowOpacity.current > 0) {
      glowOpacity.current = Math.max(0, glowOpacity.current - 0.025);
      if (glowMeshRef.current) {
        (glowMeshRef.current.material as THREE.MeshBasicMaterial).opacity = glowOpacity.current;
      }
    }

    // === Sustained displacement effects (wave & warp) ===
    const vw = viewport.width;
    let waveTarget = 0;
    let waveFreqTarget = waveFreqSmooth.current;
    let warpTarget = 0;
    let warpFoldTarget = warpFoldSmooth.current;

    // Scan activeNotes for wave pitches
    for (let p = PITCH_WAVE_MIN; p <= PITCH_WAVE_MAX; p++) {
      const note = state.activeNotes.get(p);
      if (note) {
        const t = (p - PITCH_WAVE_MIN) / (PITCH_WAVE_MAX - PITCH_WAVE_MIN);
        waveFreqTarget = WAVE_FREQ_MIN + t * (WAVE_FREQ_MAX - WAVE_FREQ_MIN);
        waveTarget = (note.velocity / 127) * WAVE_AMP_SCALE * vw;
        break; // first active note wins
      }
    }

    // Scan activeNotes for warp pitches — pitch maps to harmonic complexity
    for (let p = PITCH_WARP_MIN; p <= PITCH_WARP_MAX; p++) {
      const note = state.activeNotes.get(p);
      if (note) {
        const t = (p - PITCH_WARP_MIN) / (PITCH_WARP_MAX - PITCH_WARP_MIN);
        warpFoldTarget = WARP_FOLD_MIN + t * (WARP_FOLD_MAX - WARP_FOLD_MIN);
        warpTarget = (note.velocity / 127) * WARP_AMP_SCALE * vw;
        break;
      }
    }

    // Smooth amplitude & frequency toward targets
    waveAmpSmooth.current += (waveTarget - waveAmpSmooth.current) * EFFECT_LERP;
    waveFreqSmooth.current += (waveFreqTarget - waveFreqSmooth.current) * EFFECT_LERP;
    warpAmpSmooth.current += (warpTarget - warpAmpSmooth.current) * EFFECT_LERP;
    warpFoldSmooth.current += (warpFoldTarget - warpFoldSmooth.current) * EFFECT_LERP;

    const wa = waveAmpSmooth.current;
    const wf = waveFreqSmooth.current;
    const xa = warpAmpSmooth.current;
    const N = warpFoldSmooth.current; // fold symmetry order (3–8, continuous)
    const anyDisplace = wa > 0.0001 || xa > 0.0001;

    if (anyDisplace) {
      const time = performance.now() * 0.001;
      const ts = time * WARP_BASE_SPEED;
      for (const dg of displaceRef.current) {
        const pos = dg.attr.array as Float32Array;
        const base = dg.base;
        const count = base.length / 3;
        for (let i = 0; i < count; i++) {
          const bx = base[i * 3];
          const by = base[i * 3 + 1];
          let dx = 0, dy = 0;

          // Ink-on-water: slow cross-axis sine displacement
          if (wa > 0.0001) {
            dx += Math.sin(by * wf + time * WAVE_SPEED) * wa;
            dy += Math.sin(bx * wf * 1.3 + time * WAVE_SPEED * 0.7) * wa;
          }

          // Warp field: N-fold polar symmetry (N = 3–8 from pitch, continuous)
          // Each pitch creates a mathematically distinct radial pattern
          if (xa > 0.0001) {
            const r = Math.sqrt(bx * bx + by * by) + 0.001;
            const theta = Math.atan2(by, bx);
            const cosT = bx / r;
            const sinT = by / r;

            // Primary N-fold radial pattern — defines the symmetry
            let dr = Math.sin(N * theta + ts * 1.3) * Math.cos(r * 3.0 + ts);
            // Concentric ripple modulated by the same N-fold
            dr += 0.5 * Math.sin(r * N + ts * 0.7) * Math.cos(N * theta - ts * 0.9);
            // 2N harmonic — doubles the petal count, creates inner detail
            dr += 0.35 * Math.sin(2 * N * theta - ts * 1.1) * Math.sin(r * 4.0 + ts * 1.5);

            // Tangential: N-1 fold swirl (interference between N and N-1 = slow rotation)
            let dt = 0.4 * Math.sin((N - 1) * theta + ts * 0.8) * Math.cos(r * 2.0 + ts * 1.2);
            // Counter-rotating N+1 fold for spirograph interference
            dt += 0.25 * Math.cos((N + 1) * theta - ts) * Math.sin(r * 3.5 - ts * 0.6);

            dx += (dr * cosT - dt * sinT) * xa;
            dy += (dr * sinT + dt * cosT) * xa;
          }

          pos[i * 3] = bx + dx;
          pos[i * 3 + 1] = by + dy;
        }
        dg.attr.needsUpdate = true;
      }
    }
  });

  useEffect(() => {
    return () => clearScene();
  }, []);

  return <group ref={rootRef} />;
}

export const MetronomeBalls: Instrument = {
  id: 'metronomeBalls',
  name: 'Metronome Balls',
  description: 'Generative line-drawing patterns driven by drum MIDI input — three panels with a rotating background flower',
  icon: '◉',
  color: '#1a2744',
  hasAudio: false,
  hasVisual: true,
  disableBloom: true,
  editorType: 'generic',
  noteRange: { min: PITCH_FG, max: PITCH_SNARE_R }, // C3–F#6
  rangeLabels: [
    { startPitch: PITCH_FG, endPitch: PITCH_FG, label: 'Foreground' },
    { startPitch: PITCH_BG, endPitch: PITCH_BG, label: 'Background' },
    { startPitch: PITCH_GLOW, endPitch: PITCH_GLOW, label: 'Glow' },
    { startPitch: PITCH_INK, endPitch: PITCH_INK, label: 'Ink Dots' },
    { startPitch: PITCH_INVERT, endPitch: PITCH_INVERT, label: 'Invert' },
    { startPitch: PITCH_PAL_SEPIA, endPitch: PITCH_PAL_SEPIA, label: 'Sepia' },
    { startPitch: PITCH_PAL_MIDNIGHT, endPitch: PITCH_PAL_MIDNIGHT, label: 'Midnight' },
    { startPitch: PITCH_PAL_BOTANICAL, endPitch: PITCH_PAL_BOTANICAL, label: 'Botanical' },
    { startPitch: PITCH_PAL_PLUM, endPitch: PITCH_PAL_PLUM, label: 'Plum' },
    { startPitch: PITCH_WAVE_MIN, endPitch: PITCH_WAVE_MAX, label: 'Ink Wave' },
    { startPitch: PITCH_WARP_MIN, endPitch: PITCH_WARP_MAX, label: 'Warp Field' },
    { startPitch: PITCH_SPIRAL, endPitch: PITCH_SPIRAL, label: 'Spiral' },
    { startPitch: PITCH_CRAZY_INK, endPitch: PITCH_CRAZY_INK, label: 'Crazy Ink' },
    { startPitch: PITCH_SCALE_POP, endPitch: PITCH_SCALE_POP, label: 'Scale Pop' },
    { startPitch: PITCH_LINE_WEIGHT, endPitch: PITCH_LINE_WEIGHT, label: 'Line Weight' },
    { startPitch: PITCH_SNARE_L, endPitch: PITCH_SNARE_L, label: 'Snare L' },
    { startPitch: PITCH_SNARE_C, endPitch: PITCH_SNARE_C, label: 'Snare C' },
    { startPitch: PITCH_SNARE_R, endPitch: PITCH_SNARE_R, label: 'Snare R' },
  ],

  defaultSettings: {
    balls: DEFAULTS.balls,
    kickStart: DEFAULTS.kickStart,
    snareStart: DEFAULTS.snareStart,
    kickStep: DEFAULTS.kickStep,
    snareStep: DEFAULTS.snareStep,
    speed: DEFAULTS.speed,
    dotSize: DEFAULTS.dotSize,
    lineOpacity: DEFAULTS.lineOpacity,
    fgMultiplier: DEFAULTS.fgMultiplier,
    bgMultiplier: DEFAULTS.bgMultiplier,
  },

  settingsSchema: {
    balls: { type: 'number', label: 'Balls', min: 1, max: 80, step: 1, default: DEFAULTS.balls },
    kickStart: { type: 'number', label: 'Kick Start (°)', min: 1, max: 180, step: 1, default: DEFAULTS.kickStart },
    snareStart: { type: 'number', label: 'Snare Start (°)', min: 1, max: 180, step: 1, default: DEFAULTS.snareStart },
    kickStep: { type: 'number', label: 'Kick Step (°)', min: -10, max: 10, step: 0.1, default: DEFAULTS.kickStep },
    snareStep: { type: 'number', label: 'Snare Step (°)', min: -10, max: 10, step: 0.1, default: DEFAULTS.snareStep },
    speed: { type: 'number', label: 'Speed', min: 0.5, max: 8, step: 0.1, default: DEFAULTS.speed },
    dotSize: { type: 'number', label: 'Dot Size', min: 0.5, max: 8, step: 0.5, default: DEFAULTS.dotSize },
    lineOpacity: { type: 'number', label: 'Line Opacity', min: 0.02, max: 0.6, step: 0.02, default: DEFAULTS.lineOpacity },
    fgMultiplier: { type: 'number', label: 'FG Multiplier', min: 0.1, max: 10, step: 0.1, default: DEFAULTS.fgMultiplier },
    bgMultiplier: { type: 'number', label: 'BG Multiplier', min: 0.1, max: 20, step: 0.1, default: DEFAULTS.bgMultiplier },
  },

  VisualComponent: MetronomeBallsVisual,
};
