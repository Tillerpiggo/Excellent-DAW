'use client';

import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getVisualPlaybackEngine } from '@/core/visualPlayback';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { Instrument } from '../types';
import { createDisplacementUniforms, type DisplacementUniforms } from '@/lib/three/displacementShader';
import { hexToHsl } from '@/core/colorPalette';
import { virtualClock } from '@/core/virtualClock';

interface Props {
  trackId: string;
}

// --- Geometry helpers ---

function gcd(a: number, b: number): number {
  let x = Math.round(a * 10000);
  let y = Math.round(b * 10000);
  while (y) { const t = y; y = x % y; x = t; }
  return x / 10000;
}

const geometryCache = new Map<string, THREE.BufferGeometry>();

function evictCache() {
  if (geometryCache.size > 300) {
    const iter = geometryCache.keys();
    for (let i = 0; i < 80; i++) {
      const k = iter.next().value;
      if (k) {
        geometryCache.get(k)?.dispose();
        geometryCache.delete(k);
      }
    }
  }
}

// Regular polygon (N-gon)
function getPolygonGeometry(sides: number): THREE.BufferGeometry {
  const key = `poly_${sides}`;
  let geo = geometryCache.get(key);
  if (geo) return geo;

  const positions = new Float32Array(sides * 3);
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    positions[i * 3] = Math.cos(angle);
    positions[i * 3 + 1] = Math.sin(angle);
    positions[i * 3 + 2] = 0;
  }
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometryCache.set(key, geo);
  return geo;
}

// Polar graph: r = cos(k*theta) + offset
function getPolarGeometry(petals: number, offset: number): THREE.BufferGeometry {
  const oQ = Math.round(offset * 100) / 100;
  const key = `polar_${petals}_${oQ}`;
  let geo = geometryCache.get(key);
  if (geo) return geo;

  const segments = 256;
  const tMax = Math.PI * 2;
  const positions = new Float32Array(segments * 3);
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * tMax;
    const r = Math.cos(petals * theta) + oQ;
    positions[i * 3] = r * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(theta);
    positions[i * 3 + 2] = 0;
  }
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometryCache.set(key, geo);
  evictCache();
  return geo;
}

// Spirograph (hypotrochoid)
function getSpirographGeometry(petals: number, r: number, d: number): THREE.BufferGeometry {
  const rQ = Math.round(r * 100) / 100;
  const dQ = Math.round(d * 100) / 100;
  const key = `spiro_${petals}_${rQ}_${dQ}`;

  let geo = geometryCache.get(key);
  if (geo) return geo;

  const R = 1;
  const innerR = rQ;
  const segments = 256;
  const revolutions = Math.max(1, Math.round(innerR / gcd(R, innerR)));
  const tMax = revolutions * Math.PI * 2;

  const positions = new Float32Array(segments * 3);
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * tMax;
    const x = (R - innerR) * Math.cos(t) + dQ * Math.cos(((R - innerR) / innerR) * t);
    const y = (R - innerR) * Math.sin(t) - dQ * Math.sin(((R - innerR) / innerR) * t);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = 0;
  }

  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometryCache.set(key, geo);
  evictCache();
  return geo;
}

type ShapeMode = 'spirograph' | 'polygon' | 'polar';
type BurstMode = 'noisy' | 'linear' | 'spiralOut' | 'spiralIn';

function getShapeGeometry(mode: ShapeMode, petals: number, r: number, d: number): THREE.BufferGeometry {
  switch (mode) {
    case 'polygon':
      return getPolygonGeometry(petals);
    case 'polar':
      return getPolarGeometry(petals, d);
    case 'spirograph':
    default:
      return getSpirographGeometry(petals, r, d);
  }
}

// --- Pooled LineLoop ---

interface PooledLineLoop {
  lineLoop: THREE.LineLoop;
  material: THREE.LineBasicMaterial;
  active: boolean;
}

const _tmpColor = new THREE.Color();
const _pulseColor = new THREE.Color();
const _tangent = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);

// Pitch routing:
// 0-5:   wave wobble (ink-on-water displacement)
// 6-11:  warp wobble (N-fold polar displacement)
// 12-23: shake triggers
// 24-35: color pulse triggers
// 36+:   shape spawners
const WAVE_PITCH_MIN = 0;
const WAVE_PITCH_MAX = 5;
const WARP_PITCH_MIN = 6;
const WARP_PITCH_MAX = 11;
const SHAKE_PITCH_MIN = 12;
const SHAKE_PITCH_MAX = 23;
const PULSE_PITCH_MIN = 24;
const PULSE_PITCH_MAX = 35;
const SHAPE_PITCH_MIN = 36;
const SHAPE_PITCH_MAX = 84;
const GLOW_PITCH_MIN = 85;
const GLOW_PITCH_MAX = 96;

// Wobble defaults
const WAVE_FREQ_MIN = 2.0;
const WAVE_FREQ_MAX = 14.0;
const WAVE_SPEED = 1.8;
const WARP_FOLD_MIN = 3.0;
const WARP_FOLD_MAX = 8.0;
const EFFECT_LERP = 0.08;

// GLSL displacement chunk injected into LineBasicMaterial
const DISPLACEMENT_CHUNK = /* glsl */ `
  // Ink-on-water: cross-axis sine displacement
  if (uWaveAmp > 0.0001) {
    transformed.x += sin(transformed.y * uWaveFreq + uTime * uWaveSpeed) * uWaveAmp;
    transformed.y += sin(transformed.x * uWaveFreq * 1.3 + uTime * uWaveSpeed * 0.7) * uWaveAmp;
  }

  // Warp field: N-fold polar symmetry with multiple harmonics
  if (uWarpAmp > 0.0001) {
    float r = length(transformed.xy) + 0.001;
    float theta = atan(transformed.y, transformed.x);
    float cosT = transformed.x / r;
    float sinT = transformed.y / r;
    float N = uWarpFold;
    float ts = uTime * 0.6;

    float dr = sin(N * theta + ts * 1.3) * cos(r * 3.0 + ts);
    dr += 0.5 * sin(r * N + ts * 0.7) * cos(N * theta - ts * 0.9);
    dr += 0.35 * sin(2.0 * N * theta - ts * 1.1) * sin(r * 4.0 + ts * 1.5);

    float dt = 0.4 * sin((N - 1.0) * theta + ts * 0.8) * cos(r * 2.0 + ts * 1.2);
    dt += 0.25 * cos((N + 1.0) * theta - ts) * sin(r * 3.5 - ts * 0.6);

    transformed.x += (dr * cosT - dt * sinT) * uWarpAmp;
    transformed.y += (dr * sinT + dt * cosT) * uWarpAmp;
  }
`;

/** Inject displacement uniforms + vertex code into a LineBasicMaterial */
function injectDisplacement(mat: THREE.LineBasicMaterial, uniforms: DisplacementUniforms) {
  mat.onBeforeCompile = (shader) => {
    // Add shared uniforms by reference
    shader.uniforms.uWaveAmp = uniforms.uWaveAmp;
    shader.uniforms.uWaveFreq = uniforms.uWaveFreq;
    shader.uniforms.uWaveSpeed = uniforms.uWaveSpeed;
    shader.uniforms.uWarpAmp = uniforms.uWarpAmp;
    shader.uniforms.uWarpFold = uniforms.uWarpFold;
    shader.uniforms.uTime = uniforms.uTime;

    // Inject uniform declarations
    shader.vertexShader = `
      uniform float uWaveAmp;
      uniform float uWaveFreq;
      uniform float uWaveSpeed;
      uniform float uWarpAmp;
      uniform float uWarpFold;
      uniform float uTime;
    ` + shader.vertexShader;

    // Inject displacement after begin_vertex (where `transformed` is defined)
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n' + DISPLACEMENT_CHUNK,
    );
  };
}

function ShapeFlightVisual({ trackId }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const engineRef = useRef(getVisualPlaybackEngine());
  const poolRef = useRef<PooledLineLoop[]>([]);
  // Accumulated rotation: integrates rotationStep over time so automation
  // changes are continuous (only changes the rate, never jumps).
  const accRotationRef = useRef(0);
  const lastBeatRef = useRef(-1);
  // Accumulated hue offset — pulse events permanently jump this forward
  const accHueOffsetRef = useRef(0);
  const lastPulseCountRef = useRef(0);
  // Displacement (wobble) uniforms — shared by reference across all pooled materials
  const displUniformsRef = useRef<DisplacementUniforms>(createDisplacementUniforms());
  // Smooth interpolation targets for wobble
  const waveAmpSmooth = useRef(0);
  const waveFreqSmooth = useRef(WAVE_FREQ_MIN);
  const warpAmpSmooth = useRef(0);
  const warpFoldSmooth = useRef(WARP_FOLD_MIN);

  // Cleanup on unmount
  useEffect(() => () => {
    const g = groupRef.current;
    if (g) {
      for (const p of poolRef.current) {
        g.remove(p.lineLoop);
        p.material.dispose();
      }
    }
    poolRef.current = [];
  }, []);

  // Acquire a pooled LineLoop (or create a new one)
  function acquireLineLoop(group: THREE.Group): PooledLineLoop {
    for (const p of poolRef.current) {
      if (!p.active) {
        p.active = true;
        p.lineLoop.visible = true;
        return p;
      }
    }
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    material.blending = THREE.AdditiveBlending;
    material.fog = false;
    injectDisplacement(material, displUniformsRef.current);
    const lineLoop = new THREE.LineLoop(new THREE.BufferGeometry(), material);
    group.add(lineLoop);
    const entry: PooledLineLoop = { lineLoop, material, active: true };
    poolRef.current.push(entry);
    return entry;
  }

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const engine = engineRef.current;
    const vs = engine.getTrackState(trackId);
    if (!vs) return;

    const events = engine.getTrackEvents(trackId);
    if (!events || events.length === 0) return;

    const hasPalette = vs.activePalette !== null;
    const par = vs.params;
    const speed         = (par.speed as number)         ?? 12;
    const spread        = (par.spread as number)        ?? 0;
    const farZ          = (par.farZ as number)          ?? 40;
    const shapeSize     = (par.shapeSize as number)     ?? 0.4;
    const hueStep       = (par.hueStep as number)       ?? 0.08;
    const baseHue       = (par.baseHue as number)       ?? 0.55;
    const saturation    = (par.saturation as number)    ?? 0.9;
    const lightness     = (par.lightness as number)     ?? 0.85;
    const rotationStep  = (par.rotationStep as number)  ?? 0.15;
    const rBase         = (par.rBase as number)         ?? 0.25;
    const dBase         = (par.dBase as number)         ?? 0.7;
    const shapeMode     = (par.shapeMode as ShapeMode)  ?? 'spirograph';
    const spawnRateDefault = (par.spawnRate as number)  ?? 8;
    const scaleDefault  = (par.scale as number)         ?? 1;
    const fadeOutZ      = (par.fadeOutZ as number)       ?? 10;
    const pulseSpeed    = (par.pulseSpeed as number)     ?? 200;
    const pulseDuration = (par.pulseDuration as number)  ?? 0.4;
    const pulseHue      = (par.pulseHue as number)       ?? 0.1;
    const shakeAmount   = (par.shakeAmount as number)    ?? 0.5;
    const shakeDecaySpd = (par.shakeDecay as number)     ?? 20;
    const shakeScale    = (par.shakeScale as number)     ?? 0.5;
    const burstMode     = (par.burstMode as BurstMode)   ?? 'noisy';
    const burstRadius   = (par.burstRadius as number)    ?? 3;
    const burstTwists   = (par.burstTwists as number)    ?? 4;
    const curveXDefault = (par.curveX as number)         ?? 0;
    const curveYDefault = (par.curveY as number)         ?? 0;
    const wobbleAmpScale = (par.wobbleAmp as number)     ?? 0.15;
    const warpAmpScale   = (par.warpAmp as number)       ?? 0.25;
    const glowAmount     = (par.glowAmount as number)    ?? 1;
    const glowPulseAmt   = (par.glowPulseAmount as number) ?? 3;
    const glowPulseDecay = (par.glowPulseDecay as number)  ?? 8;
    const approachGrowth = (par.approachGrowth as number)  ?? 0;

    const currentBeat = useUIStore.getState().currentBeat;
    const bpm = useProjectStore.getState().project.bpm;
    const secPerBeat = 60 / bpm;

    // Accumulate rotation: integrate rotationStep over beat deltas.
    // This way automation curves only change the rate — no discontinuities.
    const prevBeat = lastBeatRef.current;
    if (prevBeat >= 0) {
      const beatDelta = currentBeat - prevBeat;
      // Only accumulate for forward playback (small positive deltas).
      // On scrub/seek (large jumps), keep current accumulated value.
      if (beatDelta > 0 && beatDelta < 2) {
        accRotationRef.current += rotationStep * beatDelta;
      }
    }
    lastBeatRef.current = currentBeat;

    // --- Collect effect events (pulse + shake) ---
    // We scan events once to separate shape events from effect triggers.
    // Effect events only matter if they started recently (within a time window).
    const pulseWindow = pulseDuration + farZ / pulseSpeed; // max time a pulse can still be visible
    interface PulseEvent { startSec: number; velocity: number; pitch: number; }
    interface ShakeEvent { startSec: number; velocity: number; }
    const activePulses: PulseEvent[] = [];
    const activeShakes: ShakeEvent[] = [];
    let pulseTotal = 0; // total pulse events that have started <= currentBeat

    // Wobble targets (best match from currently-held notes)
    let waveTarget = 0;
    let waveFreqTarget = waveFreqSmooth.current;
    let warpTarget = 0;
    let warpFoldTarget = warpFoldSmooth.current;

    // Glow pulse: accumulate boost from recent glow onsets
    let glowPulseBoost = 0;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      // Skip shape pitches (handled separately below)
      if (ev.pitch >= SHAPE_PITCH_MIN && ev.pitch <= SHAPE_PITCH_MAX) continue;

      const timeSinceBeats = currentBeat - ev.startTimeInBeats;
      const timeSinceSec = timeSinceBeats * secPerBeat;
      if (timeSinceSec < 0) continue; // hasn't started yet

      // Wobble: wave (0-5) and warp (6-11) — active while note is held
      if (ev.pitch <= WARP_PITCH_MAX) {
        const noteDurSec = ev.duration * secPerBeat;
        if (timeSinceSec <= noteDurSec) {
          if (ev.pitch <= WAVE_PITCH_MAX) {
            const t = (ev.pitch - WAVE_PITCH_MIN) / Math.max(1, WAVE_PITCH_MAX - WAVE_PITCH_MIN);
            waveFreqTarget = WAVE_FREQ_MIN + t * (WAVE_FREQ_MAX - WAVE_FREQ_MIN);
            waveTarget = (ev.velocity / 127) * wobbleAmpScale;
          } else {
            const t = (ev.pitch - WARP_PITCH_MIN) / Math.max(1, WARP_PITCH_MAX - WARP_PITCH_MIN);
            warpFoldTarget = WARP_FOLD_MIN + t * (WARP_FOLD_MAX - WARP_FOLD_MIN);
            warpTarget = (ev.velocity / 127) * warpAmpScale;
          }
        }
        continue;
      }

      if (ev.pitch < SHAKE_PITCH_MIN) continue;

      if (ev.pitch <= SHAKE_PITCH_MAX) {
        // Shake trigger
        if (timeSinceSec < 0.5) { // shakes are always short-lived
          activeShakes.push({ startSec: timeSinceSec, velocity: ev.velocity });
        }
      } else if (ev.pitch <= PULSE_PITCH_MAX) {
        pulseTotal++;
        // Color pulse trigger
        if (timeSinceSec < pulseWindow) {
          activePulses.push({ startSec: timeSinceSec, velocity: ev.velocity, pitch: ev.pitch });
        }
      } else if (ev.pitch >= GLOW_PITCH_MIN && ev.pitch <= GLOW_PITCH_MAX) {
        // Glow pulse: exponential decay envelope from onset
        const glowDecay = Math.exp(-timeSinceSec * glowPulseDecay);
        if (glowDecay > 0.005) {
          glowPulseBoost += (ev.velocity / 127) * glowPulseAmt * glowDecay;
        }
      }
    }

    // Permanently jump accumulated hue offset for each new pulse event
    // Skip when a color palette is active — palette owns the hue
    const prevPulseCount = lastPulseCountRef.current;
    if (!hasPalette) {
      if (pulseTotal > prevPulseCount) {
        accHueOffsetRef.current += (pulseTotal - prevPulseCount) * pulseHue;
      } else if (pulseTotal < prevPulseCount) {
        // Seek/rewind: recount
        accHueOffsetRef.current = pulseTotal * pulseHue;
      }
    }
    lastPulseCountRef.current = pulseTotal;

    // --- Shake: apply jitter to the whole group + scale bump ---
    let shakeX = 0, shakeY = 0;
    let shakeScaleBump = 0;
    for (let si = 0; si < activeShakes.length; si++) {
      const s = activeShakes[si];
      const decay = Math.exp(-s.startSec * shakeDecaySpd);
      const intensity = (s.velocity / 127) * shakeAmount * decay;
      // High-frequency oscillation with two incommensurate frequencies for organic feel
      shakeX += Math.sin(s.startSec * 80 + si * 1.7) * intensity;
      shakeY += Math.cos(s.startSec * 97 + si * 2.3) * intensity;
      // Scale bump: sudden increase that decays quickly
      shakeScaleBump += (s.velocity / 127) * shakeScale * decay;
    }
    group.position.set(shakeX, shakeY, 0);

    // --- Wobble: smooth lerp and update displacement uniforms ---
    waveAmpSmooth.current += (waveTarget - waveAmpSmooth.current) * EFFECT_LERP;
    waveFreqSmooth.current += (waveFreqTarget - waveFreqSmooth.current) * EFFECT_LERP;
    warpAmpSmooth.current += (warpTarget - warpAmpSmooth.current) * EFFECT_LERP;
    warpFoldSmooth.current += (warpFoldTarget - warpFoldSmooth.current) * EFFECT_LERP;

    const du = displUniformsRef.current;
    du.uWaveAmp.value = waveAmpSmooth.current;
    du.uWaveFreq.value = waveFreqSmooth.current;
    du.uWaveSpeed.value = WAVE_SPEED;
    du.uWarpAmp.value = warpAmpSmooth.current;
    du.uWarpFold.value = warpFoldSmooth.current;
    du.uTime.value = virtualClock.now() * 0.001;

    // Mark all pool entries as inactive
    for (const p of poolRef.current) {
      p.active = false;
      p.lineLoop.visible = false;
    }

    // Build palette gradient stops when a color palette is active
    // Use primary → secondary → accent → highlight for full palette coverage
    const _paletteStops: { t: number; h: number; s: number; l: number }[] = [];
    if (hasPalette && vs.activePalette) {
      const p = vs.activePalette;
      const pri = hexToHsl(p.primary);
      const sec = hexToHsl(p.secondary);
      const acc = hexToHsl(p.accent);
      const hlt = hexToHsl(p.highlight);
      _paletteStops.push(
        { t: 0,    h: pri.h, s: pri.s, l: pri.l },
        { t: 0.33, h: sec.h, s: sec.s, l: sec.l },
        { t: 0.66, h: acc.h, s: acc.s, l: acc.l },
        { t: 1,    h: hlt.h, s: hlt.s, l: hlt.l },
      );
    }

    // For each MIDI note, spawn copies at regular intervals during its duration.
    // Each copy has a fixed rotation offset, creating apparent rotation as they fly by.
    // The dissolve point (z ~ 0) is synced to the note onset.
    let shapeIdx = 0; // running index for shape events only (for hue/spread)
    for (let ei = 0; ei < events.length; ei++) {
      const ev = events[ei];

      // Skip effect pitches
      if (ev.pitch < SHAPE_PITCH_MIN) continue;

      // Derive shape from pitch
      const petals = Math.min(Math.max(ev.pitch - 45, 3), 20);
      // Derive spirograph r/d from pitch (deterministic per-pitch shape)
      const pitchNorm = (ev.pitch % 24) / 24;
      const r = rBase + pitchNorm * 0.3;
      const d = dBase + pitchNorm * 0.25;

      // Per-note angular spacing between copies: derived from pitch so each
      // note has a visually distinct copy spread. This is a fixed geometric
      // property, not the rotation speed (which is handled by accRotationRef).
      const copySpacing = 0.1 * (0.5 + (ev.pitch % 12) / 12 * 1.5);

      // Sample spawnRate at note onset — determines copy count for this note's lifetime
      const noteSpawnRate = engine.getParamAtBeat(trackId, 'spawnRate', ev.startTimeInBeats, spawnRateDefault);
      const spawnInterval = 1 / noteSpawnRate;
      const noteEnd = ev.startTimeInBeats + ev.duration;
      const numCopies = Math.floor(ev.duration * noteSpawnRate);

      // Color for this note
      let hue: number;
      let sat: number;
      let lit: number;
      if (hasPalette) {
        // Sample across the full palette gradient based on shape index
        const paletteColors = _paletteStops;
        const t = (shapeIdx * 0.35) % 1; // spread shapes across palette
        // Find the two surrounding stops and lerp
        let lo = 0;
        for (let si = 0; si < paletteColors.length - 1; si++) {
          if (t >= paletteColors[si].t) lo = si;
        }
        const hi = Math.min(lo + 1, paletteColors.length - 1);
        const seg = paletteColors[hi].t - paletteColors[lo].t;
        const frac = seg > 0 ? (t - paletteColors[lo].t) / seg : 0;
        // Shortest-path hue interpolation (hue is circular 0-1)
        let dh = paletteColors[hi].h - paletteColors[lo].h;
        if (dh > 0.5) dh -= 1;
        else if (dh < -0.5) dh += 1;
        hue = (paletteColors[lo].h + dh * frac + 1) % 1;
        sat = paletteColors[lo].s + (paletteColors[hi].s - paletteColors[lo].s) * frac;
        lit = paletteColors[lo].l + (paletteColors[hi].l - paletteColors[lo].l) * frac;
      } else {
        hue = (baseHue + shapeIdx * hueStep + accHueOffsetRef.current) % 1;
        sat = saturation;
        lit = lightness;
      }
      _tmpColor.setHSL(hue, sat, lit);

      // Spread: deterministic per-event
      const spreadX = spread > 0 ? (Math.sin(shapeIdx * 7.31 + 0.5) * spread) : 0;
      const spreadY = spread > 0 ? (Math.cos(shapeIdx * 13.17 + 0.3) * spread) : 0;

      const geo = getShapeGeometry(shapeMode, petals, r, d);

      for (let ci = 0; ci <= numCopies; ci++) {
        const copyBeat = ev.startTimeInBeats + ci * spawnInterval;
        if (copyBeat > noteEnd) break;

        // z position: how far this copy is from the dissolve point (z=0 at copyBeat == currentBeat)
        const beatsAgo = currentBeat - copyBeat;
        const secondsAgo = beatsAgo * secPerBeat;
        const z = secondsAgo * speed;

        // Visibility: approaching from -farZ, fades out after passing camera
        if (z < -farZ || z > fadeOutZ) continue;

        const pooled = acquireLineLoop(group);
        pooled.lineLoop.geometry = geo;

        // Approach progress: 0 at far end, 1 at camera (z=0)
        const approachProgress = 1 - Math.max(0, -z) / farZ;

        // --- Burst mode: compute x/y offset based on trajectory style ---
        let bx = spreadX;
        let by = spreadY;

        // Deterministic angle per copy: golden-angle spacing for even distribution
        const goldenAngle = 2.399963; // pi * (3 - sqrt(5))
        const copyAngle = ci * goldenAngle + shapeIdx * 1.618;

        if (burstMode === 'linear') {
          // Radial burst: copies fan outward in straight lines from center
          const radius = approachProgress * burstRadius;
          bx = Math.cos(copyAngle) * radius;
          by = Math.sin(copyAngle) * radius;
        } else if (burstMode === 'spiralOut') {
          // Conical helix outward: radius grows while angle winds with burstTwists
          const radius = approachProgress * burstRadius;
          const windAngle = copyAngle + approachProgress * burstTwists * Math.PI * 2;
          // Add 3D spherical rose: modulate radius with sin for organic shape
          const theta = approachProgress * Math.PI;
          const roseR = radius * (0.5 + 0.5 * Math.sin(burstTwists * theta));
          bx = roseR * Math.cos(windAngle);
          by = roseR * Math.sin(windAngle);
        } else if (burstMode === 'spiralIn') {
          // Converging spiral: starts spread out, spirals inward toward camera
          // Uses 3D spherical rose curve for a sick converging effect
          const invProgress = 1 - approachProgress;
          const phi = copyAngle + approachProgress * burstTwists * Math.PI * 2;
          const theta = approachProgress * Math.PI * 0.8;
          // Rose petals: r = cos(k*phi) gives k-petal pattern
          const rosePetals = Math.max(2, Math.round(burstTwists));
          const roseModulation = 0.6 + 0.4 * Math.cos(rosePetals * phi);
          const radius = invProgress * burstRadius * roseModulation;
          bx = radius * Math.sin(theta) * Math.cos(phi);
          by = radius * Math.sin(theta) * Math.sin(phi);
        }
        // else 'noisy': use spreadX/spreadY as-is (default)

        // --- Curved flight path ---
        // Sample curveX/curveY at this copy's spawn beat so MIDI can automate them
        const cvx = engine.getParamAtBeat(trackId, 'curveX', copyBeat, curveXDefault);
        const cvy = engine.getParamAtBeat(trackId, 'curveY', copyBeat, curveYDefault);

        // Quadratic ease: offset = curve * (1 - t)^2, where t = approachProgress
        // At t=0 (far end) offset = full curve, at t=1 (camera) offset = 0
        const invT = 1 - approachProgress;
        const curveOffsetX = cvx * invT * invT;
        const curveOffsetY = cvy * invT * invT;

        pooled.lineLoop.position.set(bx + curveOffsetX, by + curveOffsetY, z);

        // Scale: sample scale param at this copy's spawn beat, then grow as it approaches
        const copyScale = engine.getParamAtBeat(trackId, 'scale', copyBeat, scaleDefault);
        const baseScale = shapeSize * copyScale;
        const finalScale = baseScale * (1 + approachProgress * approachGrowth) * (1 + shakeScaleBump);
        pooled.lineLoop.scale.setScalar(finalScale);

        // Orient shape tangent to the curved path.
        // Path derivatives: dx/dt = -2*cvx*(1-t), dy/dt = -2*cvy*(1-t), dz/dt = farZ
        // (t increases as shape approaches camera, z goes from -farZ to 0)
        if (cvx !== 0 || cvy !== 0) {
          _tangent.set(-2 * cvx * invT, -2 * cvy * invT, farZ).normalize();
          // Rotate shape so its local +z aligns with the tangent direction
          _quat.setFromUnitVectors(_zAxis, _tangent);
          pooled.lineLoop.quaternion.copy(_quat);
          // Apply spin rotation on top (around the tangent axis = local z after reorientation)
          pooled.lineLoop.rotateZ(accRotationRef.current + ci * copySpacing);
        } else {
          // No curve: use simple z rotation as before
          pooled.lineLoop.quaternion.identity();
          pooled.lineLoop.rotation.z = accRotationRef.current + ci * copySpacing;
        }

        // --- Color pulse: propagating wavefront from z=0 outward ---
        let pulseBlend = 0;
        for (let pi = 0; pi < activePulses.length; pi++) {
          const pulse = activePulses[pi];
          const distFromCamera = Math.max(0, -z);
          const travelTime = distFromCamera / pulseSpeed;
          const timeSinceArrival = pulse.startSec - travelTime;
          if (timeSinceArrival >= 0 && timeSinceArrival < pulseDuration) {
            const norm = timeSinceArrival / pulseDuration;
            const envelope = Math.exp(-norm * 3);
            // Pitch controls brightness: lower pitches (24) = dim, higher (35) = full
            const pitchNorm = (pulse.pitch - PULSE_PITCH_MIN) / (PULSE_PITCH_MAX - PULSE_PITCH_MIN);
            const pitchIntensity = 0.15 + pitchNorm * 0.85; // range [0.15 .. 1.0]
            // Fade with distance: full intensity at camera, dies off toward far end
            const distanceFade = 1 - distFromCamera / farZ;
            const intensity = envelope * distanceFade * pitchIntensity * (pulse.velocity / 127);
            pulseBlend = Math.min(1, pulseBlend + intensity);
          }
        }

        // Glow: push lightness to white and HDR-multiply for searing bloom
        // Decay glow with distance — full glow at camera, base brightness at far end
        const shapeLit = hasPalette ? lit : lightness;
        const shapeSat = hasPalette ? sat : saturation;
        const glowLightness = shapeLit + pulseBlend * (1 - shapeLit);
        const fullGlow = (1 + pulseBlend * 25) * (glowAmount + glowPulseBoost);
        const glowBoost = 1 + (fullGlow - 1) * approachProgress;
        _tmpColor.setHSL(hue, shapeSat * (1 - pulseBlend * 0.7), glowLightness);
        _tmpColor.multiplyScalar(glowBoost);

        // Color
        pooled.material.color.copy(_tmpColor);

        // Opacity: fade in as shapes approach, fade out after passing camera
        if (z > 0) {
          pooled.material.opacity = Math.max(0, 1 - z / fadeOutZ);
        } else {
          pooled.material.opacity = approachProgress;
        }
      }
      shapeIdx++;
    }
  });

  return <group ref={groupRef} />;
}

export const ShapeFlight: Instrument = {
  id: 'shapeFlight',
  name: 'Shape Flight',
  description: 'Spirograph shapes stream toward the camera during MIDI notes, dissolving on arrival',
  icon: '🔷',
  color: '#8b5cf6',
  hasAudio: false,
  hasVisual: true,
  editorType: 'generic',

  noteRange: { min: 0, max: 96 },
  rangeLabels: [
    { startPitch: 0, endPitch: 5, label: 'Wave' },
    { startPitch: 6, endPitch: 11, label: 'Warp' },
    { startPitch: 12, endPitch: 23, label: 'Shake' },
    { startPitch: 24, endPitch: 35, label: 'Pulse' },
    { startPitch: 36, endPitch: 84, label: 'Shapes' },
    { startPitch: 85, endPitch: 96, label: 'Glow' },
  ],

  defaultSettings: {
    speed: 12,
    spread: 0,
    farZ: 40,
    shapeSize: 0.4,
    shapeMode: 'spirograph',
    spawnRate: 8,
    scale: 1,
    rotationStep: 0.15,
    fadeOutZ: 10,
    hueStep: 0.08,
    baseHue: 0.55,
    saturation: 0.9,
    lightness: 0.85,
    rBase: 0.25,
    dBase: 0.7,
    pulseSpeed: 200,
    pulseDuration: 0.4,
    pulseHue: 0.25,
    shakeAmount: 0.5,
    shakeDecay: 20,
    shakeScale: 0.5,
    burstMode: 'noisy',
    burstRadius: 3,
    burstTwists: 4,
    curveX: 0,
    curveY: 0,
    wobbleAmp: 0.15,
    warpAmp: 0.25,
    glowAmount: 1,
    glowPulseAmount: 3,
    glowPulseDecay: 8,
    approachGrowth: 0,
  },

  settingsSchema: {
    shapeMode:     { type: 'select', label: 'Shape Mode', options: [{ value: 'spirograph', label: 'Spirograph' }, { value: 'polygon', label: 'Polygon' }, { value: 'polar', label: 'Polar Graph' }], default: 'spirograph' },
    speed:         { type: 'number', label: 'Flight Speed',      min: 2,    max: 40,   step: 1,     default: 12 },
    spawnRate:     { type: 'number', label: 'Copies per Beat',    min: 1,    max: 32,   step: 1,     default: 8 },
    scale:         { type: 'number', label: 'Scale',              min: 0.1,  max: 5,    step: 0.1,   default: 1 },
    rotationStep:  { type: 'number', label: 'Rotation Step',      min: -1,   max: 1,    step: 0.01,  default: 0.15 },
    spread:        { type: 'number', label: 'Spread',             min: 0,    max: 10,   step: 0.5,   default: 0 },
    farZ:          { type: 'number', label: 'Spawn Depth',        min: 10,   max: 100,  step: 5,     default: 40 },
    shapeSize:     { type: 'number', label: 'Shape Size',         min: 0.1,  max: 2,    step: 0.1,   default: 0.4 },
    fadeOutZ:      { type: 'number', label: 'Fade Out Distance',  min: 2,    max: 30,   step: 1,     default: 10 },
    hueStep:       { type: 'number', label: 'Hue Step',           min: 0,    max: 0.5,  step: 0.01,  default: 0.08 },
    baseHue:       { type: 'number', label: 'Base Hue',           min: 0,    max: 1,    step: 0.05,  default: 0.55 },
    saturation:    { type: 'number', label: 'Saturation',         min: 0,    max: 1,    step: 0.05,  default: 0.9 },
    lightness:     { type: 'number', label: 'Lightness',          min: 0.1,  max: 1,    step: 0.05,  default: 0.85 },
    rBase:         { type: 'number', label: 'R Base',              min: 0.05, max: 0.5,  step: 0.01,  default: 0.25 },
    dBase:         { type: 'number', label: 'D Base',              min: 0.1,  max: 1.0,  step: 0.05,  default: 0.7 },
    pulseSpeed:    { type: 'number', label: 'Pulse Speed',         min: 5,    max: 500,  step: 5,     default: 200 },
    pulseDuration: { type: 'number', label: 'Pulse Duration',      min: 0.1,  max: 2,    step: 0.05,  default: 0.4 },
    pulseHue:      { type: 'number', label: 'Pulse Hue Jump',        min: -0.5, max: 0.5,  step: 0.05,  default: 0.25 },
    shakeAmount:   { type: 'number', label: 'Shake Amount',        min: 0.1,  max: 3,    step: 0.1,   default: 0.5 },
    shakeDecay:    { type: 'number', label: 'Shake Decay',         min: 5,    max: 50,   step: 1,     default: 20 },
    shakeScale:    { type: 'number', label: 'Shake Scale Bump',    min: 0,    max: 2,    step: 0.1,   default: 0.5 },
    burstMode:     { type: 'select', label: 'Burst Mode', options: [{ value: 'noisy', label: 'Noisy (Random)' }, { value: 'linear', label: 'Linear Radial' }, { value: 'spiralOut', label: 'Spiral Out' }, { value: 'spiralIn', label: 'Spiral In' }], default: 'noisy' },
    burstRadius:   { type: 'number', label: 'Burst Radius',        min: 0.5,  max: 10,   step: 0.5,   default: 3 },
    burstTwists:   { type: 'number', label: 'Burst Twists',        min: 1,    max: 12,   step: 0.5,   default: 4 },
    curveX:        { type: 'number', label: 'Path Curve X',        min: -20,  max: 20,   step: 0.5,   default: 0 },
    curveY:        { type: 'number', label: 'Path Curve Y',        min: -20,  max: 20,   step: 0.5,   default: 0 },
    wobbleAmp:     { type: 'number', label: 'Wave Wobble Amp',     min: 0.01, max: 1,    step: 0.01,  default: 0.15 },
    warpAmp:       { type: 'number', label: 'Warp Wobble Amp',     min: 0.01, max: 1,    step: 0.01,  default: 0.25 },
    glowAmount:    { type: 'number', label: 'Glow Amount',          min: 0.2,  max: 5,    step: 0.1,   default: 1 },
    glowPulseAmount: { type: 'number', label: 'Glow Pulse Amount', min: 0.5,  max: 15,   step: 0.5,   default: 3 },
    glowPulseDecay:  { type: 'number', label: 'Glow Pulse Decay',  min: 1,    max: 30,   step: 1,     default: 8 },
    approachGrowth:  { type: 'number', label: 'Approach Growth',    min: 0,    max: 20,   step: 0.5,   default: 0 },
  },

  colorRoleMapping: [
    { role: 'primary', param: 'baseHue',    type: 'hsl-hue' },
    { role: 'primary', param: 'saturation', type: 'hsl-sat' },
    { role: 'primary', param: 'lightness',  type: 'hsl-light' },
  ],

  VisualComponent: ShapeFlightVisual,
};
